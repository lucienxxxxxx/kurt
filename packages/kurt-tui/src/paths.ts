/**
 * Where kurt keeps its global state. Everything lives under ~/.kurt/ (override
 * the whole home with KURT_HOME, used by tests):
 *
 *   ~/.kurt/config.json     global settings (model/effort/…)
 *   ~/.kurt/sessions/        saved conversations (<id>.json)
 *   ~/.kurt/memory.md        global memory, preloaded into the system prompt
 *   ~/.kurt/mcp.json         global MCP servers ({ "mcpServers": {...} })
 *
 * Project-scoped state lives under <workspace>/.kurt/ instead:
 *   <workspace>/.kurt/allowlist.json   command allowlist (see allowlist.ts)
 *   <workspace>/.kurt/rules.md         project rules, preloaded into the prompt
 *   <workspace>/.kurt/mcp.json         project MCP servers (override global)
 */

import { homedir } from "node:os";
import { join } from "node:path";

export function kurtHome(): string {
  return process.env.KURT_HOME ?? join(homedir(), ".kurt");
}

export function sessionsDir(): string {
  return join(kurtHome(), "sessions");
}

/** Global memory file (read-only preload for now). */
export function globalMemoryPath(): string {
  return join(kurtHome(), "memory.md");
}

/** Project-scoped rules file under the workspace's .kurt/ (user-authored). */
export function projectRulesPath(workspaceRoot: string): string {
  return join(workspaceRoot, ".kurt", "rules.md");
}

/** Project-scoped agent memory under the workspace's .kurt/ (agent-written). */
export function projectMemoryPath(workspaceRoot: string): string {
  return join(workspaceRoot, ".kurt", "memory.md");
}

/** Global MCP server config (~/.kurt/mcp.json). */
export function globalMcpConfigPath(): string {
  return join(kurtHome(), "mcp.json");
}

/** Project-scoped MCP server config under the workspace's .kurt/ (overrides global). */
export function projectMcpConfigPath(workspaceRoot: string): string {
  return join(workspaceRoot, ".kurt", "mcp.json");
}
