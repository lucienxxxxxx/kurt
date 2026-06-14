/**
 * Shared agent runtime setup used by both the TUI and the stdout chat: resolve
 * the effective settings (persisted config > env > defaults), build the model
 * and the sandboxed tool set. The API key is read from the env only.
 */

import {
  OpenAICompatModel,
  withRetry,
  capabilitiesFor,
  SeatbeltSandbox,
  DirectSandbox,
  ReadFileTool,
  WriteFileTool,
  ShellTool,
  CodeTool,
  WebSearchTool,
  RequestWriteAccessTool,
  LsTool,
  GrepTool,
  BrewTool,
  MemoryTool,
  AskUserTool,
  UpdatePlanTool,
  ToolHub,
  WorktreeManager,
  DuckDuckGoSearch,
  type SandboxProvider,
  type Tool,
  type PermissionProvider,
  type AskProvider,
  type ModelProvider,
} from "kurt-agent";
import type { SessionWorkspace } from "kurt-agent";
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadConfig, type PersistedConfig } from "./config.ts";
import { globalMemoryPath, kurtHome, projectMemoryPath } from "./paths.ts";

/**
 * The agent's working area: the whole working directory is writable. The agent
 * does all its work here (reads inputs, writes outputs) — no special import/
 * export subdirs. To write OUTSIDE it, the agent must request_write_access.
 */
export interface Workspace {
  root: string; // WORKSPACE_DIR — the writable working dir
}

/** Resolve the working dir (default: cwd). Creates it if a --workspace path is new. */
export function resolveWorkspace(workspacePath?: string): Workspace {
  const root = resolve(workspacePath ?? process.cwd());
  mkdirSync(root, { recursive: true });
  return { root };
}

/** Env var injected into sandboxed subprocesses so scripts can use the path. */
export function workspaceEnv(ws: Workspace): Record<string, string> {
  return { WORKSPACE_DIR: ws.root };
}

/** A per-session git worktree (process-level isolation for parallel/multi-agent work). */
export interface WorktreeSession {
  /** The worktree's working dir — use this as the agent's workspace. */
  root: string;
  /** The session branch (e.g. "kurt/abc123"). */
  branch: string;
  /** The shared repo this worktree belongs to. */
  repoRoot: string;
  /** Auto-commit the agent's changes to the branch at session end; returns a status line. */
  finish(): Promise<string>;
}

/**
 * If `--worktree` is set, create a per-session worktree under
 * `~/.kurt/worktrees/<repo>-<id>/` on a fresh `kurt/<id>` branch and return its
 * handle (the caller uses `.root` as the workspace, calls `.finish()` on exit).
 * Throws if the target isn't a git repo. Returns null when `--worktree` is off.
 */
export async function maybeWorktree(opts: LaunchOptions): Promise<WorktreeSession | null> {
  if (!opts.worktree) return null;
  const requested = resolve(opts.workspacePath ?? process.cwd());
  const repoRoot = await WorktreeManager.repoRoot(requested);
  if (!repoRoot) {
    throw new Error(
      `--worktree requires a git repository (none at ${requested}). Run \`git init\` there, or drop --worktree.`,
    );
  }
  const mgr = new WorktreeManager(repoRoot);
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const branch = `kurt/${id}`;
  const root = join(kurtHome(), "worktrees", `${mgr.repoName}-${id}`);
  await mgr.create({ path: root, branch });
  return {
    root,
    branch,
    repoRoot,
    finish: async () => {
      const committed = await mgr.commitAll(root, `kurt: session ${id}`);
      return committed
        ? `worktree committed → ${branch}\n  merge:  git -C ${repoRoot} merge ${branch}\n  remove: git -C ${repoRoot} worktree remove ${root}`
        : `worktree ${branch}: no changes to commit\n  remove: git -C ${repoRoot} worktree remove ${root}`;
    },
  };
}

/** Per-invocation launch options (parsed from CLI flags). */
export interface LaunchOptions {
  /** --workspace / --workplace <path>; default = cwd. */
  workspacePath?: string;
  /** --allow-write <path> (repeatable): extra writable dirs beyond the workspace. */
  allowWrite?: string[];
  /** --yes / -y: auto-approve sensitive commands (skip prompts). */
  yes?: boolean;
  /** --worktree: isolate this session in a per-session git worktree + branch. */
  worktree?: boolean;
}

