/**
 * Runtime — the bridge's composition root. Builds the engine (model + tools +
 * sandbox + shared SessionStore) and runs one turn, translating the engine's
 * Event stream into wire `RunFrame`s via the StepAccumulator.
 *
 * Tools are built PER RUN (`makeTools(permission)`) so each run gets a permission
 * provider bound to its own SSE stream: a sensitive command emits an `approval`
 * frame and blocks until the desktop answers via POST /approve (see resolveApproval).
 *
 * `createRuntime` is generic (model/tools injected → unit-testable with MockModel).
 * `productionRuntime` wires the real DeepSeek model + a core tool set.
 */

import {
  runLoop,
  messagesFromEvents,
  SessionStore,
  SessionWorkspace,
  SeatbeltSandbox,
  DirectSandbox,
  OpenAICompatModel,
  withRetry,
  ReadFileTool,
  LsTool,
  GrepTool,
  WriteFileTool,
  ShellTool,
  CodeTool,
  WebSearchTool,
  MemoryTool,
  UpdatePlanTool,
  RequestAccessTool,
  AskUserTool,
  DuckDuckGoSearch,
  sessionsDir,
  type Event,
  type Message,
  type ModelProvider,
  type ModelRequest,
  type Tool,
  type PermissionProvider,
  type PermissionDecision,
  type AskProvider,
  type AccessGrants,
} from "kurt-agent";
import { kurtHome } from "kurt-agent";
import { join, dirname } from "node:path";
import { homedir, hostname, platform, release, arch, userInfo, tmpdir } from "node:os";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { StepAccumulator, planFromInput } from "./events.ts";
import { normalizeConfig, mergeConfig, resolveModel, allModels, providerGroups, defaultModel, enabledProviders, type DesktopConfig } from "./providers.ts";
import type { RunFrame } from "./types.ts";

/** The desktop's answer to an approval request. */
export type ApprovalDecision = "allow" | "always" | "deny";

/** Operating mode (mirrors kurt-tui): chat = read-only, plan = +planning, agent = full. */
export type Mode = "chat" | "agent" | "plan";

// request_write_access + ask_user are in every mode: both are safe (gated / just a
// prompt) and useful regardless of whether the agent can also write or run things.
const READ_ONLY = ["read_file", "ls", "grep", "web_search", "memory", "request_write_access", "ask_user"];
const MODE_TOOLS: Record<Mode, "all" | string[]> = {
  agent: "all",
  chat: READ_ONLY,
  plan: [...READ_ONLY, "update_plan"],
};

function toolsForMode(tools: Tool[], mode: Mode): Tool[] {
  const allow = MODE_TOOLS[mode];
  return allow === "all" ? tools : tools.filter((t) => allow.includes(t.spec.name));
}

/** Per-mode guidance appended to the base system prompt. */
function modeGuidance(mode: Mode): string {
  switch (mode) {
    case "chat":
      return "\n\nMODE: chat — read and explain only. You can read/search (read_file/ls/grep/web_search) and use memory, but you CANNOT write files or run commands.";
    case "plan":
      return "\n\nMODE: plan — investigate, then produce a step-by-step plan with the update_plan tool. You CANNOT write files or run commands — you plan, you don't execute.";
    case "agent":
      return "\n\nMODE: agent — the full tool set is available; act directly to accomplish the task.";
  }
}

interface PendingApproval {
  resolve: (d: PermissionDecision) => void;
  key: string;
}

/** Status surfaced to the desktop (never the key itself). */
export interface RuntimeInfo {
  hasKey: boolean;
  model: string;
  /** Selectable model ids for the composer's model menu (flat union, back-compat). */
  models: string[];
  /** Models grouped by enabled provider (for the grouped model dropdown). */
  providers: { id: string; label: string; models: string[] }[];
  /** This bridge's workspace root — the desktop uses it for the Files tab and the
   *  terminal's cwd. */
  workspace: string;
}

/** Model ids the desktop can pick from (DeepSeek; matches kurt-agent capabilities). */
export const KNOWN_MODELS = ["deepseek-v4-flash", "deepseek-v4-pro"];

