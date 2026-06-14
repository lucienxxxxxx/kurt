/**
 * connectMcpServers — connect to every configured MCP server (in parallel),
 * collect their tools into one flat list for the ToolHub, and return a single
 * `close()` that tears them all down. Per-server failures are isolated and
 * reported in `statuses` (one bad server doesn't sink the rest).
 */

import type { Tool } from "../engine/index.ts";
import { connectMcpServer, type ConnectOptions } from "./client.ts";
import type { McpServers, McpServerStatus } from "./types.ts";

export interface McpRuntime {
  /** All tools across all connected servers (namespaced, de-duplicated). */
  tools: Tool[];
  /** Per-server outcome, for the front-end to display at launch. */
  statuses: McpServerStatus[];
  /** Disconnect every server. Idempotent. */
  close(): Promise<void>;
}

export async function connectMcpServers(servers: McpServers, opts: ConnectOptions = {}): Promise<McpRuntime> {
  const names = Object.keys(servers);
  if (names.length === 0) return { tools: [], statuses: [], close: async () => {} };

  const conns = await Promise.all(names.map((name) => connectMcpServer(name, servers[name]!, opts)));

  const tools: Tool[] = [];
  const taken = new Set<string>();
  const statuses: McpServerStatus[] = [];
  for (const conn of conns) {
    // Guard against cross-server name collisions (each server namespaces its own,
    // but two servers with the same name+tool could still clash).
    for (const t of conn.tools) {
      if (taken.has(t.spec.name)) continue;
      taken.add(t.spec.name);
      tools.push(t);
    }
    statuses.push({ name: conn.name, ok: conn.ok, toolCount: conn.tools.length, error: conn.error });
  }

  return {
    tools,
    statuses,
    close: async () => {
      await Promise.all(conns.map((c) => c.close()));
    },
  };
}

/** One-line summary of MCP connection statuses (for the launch banner). */
export function summarizeStatuses(statuses: McpServerStatus[]): string {
  if (statuses.length === 0) return "";
  return statuses
    .map((s) => (s.ok ? `${s.name} ✓ (${s.toolCount})` : `${s.name} ✗ (${truncateErr(s.error)})`))
    .join(", ");
}

function truncateErr(err: string | undefined): string {
  const e = err ?? "failed";
  return e.length <= 60 ? e : e.slice(0, 57) + "...";
}