/** Pull launch flags out of argv; the rest is positional (command + args). */
export function parseLaunchFlags(argv: string[]): { options: LaunchOptions; positional: string[] } {
  const positional: string[] = [];
  const allowWrite: string[] = [];
  let workspacePath: string | undefined;
  let yes = false;
  let worktree = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    const eq = arg.indexOf("=");
    const name = arg.startsWith("--") ? (eq >= 0 ? arg.slice(2, eq) : arg.slice(2)) : null;
    const value = (): string | undefined => (eq >= 0 ? arg.slice(eq + 1) : argv[++i]);
    if (name === "workspace" || name === "workplace") workspacePath = value();
    else if (name === "allow-write") {
      const v = value();
      if (v) allowWrite.push(v);
    } else if (name === "yes" || arg === "-y") yes = true;
    else if (name === "worktree") worktree = true;
    else positional.push(arg);
  }
  return {
    options: {
      workspacePath,
      allowWrite: allowWrite.length ? allowWrite : undefined,
      yes: yes || undefined,
      worktree: worktree || undefined,
    },
    positional,
  };
}

/** The three operating modes (structurally identical to the TUI's `ChatMode`). */
export type Mode = "chat" | "agent" | "plan";

export interface Settings {
  modelId: string;
  baseURL: string;
  contextLimit: number;
  maxTokens: number;
  effort: string;
  thinking: boolean;
  mode: Mode;
}

export interface ResolvedConfig extends Settings {
  apiKey: string | undefined;
  models: string[];
}

/** Per-mode guidance appended to the base prompt. */
function modeGuidance(mode: Mode): string[] {
  switch (mode) {
    case "chat":
      return [
        "MODE: chat. You can read and search (read_file/ls/grep/web_search) and use memory,",
        "but you CANNOT write files or run commands. Answer, explain, and explore. When the",
        "request is ambiguous or a choice is the user's, call ask_user to clarify.",
      ];
    case "plan":
      return [
        "MODE: plan. Investigate (read_file/ls/grep/web_search) and produce a step-by-step",
        "plan with the update_plan tool (keep it current). You CANNOT write files or run",
        "commands — you plan, you don't execute. Use ask_user to resolve unknowns before",
        "finalizing. End by presenting the plan and what running it (in agent mode) would do.",
      ];
    case "agent":
      return [
        "MODE: agent. Full tools available — act directly to accomplish the task. Use ask_user",
        "only when a decision is genuinely the user's to make.",
      ];
  }
}

/** System prompt with the framework-injected working dir and per-mode guidance. */
export function systemPrompt(ws: Workspace, mode: Mode = "agent"): string {
  return [
    "You are kurt-agent, a concise coding assistant running locally.",
    "Prefer the native read_file/ls/grep over shelling out for reads — they're confined to the workspace.",
    "shell and run_code are sandboxed and have no network; web_search and brew are the networked tools",
    "(brew runs outside the sandbox and asks for approval before installing/changing software).",
    "",
    ...modeGuidance(mode),
    "",
    "Memory: your memory (the `memory` tool) is preloaded above when present. Decide on your",
    "OWN initiative — without being asked — to save durable facts worth recalling later:",
    "the user's stated preferences, project conventions/commands, important decisions, and",
    "environment details. Use memory(action:'append'); scope 'project' for workspace-specific",
    "facts, 'global' for cross-project preferences. Skip transient task state and secrets.",
    "Curate with action:'replace' when it grows stale or repetitive.",
    "",
    `WORKSPACE_DIR = ${ws.root} (also exported as an env var to shell/run_code).`,
    "This is your working directory and it is fully writable — read inputs and write all outputs",
    "here. Use relative paths or $WORKSPACE_DIR. The sandbox blocks writes OUTSIDE it; if you",
    "genuinely need to write elsewhere (e.g. ~/Downloads), call request_write_access with that",
    "directory (the user approves), then retry. Don't explore the filesystem beyond what you need.",
    "Prefer doing real work with the tools over guessing. Keep answers short.",
  ].join("\n");
}

/** Pure precedence: persisted config wins, then env, then defaults. */
export function resolveSettings(persisted: PersistedConfig, env: Record<string, string | undefined>): Settings {
  const modelId = persisted.model ?? env.DEEPSEEK_MODEL ?? "deepseek-v4-flash";
  return {
    modelId,
    baseURL: persisted.baseURL ?? env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com",
    contextLimit: persisted.context ?? num(env.DEEPSEEK_CONTEXT) ?? 128_000,
    // Default to the model's real output ceiling (from capabilities) instead of a
    // tiny hardcoded cap, so large writes aren't truncated. persisted > env > metadata.
    maxTokens: persisted.maxTokens ?? num(env.DEEPSEEK_MAX_TOKENS) ?? capabilitiesFor(modelId).maxOutputTokens,
    effort: persisted.effort ?? env.DEEPSEEK_EFFORT ?? "medium",
    thinking:
      persisted.thinking ?? (env.DEEPSEEK_THINKING != null ? env.DEEPSEEK_THINKING === "1" : /reason|think/i.test(modelId)),
    mode: normalizeMode(persisted.mode),
  };
}

