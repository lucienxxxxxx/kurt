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
  DuckDuckGoSearch,
  sessionsDir,
  type Event,
  type ModelProvider,
  type Tool,
  type PermissionProvider,
  type PermissionDecision,
} from "kurt-agent";
import { kurtHome } from "kurt-agent";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { StepAccumulator } from "./events.ts";
import type { RunFrame } from "./types.ts";

/** The desktop's answer to an approval request. */
export type ApprovalDecision = "allow" | "always" | "deny";

interface PendingApproval {
  resolve: (d: PermissionDecision) => void;
  key: string;
}

/** Status surfaced to the desktop (never the key itself). */
export interface RuntimeInfo {
  hasKey: boolean;
  model: string;
}

/** Model config the desktop can set at runtime (key never leaves the machine). */
export interface ModelConfig {
  apiKey?: string;
  model?: string;
  baseURL?: string;
}

export interface Runtime {
  /** Working directory the agent operates in. */
  workspace: string;
  store: SessionStore;
  /** Mutable so `reconfigure` can swap the model when the key/model changes. */
  model: ModelProvider;
  /** Build the tool set for a run, gating sensitive ops through `permission`. */
  makeTools: (permission: PermissionProvider) => Tool[];
  system: string;
  /** In-flight approvals awaiting POST /approve, keyed by approval id. */
  pendingApprovals: Map<string, PendingApproval>;
  /** Rule keys the user chose "always allow" for (this bridge's lifetime). */
  allowlist: Set<string>;
  /** Status for GET /info (production runtime sets this). */
  info?: () => RuntimeInfo;
  /** Apply + persist model config and rebuild the model (POST /config). */
  reconfigure?: (patch: ModelConfig) => void;
}

export interface RunOptions {
  sessionId?: string;
  text: string;
  signal: AbortSignal;
  onFrame: (frame: RunFrame) => void;
}

export function createRuntime(opts: {
  workspace: string;
  model: ModelProvider;
  makeTools: (permission: PermissionProvider) => Tool[];
  system?: string;
  store?: SessionStore;
}): Runtime {
  return {
    workspace: opts.workspace,
    model: opts.model,
    makeTools: opts.makeTools,
    system: opts.system ?? defaultSystem(opts.workspace),
    store: opts.store ?? new SessionStore(),
    pendingApprovals: new Map(),
    allowlist: new Set(),
  };
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
  const rec = (opts.sessionId ? await rt.store.load(opts.sessionId) : null) ?? rt.store.create(rt.workspace, rt.model.name);
  rec.messages.push({ role: "user", content: [{ type: "text", text: opts.text }] });
  if (!rec.title) rec.title = opts.text.slice(0, 60).trim();
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

  const tools = rt.makeTools(permission);
  const acc = new StepAccumulator();
  const captured: Event[] = [];
  try {
    for await (const ev of runLoop({ system: rt.system, messages: rec.messages, tools, model: rt.model, signal: opts.signal })) {
      captured.push(ev);
      for (const step of acc.apply(ev)) opts.onFrame({ kind: "step", step });
      if (ev.type === "usage") opts.onFrame({ kind: "usage", inputTokens: ev.inputTokens, outputTokens: ev.outputTokens, totalTokens: ev.totalTokens });
      else if (ev.type === "aborted") opts.onFrame({ kind: "aborted", reason: ev.reason });
      else if (ev.type === "error") opts.onFrame({ kind: "error", message: ev.message });
    }
    rec.messages.push(...messagesFromEvents(captured));
    await rt.store.save(rec);
    opts.onFrame({ kind: "done" });
  } catch (err) {
    opts.onFrame({ kind: "error", message: err instanceof Error ? err.message : String(err) });
  }
}

function defaultSystem(workspace: string): string {
  return [
    "You are Kurt, a concise desktop coding/automation assistant.",
    "Use the available tools to actually do the work; show your steps.",
    `WORKSPACE_DIR = ${workspace} — read inputs and write outputs here.`,
  ].join("\n");
}

/** Desktop model config, persisted at ~/.kurt/desktop.json (mode 0600). The API
 *  key is set in-app (Settings) — env wins when present (dev), else the saved file.
 *  NOTE: plaintext on disk for now; Keychain is a later hardening. */
function configPath(): string {
  return join(kurtHome(), "desktop.json");
}
function loadConfig(): Required<ModelConfig> {
  let saved: ModelConfig = {};
  try { saved = JSON.parse(readFileSync(configPath(), "utf8")) as ModelConfig; } catch { /* none */ }
  return {
    apiKey: process.env.DEEPSEEK_API_KEY ?? process.env.OPENAI_API_KEY ?? saved.apiKey ?? "",
    model: saved.model ?? process.env.DEEPSEEK_MODEL ?? "deepseek-v4-flash",
    baseURL: saved.baseURL ?? process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com",
  };
}
function saveConfig(cfg: Required<ModelConfig>): void {
  const path = configPath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(cfg, null, 2), { mode: 0o600 });
}

/** Build the real runtime from the environment + ~/.kurt config (DeepSeek; core tools; ~/.kurt sessions). */
export function productionRuntime(workspace = process.cwd()): Runtime {
  const cfg = loadConfig();
  const buildModel = (): ModelProvider =>
    withRetry(new OpenAICompatModel({ name: "deepseek", baseURL: cfg.baseURL, model: cfg.model, apiKey: cfg.apiKey }));
  const model = buildModel();
  const sandbox = process.platform === "darwin" ? new SeatbeltSandbox() : new DirectSandbox();
  const codeTemp = new SessionWorkspace({ sessionId: "bridge" });
  const writable = [workspace];
  const env = { WORKSPACE_DIR: workspace };

  // Tools are rebuilt per run so the sensitive-command gate (ShellTool's permission)
  // is bound to that run's SSE stream → approval prompts reach the right desktop run.
  const makeTools = (permission: PermissionProvider): Tool[] => [
    new ReadFileTool({ roots: writable }),
    new LsTool({ roots: writable }),
    new GrepTool({ roots: writable }),
    new WriteFileTool({ roots: writable }),
    new ShellTool(sandbox, { cwd: workspace, writablePaths: writable, env, permission }),
    new CodeTool(sandbox, codeTemp, { writablePaths: writable, env, cwd: workspace }),
    new WebSearchTool(new DuckDuckGoSearch()),
    new MemoryTool({ globalPath: join(homedir(), ".kurt", "memory.md"), projectPath: join(workspace, ".kurt", "memory.md") }),
  ];

  const rt = createRuntime({ workspace, model, makeTools, store: new SessionStore(sessionsDir()) });
  rt.info = () => ({ hasKey: cfg.apiKey.length > 0, model: cfg.model });
  rt.reconfigure = (patch) => {
    if (patch.apiKey !== undefined) cfg.apiKey = patch.apiKey;
    if (patch.model) cfg.model = patch.model;
    if (patch.baseURL) cfg.baseURL = patch.baseURL;
    saveConfig(cfg);
    rt.model = buildModel(); // take effect immediately (no restart)
  };
  return rt;
}