/** Model config the desktop can set at runtime (lives in ~/.kurt/desktop.json). */
export interface ModelConfig {
  apiKey?: string;
  baseURL?: string;
  /** Selectable model ids (the composer's model menu); the first is the default. */
  models?: string[];
  /** Wire format. Only "openai" is implemented today; "claude" is stored for later. */
  format?: "openai" | "claude";
}

export interface Runtime {
  /** Working directory the agent operates in. */
  workspace: string;
  store: SessionStore;
  /** Mutable so `reconfigure` can swap the model when the key/model changes. */
  model: ModelProvider;
  /** Build the tool set for a run rooted at `workspace`: `permission` gates
   *  sensitive ops, `ask` lets the agent put a question to the user (ask_user). */
  makeTools: (permission: PermissionProvider, ask: AskProvider, workspace: string) => Tool[];
  system: string;
  /** Build the base system prompt for a given workspace (per-conversation). When
   *  absent, runTurn uses the fixed `system`. */
  systemFor?: (workspace: string) => string;
  /** In-flight approvals awaiting POST /approve, keyed by approval id. */
  pendingApprovals: Map<string, PendingApproval>;
  /** In-flight ask_user questions awaiting POST /answer, keyed by ask id. */
  pendingAsks: Map<string, { resolve: (answer: string) => void }>;
  /** Rule keys the user chose "always allow" for (this bridge's lifetime). */
  allowlist: Set<string>;
  /** Status for GET /info (production runtime sets this). */
  info?: () => RuntimeInfo;
  /** Apply + persist model config and rebuild the model (POST /config). */
  reconfigure?: (patch: Partial<DesktopConfig>) => void;
  /** Full current config for GET /config (the raw desktop.json, incl. keys —
   *  this is a localhost bridge for the machine's own user). */
  fullConfig?: () => DesktopConfig;
  /** Build a model for one run with the given model id / effort / thinking (current key/baseURL). */
  modelFor?: (model?: string, effort?: string, thinking?: boolean) => ModelProvider;
  /** Summarize a new conversation into a short title (production runtime sets this;
   *  when absent, runTurn falls back to the first user message). */
  makeTitle?: (messages: Message[]) => Promise<string>;
}

export interface RunOptions {
  sessionId?: string;
  text: string;
  /** Per-run model id / effort / thinking / mode from the composer menus (optional). */
  model?: string;
  effort?: string;
  thinking?: boolean;
  mode?: Mode;
  /** The conversation's chosen workspace (folder picker). Falls back to the
   *  session's stored workspace, then the bridge default. */
  workspace?: string;
  signal: AbortSignal;
  onFrame: (frame: RunFrame) => void;
}

export function createRuntime(opts: {
  workspace: string;
  model: ModelProvider;
  makeTools: (permission: PermissionProvider, ask: AskProvider, workspace: string) => Tool[];
  system?: string;
  store?: SessionStore;
  makeTitle?: (messages: Message[]) => Promise<string>;
}): Runtime {
  return {
    workspace: opts.workspace,
    model: opts.model,
    makeTools: opts.makeTools,
    system: opts.system ?? defaultSystem(opts.workspace),
    store: opts.store ?? new SessionStore(),
    pendingApprovals: new Map(),
    pendingAsks: new Map(),
    allowlist: new Set(),
    makeTitle: opts.makeTitle,
  };
}

/** Resolve a pending ask_user question (called by POST /answer). Returns false if unknown. */
export function resolveAsk(rt: Runtime, id: string, answer: string): boolean {
  const pending = rt.pendingAsks.get(id);
  if (!pending) return false;
  rt.pendingAsks.delete(id);
  pending.resolve(answer);
  return true;
}

/** Resolve a pending approval (called by POST /approve). Returns false if unknown. */
export function resolveApproval(rt: Runtime, id: string, decision: ApprovalDecision): boolean {
  const pending = rt.pendingApprovals.get(id);
  if (!pending) return false;
  rt.pendingApprovals.delete(id);
  if (decision === "always") rt.allowlist.add(pending.key);
  pending.resolve(decision === "deny" ? "deny" : "allow");
  return true;
}