/** Map a stored/legacy mode to a current one ("ask" → "chat"); default "agent". */
export function normalizeMode(mode: string | undefined): Mode {
  if (mode === "ask" || mode === "chat") return "chat";
  if (mode === "plan") return "plan";
  return "agent";
}

export async function resolveConfig(): Promise<ResolvedConfig> {
  const settings = resolveSettings(await loadConfig(), process.env);
  const apiKey = process.env.DEEPSEEK_API_KEY ?? process.env.OPENAI_API_KEY;
  const models = [...new Set([settings.modelId, "deepseek-v4-flash", "deepseek-v4-pro"])];
  return { ...settings, apiKey, models };
}

/** Reasoning knobs threaded from the session into the provider. */
export interface ReasoningOptions {
  thinking?: boolean;
  effort?: string;
}

export function modelFor(
  id: string,
  baseURL: string,
  apiKey: string,
  maxTokens?: number,
  reasoning: ReasoningOptions = {},
): ModelProvider {
  const model = new OpenAICompatModel({
    name: "deepseek",
    baseURL,
    model: id,
    apiKey,
    maxTokens,
    thinking: reasoning.thinking,
    effort: reasoning.effort,
  });
  // Wrap every model call (all modes + compaction + titling) so transient API
  // failures (429/5xx/network) back off and retry instead of bubbling up.
  return withRetry(model);
}

export function makeSandbox(): SandboxProvider {
  return process.platform === "darwin" ? new SeatbeltSandbox() : new DirectSandbox();
}

/**
 * Build the sandboxed tool set rooted at the workspace.
 * @param codeTemp  ephemeral SessionWorkspace for run_code scripts (kept out of the user's dir)
 * @param ws        the agent's working area (WORKSPACE_DIR + import/export)
 * @param allowWrite extra writable dirs beyond the workspace (explicit escalation)
 */
export function makeTools(
  sandbox: SandboxProvider,
  codeTemp: SessionWorkspace,
  ws: Workspace,
  allowWrite: string[] = [],
  permission?: PermissionProvider,
  askProvider?: AskProvider,
): Tool[] {
  // Shared, mutable writable-roots — request_write_access pushes to this and the
  // file/exec tools (which read it live) immediately see the new dir.
  const writable = [ws.root, ...allowWrite];
  const env = workspaceEnv(ws);
  const tools: Tool[] = [
    // read/ls/grep are pure-fs and confined to the workspace (+ approved dirs) —
    // they share the same live `writable` roots array as write_file.
    new ReadFileTool({ roots: writable }),
    new LsTool({ roots: writable }),
    new GrepTool({ roots: writable }),
    new WriteFileTool({ roots: writable }),
    new ShellTool(sandbox, { cwd: ws.root, writablePaths: writable, env, permission }),
    // Scripts run WITH the workspace as CWD (relative paths resolve there); the
    // script files themselves stay in the session temp dir.
    new CodeTool(sandbox, codeTemp, { writablePaths: writable, env, cwd: ws.root }),
    // brew runs UNSANDBOXED (network + system writes) via a Direct runner, gated
    // by approval for mutating subcommands.
    new BrewTool(new DirectSandbox(), { cwd: ws.root, permission }),
    // Persistent memory (preloaded into the prompt next turn/session). Fixed files,
    // so no approval/confinement needed.
    new MemoryTool({ globalPath: globalMemoryPath(), projectPath: projectMemoryPath(ws.root) }),
    new WebSearchTool(new DuckDuckGoSearch()),
    // Planning checklist (mainly plan mode); stateless, shown via its tool result.
    new UpdatePlanTool(),
  ];
  // The agent-asks-user tool only works when there's a UI to answer it.
  if (askProvider) tools.push(new AskUserTool(askProvider));
  // The escalation tool only makes sense when there's an approver to ask.
  if (permission) tools.push(new RequestWriteAccessTool(writable, permission));
  return tools;
}

/** Tool names each mode exposes ("all" = the whole hub). */
export const TOOLS_BY_MODE: Record<Mode, readonly string[] | "all"> = {
  chat: ["read_file", "ls", "grep", "web_search", "memory", "ask_user"],
  plan: ["read_file", "ls", "grep", "web_search", "memory", "ask_user", "update_plan"],
  agent: "all",
};

/** Select the tools a given mode is allowed to use, from the shared hub. */
export function toolsForMode(hub: ToolHub, mode: Mode): Tool[] {
  const profile = TOOLS_BY_MODE[mode];
  return profile === "all" ? hub.all() : hub.get(profile);
}

function num(v: string | undefined): number | undefined {
  if (v == null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}
