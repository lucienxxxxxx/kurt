/**
 * Shared agent runtime setup used by both the TUI and the stdout chat: resolve
 * the effective settings (persisted config > env > defaults), build the model
 * and the sandboxed tool set. The API key is read from the env only.
 */

import {
  OpenAICompatModel,
  SeatbeltSandbox,
  DirectSandbox,
  ReadFileTool,
  WriteFileTool,
  ShellTool,
  CodeTool,
  WebSearchTool,
  DuckDuckGoSearch,
  type SandboxProvider,
  type Tool,
} from "kurt-agent";
import type { SessionWorkspace } from "kurt-agent";
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadConfig, type PersistedConfig } from "./config.ts";

/**
 * The agent's working area. "Path protocol over path discovery": the sandbox
 * only lets the agent write inside WORKSPACE_DIR (+ explicitly allowed dirs);
 * the agent acts on these injected paths rather than exploring the filesystem.
 */
export interface Workspace {
  root: string; // WORKSPACE_DIR — writable working dir
  importDir: string; // IMPORT_DIR — inputs (read-only by convention)
  exportDir: string; // EXPORT_DIR — deliverables (writable)
}

/** Resolve the working dir (default: cwd) and ensure import/ + export/ exist. */
export function resolveWorkspace(workspacePath?: string): Workspace {
  const root = resolve(workspacePath ?? process.cwd());
  const importDir = join(root, "import");
  const exportDir = join(root, "export");
  mkdirSync(importDir, { recursive: true });
  mkdirSync(exportDir, { recursive: true });
  return { root, importDir, exportDir };
}

/** Env vars injected into sandboxed subprocesses so scripts can use the paths. */
export function workspaceEnv(ws: Workspace): Record<string, string> {
  return { WORKSPACE_DIR: ws.root, IMPORT_DIR: ws.importDir, EXPORT_DIR: ws.exportDir };
}

/** Per-invocation launch options (parsed from CLI flags). */
export interface LaunchOptions {
  /** --workspace / --workplace <path>; default = cwd. */
  workspacePath?: string;
  /** --allow-write <path> (repeatable): extra writable dirs beyond the workspace. */
  allowWrite?: string[];
}

/** Pull --workspace/--workplace and --allow-write out of argv; rest is positional. */
export function parseLaunchFlags(argv: string[]): { options: LaunchOptions; positional: string[] } {
  const positional: string[] = [];
  const allowWrite: string[] = [];
  let workspacePath: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    const eq = arg.indexOf("=");
    const name = arg.startsWith("--") ? (eq >= 0 ? arg.slice(2, eq) : arg.slice(2)) : null;
    const value = (): string | undefined => (eq >= 0 ? arg.slice(eq + 1) : argv[++i]);
    if (name === "workspace" || name === "workplace") workspacePath = value();
    else if (name === "allow-write") {
      const v = value();
      if (v) allowWrite.push(v);
    } else positional.push(arg);
  }
  return { options: { workspacePath, allowWrite: allowWrite.length ? allowWrite : undefined }, positional };
}

export interface Settings {
  modelId: string;
  baseURL: string;
  contextLimit: number;
  effort: string;
  thinking: boolean;
  mode: "ask" | "agent" | "plan";
}

export interface ResolvedConfig extends Settings {
  apiKey: string | undefined;
  models: string[];
}

/** System prompt with the framework-injected working paths. */
export function systemPrompt(ws: Workspace): string {
  return [
    "You are kurt-agent, a concise coding assistant running locally.",
    "Tools: read_file, write_file, shell, run_code, web_search.",
    "shell and run_code are sandboxed and have no network; web_search is the only networked tool.",
    "",
    "Working paths (also exported as env vars to shell/run_code):",
    `- WORKSPACE_DIR = ${ws.root} — your writable working directory. Do all work here.`,
    `- IMPORT_DIR = ${ws.importDir} — inputs the user provides; READ ONLY, do not modify.`,
    `- EXPORT_DIR = ${ws.exportDir} — put deliverables/outputs here.`,
    "",
    "Path protocol over path discovery: the sandbox only allows writing inside WORKSPACE_DIR.",
    "Do NOT explore or write elsewhere; always act on these injected paths. Use relative paths",
    "or the env vars (e.g. $EXPORT_DIR). Prefer doing real work with the tools over guessing.",
    "Keep answers short.",
  ].join("\n");
}

/** Pure precedence: persisted config wins, then env, then defaults. */
export function resolveSettings(persisted: PersistedConfig, env: Record<string, string | undefined>): Settings {
  const modelId = persisted.model ?? env.DEEPSEEK_MODEL ?? "deepseek-v4-flash";
  return {
    modelId,
    baseURL: persisted.baseURL ?? env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com",
    contextLimit: persisted.context ?? num(env.DEEPSEEK_CONTEXT) ?? 128_000,
    effort: persisted.effort ?? env.DEEPSEEK_EFFORT ?? "medium",
    thinking:
      persisted.thinking ?? (env.DEEPSEEK_THINKING != null ? env.DEEPSEEK_THINKING === "1" : /reason|think/i.test(modelId)),
    mode: persisted.mode ?? "agent",
  };
}

export async function resolveConfig(): Promise<ResolvedConfig> {
  const settings = resolveSettings(await loadConfig(), process.env);
  const apiKey = process.env.DEEPSEEK_API_KEY ?? process.env.OPENAI_API_KEY;
  const models = [...new Set([settings.modelId, "deepseek-v4-flash", "deepseek-v4-pro"])];
  return { ...settings, apiKey, models };
}

export function modelFor(id: string, baseURL: string, apiKey: string): OpenAICompatModel {
  return new OpenAICompatModel({ name: "deepseek", baseURL, model: id, apiKey });
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
): Tool[] {
  const writable = [ws.root, ...allowWrite];
  const env = workspaceEnv(ws);
  return [
    new ReadFileTool({ cwd: ws.root }),
    new WriteFileTool({ roots: writable }),
    new ShellTool(sandbox, { cwd: ws.root, writablePaths: writable, env }),
    new CodeTool(sandbox, codeTemp, { writablePaths: writable, env }),
    new WebSearchTool(new DuckDuckGoSearch()),
  ];
}

function num(v: string | undefined): number | undefined {
  if (v == null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}