/**
 * Run one turn against a session: load (or create) history, append the user
 * message, stream engine events out as frames, then persist the new messages.
 * Never throws — failures surface as an `error` frame.
 */
export async function runTurn(rt: Runtime, opts: RunOptions): Promise<void> {
  const rec = (opts.sessionId ? await rt.store.load(opts.sessionId) : null) ?? rt.store.create(opts.workspace || rt.workspace, rt.model.name);
  // The conversation owns its workspace: a picked one (opts) wins, else the session's
  // stored one, else the bridge default. Keep the record in sync so the picker can
  // change an existing conversation's workspace and it persists with the session.
  const ws = opts.workspace || rec.workspace || rt.workspace;
  rec.workspace = ws;
  const isNewSession = !rec.title; // brand-new conversation → title is auto-summarized after this turn
  rec.messages.push({ role: "user", content: [{ type: "text", text: opts.text }] });
  if (isNewSession) {
    // Temp title = the start of the user's message, PERSISTED right away so the new
    // session shows up in the sidebar immediately (it isn't otherwise saved until the
    // turn ends). The LLM auto-summary replaces it once the turn completes (below).
    rec.title = opts.text.slice(0, 60).trim();
    await rt.store.save(rec);
  }
  opts.onFrame({ kind: "session", id: rec.id, title: rec.title });

  // Per-run permission: known-allowed keys pass; otherwise emit an approval frame
  // and block until the desktop answers (or the run aborts → deny).
  const permission: PermissionProvider = {
    async request(req): Promise<PermissionDecision> {
      if (rt.allowlist.has(req.key)) return "allow";
      const id = crypto.randomUUID();
      const decision = new Promise<PermissionDecision>((resolve) => {
        rt.pendingApprovals.set(id, { resolve, key: req.key });
      });
      opts.onFrame({ kind: "approval", id, key: req.key, title: req.title, command: req.command, explanation: req.explanation, risk: req.risk });
      const onAbort = (): void => {
        const p = rt.pendingApprovals.get(id);
        if (p) { rt.pendingApprovals.delete(id); p.resolve("deny"); }
      };
      opts.signal.addEventListener("abort", onAbort, { once: true });
      try {
        return await decision;
      } finally {
        opts.signal.removeEventListener("abort", onAbort);
      }
    },
  };

  // Per-run ask_user: emit an `ask` frame and block until the desktop answers
  // (POST /answer), or the run aborts → empty answer (skipped).
  const ask: AskProvider = {
    async ask(req, signal): Promise<string> {
      const id = crypto.randomUUID();
      const answer = new Promise<string>((resolve) => {
        rt.pendingAsks.set(id, { resolve });
      });
      opts.onFrame({ kind: "ask", id, question: req.question, options: req.options });
      const onAbort = (): void => {
        const p = rt.pendingAsks.get(id);
        if (p) { rt.pendingAsks.delete(id); p.resolve(""); }
      };
      signal?.addEventListener("abort", onAbort, { once: true });
      try {
        return await answer;
      } finally {
        signal?.removeEventListener("abort", onAbort);
      }
    },
  };

  const mode: Mode = opts.mode ?? "agent";
  const tools = toolsForMode(rt.makeTools(permission, ask, ws), mode);
  // Base prompt is rooted at THIS conversation's workspace; then a fresh environment
  // block (current time + the user's system) appended every run.
  const base = rt.systemFor ? rt.systemFor(ws) : rt.system;
  const system = base + environmentContext() + modeGuidance(mode);
  // Per-run model override from the composer menus (falls back to the configured model).
  const override = opts.model || opts.effort || opts.thinking !== undefined;
  const model = override && rt.modelFor ? rt.modelFor(opts.model, opts.effort, opts.thinking) : rt.model;
  const acc = new StepAccumulator();
  const captured: Event[] = [];
  try {
    for await (const ev of runLoop({ system, messages: rec.messages, tools, model, signal: opts.signal })) {
      captured.push(ev);
      for (const step of acc.apply(ev)) opts.onFrame({ kind: "step", step });
      if (ev.type === "tool_call" && ev.name === "update_plan") {
        const steps = planFromInput(ev.input);
        if (steps.length) opts.onFrame({ kind: "plan", steps });
      }
      if (ev.type === "usage") opts.onFrame({ kind: "usage", inputTokens: ev.inputTokens, outputTokens: ev.outputTokens, totalTokens: ev.totalTokens });
      else if (ev.type === "aborted") opts.onFrame({ kind: "aborted", reason: ev.reason });
      else if (ev.type === "error") opts.onFrame({ kind: "error", message: ev.message });
    }
    rec.messages.push(...messagesFromEvents(captured));
    // Replace the temp (first-message) title with a concise auto-summary. Keep the
    // temp title if there's no summarizer, it fails, or the run was aborted.
    if (isNewSession && rt.makeTitle && !opts.signal.aborted) {
      try {
        const summary = (await rt.makeTitle(rec.messages)).trim();
        if (summary) rec.title = summary;
      } catch { /* keep the temp title */ }
    }
    await rt.store.save(rec);
    opts.onFrame({ kind: "done" });
  } catch (err) {
    opts.onFrame({ kind: "error", message: err instanceof Error ? err.message : String(err) });
  }
}

