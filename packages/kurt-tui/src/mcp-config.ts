/**
 * MCP server config loader. Reads the well-known `{ "mcpServers": {...} }` schema
 * from ~/.kurt/mcp.json (global) and <workspace>/.kurt/mcp.json (project), and
 * merges them — project entries override global ones by server name. Missing or
 * malformed files are tolerated (treated as empty), so a typo never blocks launch.
 *
 * Example mcp.json:
 *   {
 *     "mcpServers": {
 *       "filesystem": { "command": "npx", "args": ["-y","@modelcontextprotocol/server-filesystem","/data"] },
 *       "remote":     { "type": "http", "url": "https://mcp.example.com", "headers": { "Authorization": "Bearer ${TOKEN}" } }
 *     }
 *   }
 */

import type { McpServers, McpServerConfig } from "kurt-agent";
import { globalMcpConfigPath, projectMcpConfigPath } from "./paths.ts";

/** Parse a raw mcp.json object into validated server entries (junk dropped). */
export function parseMcpConfig(raw: unknown): McpServers {
  const servers = (raw as { mcpServers?: unknown })?.mcpServers;
  if (typeof servers !== "object" || servers === null) return {};
  const out: McpServers = {};
  for (const [name, value] of Object.entries(servers as Record<string, unknown>)) {
    const cfg = coerceServer(value);
    if (cfg) out[name] = cfg;
  }
  return out;
}

function coerceServer(value: unknown): McpServerConfig | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;
  if (v.type === "http") {
    if (typeof v.url !== "string" || v.url.length === 0) return null;
    return { type: "http", url: v.url, headers: strRecord(v.headers) };
  }
  // stdio (default)
  if (typeof v.command !== "string" || v.command.length === 0) return null;
  return {
    type: "stdio",
    command: v.command,
    args: Array.isArray(v.args) ? v.args.filter((a): a is string => typeof a === "string") : undefined,
    env: strRecord(v.env),
    cwd: typeof v.cwd === "string" ? v.cwd : undefined,
  };
}

function strRecord(v: unknown): Record<string, string> | undefined {
  if (typeof v !== "object" || v === null) return undefined;
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (typeof val === "string") out[k] = val;
  }
  return Object.keys(out).length ? out : undefined;
}

async function readConfig(path: string): Promise<McpServers> {
  try {
    const file = Bun.file(path);
    if (!(await file.exists())) return {};
    return parseMcpConfig(await file.json());
  } catch {
    return {}; // missing / unreadable / invalid JSON → no servers
  }
}

/** Load and merge global + project MCP servers (project wins on name collision). */
export async function loadMcpServers(workspaceRoot: string): Promise<McpServers> {
  const [global, project] = await Promise.all([
    readConfig(globalMcpConfigPath()),
    readConfig(projectMcpConfigPath(workspaceRoot)),
  ]);
  return { ...global, ...project };
}
