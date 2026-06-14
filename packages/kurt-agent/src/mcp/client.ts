/**
 * connectMcpServer — connect to one MCP server (stdio subprocess or Streamable
 * HTTP), list its tools, and wrap each as a kurt `Tool`. All connection failures
 * are caught and reported (a broken server degrades to zero tools — it must never
 * crash the agent launch).
 *
 * Uses the official @modelcontextprotocol/sdk. The SDK + transports are I/O and
 * stay confined to this module (the engine never imports them).
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { Tool, JSONSchema } from "../engine/index.ts";
import type { PermissionProvider } from "../permission/index.ts";
import { McpTool, namespacedName } from "./mcp-tool.ts";
import type { McpServerConfig, McpContentBlock } from "./types.ts";

export interface ConnectOptions {
  /** Gate non-read-only tool calls through this approver (optional). */
  permission?: PermissionProvider;
  /** Connect/handshake timeout in ms (default 15000). A hung server won't block forever. */
  timeoutMs?: number;
  /** Client identity advertised to the server. */
  clientName?: string;
  clientVersion?: string;
}

export interface McpServerConnection {
  name: string;
  ok: boolean;
  tools: Tool[];
  error?: string;
  /** Disconnect and tear down the transport/subprocess. Safe to call once. */
  close(): Promise<void>;
}

const KURT_VERSION = "0.1.0";

export async function connectMcpServer(
  name: string,
  config: McpServerConfig,
  opts: ConnectOptions = {},
): Promise<McpServerConnection> {
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const client = new Client(
    { name: opts.clientName ?? "kurt", version: opts.clientVersion ?? KURT_VERSION },
    { capabilities: {} },
  );

  let transport: Transport;
  try {
    transport = makeTransport(config);
  } catch (err) {
    return failed(name, err);
  }

  try {
    await client.connect(transport, { timeout: timeoutMs });
    const { tools: remoteTools } = await client.listTools(undefined, { timeout: timeoutMs });

    const seen = new Set<string>();
    const tools: Tool[] = [];
    for (const rt of remoteTools) {
      const toolName = uniqueName(namespacedName(name, rt.name), seen);
      tools.push(
        new McpTool({
          name: toolName,
          remoteName: rt.name,
          serverName: name,
          description: rt.description ?? "",
          inputSchema: (rt.inputSchema ?? { type: "object" }) as JSONSchema,
          readOnly: rt.annotations?.readOnlyHint === true,
          permission: opts.permission,
          call: async (args, signal) => {
            const res = await client.callTool({ name: rt.name, arguments: args }, undefined, { signal });
            return { content: res.content as McpContentBlock[] | undefined, isError: res.isError === true };
          },
        }),
      );
    }

    return {
      name,
      ok: true,
      tools,
      close: async () => {
        try {
          await client.close();
        } catch {
          /* already gone */
        }
      },
    };
  } catch (err) {
    try {
      await client.close();
    } catch {
      /* ignore */
    }
    return failed(name, err);
  }
}

function makeTransport(config: McpServerConfig): Transport {
  if (config.type === "http") {
    return new StreamableHTTPClientTransport(new URL(config.url), {
      requestInit: config.headers ? { headers: expandRecord(config.headers) } : undefined,
    });
  }
  // stdio (default)
  return new StdioClientTransport({
    command: config.command,
    args: config.args,
    env: { ...inheritedEnv(), ...(config.env ? expandRecord(config.env) : {}) },
    cwd: config.cwd,
    stderr: "ignore",
  });
}

function failed(name: string, err: unknown): McpServerConnection {
  return {
    name,
    ok: false,
    tools: [],
    error: err instanceof Error ? err.message : String(err),
    close: async () => {},
  };
}

/** Ensure a tool name is unique within the server's set (append _2, _3, … on collision). */
function uniqueName(base: string, seen: Set<string>): string {
  let name = base;
  let n = 2;
  while (seen.has(name)) name = `${base}_${n++}`.slice(0, 64);
  seen.add(name);
  return name;
}

/** Expand ${VAR} references in config values from the current environment. */
function expandRecord(rec: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(rec)) out[k] = expandEnv(v);
  return out;
}

export function expandEnv(value: string): string {
  return value.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_m, name: string) => process.env[name] ?? "");
}

/** A minimal safe env for spawned servers (mirrors the SDK's default-inherit set). */
function inheritedEnv(): Record<string, string> {
  const keep = ["HOME", "PATH", "USER", "SHELL", "TERM", "TMPDIR", "LANG", "LC_ALL"];
  const out: Record<string, string> = {};
  for (const k of keep) {
    const v = process.env[k];
    if (v != null) out[k] = v;
  }
  return out;
}