/** A fresh "# Environment" block (current time + the user's machine) appended to
 *  the system prompt every run, so the model is grounded in the here-and-now.
 *  Lives in the orchestration layer (this is I/O — never in the engine). */
function environmentContext(): string {
  const now = new Date();
  const tz = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return ""; } })();
  const osName = ({ darwin: "macOS", win32: "Windows", linux: "Linux" } as Record<string, string>)[platform()] ?? platform();
  let user = "";
  try { user = userInfo().username; } catch { /* sandboxed — skip */ }
  const lines = [
    "",
    "# Environment",
    `Current time: ${now.toString()}${tz ? ` (${tz})` : ""}`,
    `Operating system: ${osName} ${release()} (${arch()})`,
    user ? `User: ${user}` : "",
    `Host: ${hostname()}`,
    "Use this for time-relative reasoning and to tailor commands/paths to the user's OS.",
  ];
  return lines.filter(Boolean).join("\n") + "\n";
}

function defaultSystem(workspace: string): string {
  return [
    "# Who you are",
    "You are Kurt — a cognitive partner that thinks and explores WITH the user, not a tool that",
    "replaces their judgment. You have no consciousness and you never override the user's decisions.",
    "You help them understand complex problems, connect scattered information, and see one thing",
    "from several angles.",
    "",
    "# Our relationship",
    "This is two kinds of cognitive system collaborating — not merely 'user and tool':",
    "- The user owns the goals, the values, the creativity, and the final decision.",
    "- You own information organization, logical reasoning, knowledge connection, and exploring options.",
    "The user sets the direction; you help them see more of what's possible.",
    "",
    "# How you think",
    "- Understand the essence; don't stop at the surface.",
    "- Find the logic; don't pile up opinions.",
    "- Explore possibilities; don't rush to a conclusion.",
    "Be efficient on simple questions, go deep on complex ones, and for important decisions lay out",
    "the benefits, the risks, and the hidden assumptions. A good answer often starts with a good",
    "question: when it helps, break the problem down, surface blind spots, and challenge assumptions —",
    "but stay concise and never lecture. Reply in the user's language.",
    "",
    "# How you act (this desktop app)",
    "You can actually do the work through tools — show your steps as you go.",
    `WORKSPACE_DIR = ${workspace} — read inputs and write outputs here.`,
    "Sandbox: you can READ anywhere, but some capabilities are off by default. Use request_access",
    "to ask the user (one approval, lasts the session):",
    "- WRITE outside WORKSPACE_DIR (writes are confined to the workspace + system temp): ",
    "  request_access({kind:'write', target:'<abs dir>'}), then retry the write.",
    "- NETWORK for shell/run_code (npm install, curl, git, etc.): request_access({kind:'network'}).",
    "- OPEN a file or URL in the user's default app (great for delivering results): ",
    "  request_access({kind:'open', target:'<abs path or url>'}).",
    "Request BEFORE attempting — don't wait to fail. If shell/run_code fails with 'Operation not",
    "permitted' / 'Read-only file system' / a network error, that's the sandbox: request_access for",
    "the capability and retry. Never claim you lack a tool — request_access is always available.",
  ].join("\n");
}

