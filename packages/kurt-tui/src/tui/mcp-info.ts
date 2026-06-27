/**
 * Pure view-model for the `/mcp` overlay: combine the connection statuses with
 * the flat tool list (whose names are namespaced `mcp__<server>__<tool>`) into a
 * per-server summary the UI can render and drill into.
 */

import type { McpServerStatus, Tool } from "kurt-agent";

export interface McpToolInfo {
  /** Display name with the `mcp__<server>__` prefix stripped. */
  name: string;
  description: string;
}

export interface McpServerInfo {
  name: string;
  ok: boolean;
  toolCount: number;
  error?: string;
  tools: McpToolInfo[];
}

/** Parse a namespaced MCP tool name into `{ server, tool }` (null if not namespaced). */
export function parseMcpToolName(raw: string): { server: string; tool: string } | null {
  const m = raw.match(/^mcp__(.+?)__(.+)$/);
  return m ? { server: m[1]!, tool: m[2]! } : null;
}

/** Build the per-server summary (statuses joined with their grouped tools). */
export function mcpServerInfos(statuses: McpServerStatus[], tools: Tool[]): McpServerInfo[] {
  const byServer = new Map<string, McpToolInfo[]>();
  for (const t of tools) {
    const parsed = parseMcpToolName(t.spec.name);
    if (!parsed) continue;
    const list = byServer.get(parsed.server) ?? [];
    list.push({ name: parsed.tool, description: t.spec.description ?? "" });
    byServer.set(parsed.server, list);
  }
  return statuses.map((s) => ({
    name: s.name,
    ok: s.ok,
    toolCount: s.toolCount,
    error: s.error,
    tools: byServer.get(s.name) ?? [],
  }));
}
