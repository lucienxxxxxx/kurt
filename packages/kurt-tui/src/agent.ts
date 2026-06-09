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
import { loadConfig, type PersistedConfig } from "./config.ts";

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

export const SYSTEM = [
  "You are kurt-agent, a concise coding assistant running locally.",
  "You have tools: read_file, write_file, shell, run_code, web_search.",
  "shell and run_code are sandboxed (filesystem read-only except a private temp",
  "workspace, no network). web_search is the only networked tool.",
  "Prefer doing real work with the tools over guessing. Keep answers short.",
].join(" ");

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

export function makeTools(sandbox: SandboxProvider, workspace: SessionWorkspace): Tool[] {
  return [
    new ReadFileTool(),
    new WriteFileTool({ roots: [workspace.root] }),
    new ShellTool(sandbox, { cwd: process.cwd(), writablePaths: [workspace.root] }),
    new CodeTool(sandbox, workspace),
    new WebSearchTool(new DuckDuckGoSearch()),
  ];
}

function num(v: string | undefined): number | undefined {
  if (v == null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}