/** Desktop model config, persisted at ~/.kurt/desktop.json (mode 0600). The API
 *  key is set in-app (Settings) — env wins when present (dev), else the saved file.
 *  NOTE: plaintext on disk for now; Keychain is a later hardening. */
function configPath(): string {
  return join(kurtHome(), "desktop.json");
}
function loadConfig(): DesktopConfig {
  let raw: unknown = {};
  try { raw = JSON.parse(readFileSync(configPath(), "utf8")); } catch { /* none */ }
  return normalizeConfig(raw);
}
function saveConfig(cfg: DesktopConfig): void {
  const path = configPath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(cfg, null, 2), { mode: 0o600 });
}

/** A stand-in model that just streams a message (used when no provider is usable,
 *  or for `claude` until the native Anthropic provider lands). Never hits network. */
function unavailableModel(message: string): ModelProvider {
  return {
    name: "unavailable",
    async countTokens() { return 0; },
    // eslint-disable-next-line require-yield
    async *stream() {
      yield { type: "text_delta", text: `⚠ ${message}` };
      yield { type: "done", stopReason: "end_turn" };
    },
  };
}

/** Open a file/URL in the user's default app (the `open` capability). Composition
 *  -layer I/O injected into RequestAccessTool so the engine stays I/O-free. */
async function openInDefaultApp(target: string): Promise<void> {
  const cmd = process.platform === "darwin" ? ["open", target]
    : process.platform === "win32" ? ["cmd", "/c", "start", "", target]
    : ["xdg-open", target];
  const proc = Bun.spawn(cmd, { stdout: "ignore", stderr: "ignore" });
  await proc.exited;
}

/** Build the real runtime from the environment + ~/.kurt config (multi-provider). */
export function productionRuntime(workspace = process.cwd()): Runtime {
  let cfg = loadConfig();
  // Route a model id to its provider and build the right client. OpenAI/DeepSeek/
  // custom(openai) use the OpenAI-compatible client; `claude` (native Anthropic)
  // lands in Phase 2 — for now it streams a clear "not yet wired" message.
  const buildModel = (modelId: string = defaultModel(cfg), effort?: string, thinking?: boolean): ModelProvider => {
    const p = resolveModel(cfg, modelId);
    if (!p) return unavailableModel("No model provider is enabled. Add an API key in Settings → Model / API.");
    const id = modelId || p.models[0] || "";
    if (p.format === "claude") return unavailableModel(`Claude (native Anthropic) is coming in the next update. For now use OpenAI / DeepSeek, or point a Custom provider at an OpenAI-compatible gateway.`);
    return withRetry(new OpenAICompatModel({ name: p.id, baseURL: p.baseURL, model: id, apiKey: p.apiKey, effort, thinking }));
  };
  const model = buildModel();
  const sandbox = process.platform === "darwin" ? new SeatbeltSandbox() : new DirectSandbox();
  const codeTemp = new SessionWorkspace({ sessionId: "bridge" });
  // Session-scoped capability grants (request_access widens these; they persist for
  // this bridge's lifetime and seed every run's sandbox policy).
  const grants: AccessGrants = { network: false, open: false, dirs: [] };

  // Tools are rebuilt per run rooted at THAT conversation's workspace (`ws`), so
  // file ops / shell / code / memory all operate where the conversation points.
  // (Also per-run so the sensitive-command gate binds to the run's SSE stream.)
  const makeTools = (permission: PermissionProvider, ask: AskProvider, ws: string): Tool[] => {
    // Writable = the conversation's workspace + the system temp dir + any dirs the
    // user has granted this session. Network/open stay off until granted. Anything
    // else needs request_access.
    const writable = [ws, tmpdir(), ...grants.dirs];
    const env = { WORKSPACE_DIR: ws };
    const network = (): boolean => grants.network;
    const access = new RequestAccessTool(writable, grants, { permission, opener: openInDefaultApp });
    // Back-compat alias: models that call `request_write_access` still work.
    const writeAlias: Tool = {
      spec: {
        name: "request_write_access",
        description: "Alias of request_access(kind:\"write\"): request write access to a directory outside the workspace.",
        inputSchema: { type: "object", properties: { directory: { type: "string" }, path: { type: "string" }, reason: { type: "string" } } },
      },
      execute: (input, ctx) => access.execute({ ...(input as object), kind: "write" }, ctx),
    };
    return [
      new ReadFileTool({ roots: writable }),
      new LsTool({ roots: writable }),
      new GrepTool({ roots: writable }),
      new WriteFileTool({ roots: writable }),
      new ShellTool(sandbox, { cwd: ws, writablePaths: writable, env, permission, allowNetwork: network }),
      new CodeTool(sandbox, codeTemp, { writablePaths: writable, env, cwd: ws, allowNetwork: network }),
      new WebSearchTool(new DuckDuckGoSearch()),
      new MemoryTool({ globalPath: join(homedir(), ".kurt", "memory.md"), projectPath: join(ws, ".kurt", "memory.md") }),
      new UpdatePlanTool(),
      // Generalized capability request: write a dir / network / open a file or app.
      access,
      writeAlias,
      // Lets the agent put a clarifying question to the user (answered via a popup).
      new AskUserTool(ask),
    ];
  };

  const rt = createRuntime({ workspace, model, makeTools, store: new SessionStore(sessionsDir()) });
  rt.systemFor = (ws) => defaultSystem(ws); // prompt rooted at the conversation's workspace
  rt.info = () => ({
    hasKey: enabledProviders(cfg).some((p) => p.apiKey.length > 0),
    model: defaultModel(cfg),
    models: allModels(cfg),
    providers: providerGroups(cfg),
    workspace: rt.workspace,
  });
  rt.fullConfig = () => cfg;
  rt.reconfigure = (patch) => {
    cfg = mergeConfig(cfg, patch);
    saveConfig(cfg);
    rt.model = buildModel(); // take effect immediately (no restart)
  };
  rt.modelFor = (modelId, effort, thinking) => buildModel(modelId || defaultModel(cfg), effort, thinking);
  // Auto-title: one cheap, tool-free model call summarizing the opening exchange.
  rt.makeTitle = async (messages) => {
    const req: ModelRequest = {
      system: "You write a very short title (3–6 words) capturing a conversation's topic. " +
        "Reply with ONLY the title — no quotes, no trailing punctuation — in the conversation's language.",
      messages: [{ role: "user", content: [{ type: "text", text: `Conversation:\n${transcriptFor(messages)}\n\nTitle:` }] }],
      tools: [],
    };
    let out = "";
    for await (const ev of rt.model.stream(req, new AbortController().signal)) {
      if (ev.type === "text_delta") out += ev.text;
    }
    return cleanTitle(out);
  };
  return rt;
}

/** A compact transcript of the opening turns, for the title prompt. */
function transcriptFor(messages: Message[]): string {
  return messages
    .slice(0, 6)
    .map((m) => {
      const text = m.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join(" ").trim();
      return text ? `${m.role}: ${text}` : "";
    })
    .filter(Boolean)
    .join("\n")
    .slice(0, 2000);
}

/** First line, unquoted, no trailing punctuation, capped — a clean title. */
function cleanTitle(raw: string): string {
  let t = (raw.split("\n").find((l) => l.trim()) ?? "").trim();
  t = t.replace(/^["'“”『「《]+|["'“”』」》]+$/g, "").trim();
  t = t.replace(/[。.!?！？,，、;；:：]+$/u, "").trim();
  return t.slice(0, 60);
}
