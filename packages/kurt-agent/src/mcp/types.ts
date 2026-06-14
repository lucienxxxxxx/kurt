/**
 * MCP wiring types — config the orchestration layer supplies, and the narrow
 * content/result shapes the adapter consumes.
 *
 * Phase 5: MCP is a *remote provider of Tools* (CLAUDE.md §8). The SDK client and
 * the server subprocess/connection are all I/O — they live here in the tool layer,
 * never in `src/engine/` (铁律 #1). Each remote tool is wrapped as a `Tool` and
 * registered in the ToolHub like any other (铁律 #3: add a shell, don't change core).
 */

/** A local MCP server launched as a subprocess (stdio transport). */
export interface McpStdioServerConfig {
  type?: "stdio";
  /** Executable to spawn, e.g. "npx". */
  command: string;
  /** Arguments, e.g. ["-y", "@modelcontextprotocol/server-filesystem", "/path"]. */
  args?: string[];
  /** Extra env for the subprocess (values support ${VAR} expansion). */
  env?: Record<string, string>;
  /** Working dir for the subprocess (default: inherit). */
  cwd?: string;
}

/** A remote MCP server reached over Streamable HTTP. */
export interface McpHttpServerConfig {
  type: "http";
  /** The server endpoint URL. */
  url: string;
  /** Extra request headers, e.g. { Authorization: "Bearer ${TOKEN}" } (${VAR} expanded). */
  headers?: Record<string, string>;
}

export type McpServerConfig = McpStdioServerConfig | McpHttpServerConfig;

/** name → server config (matches the well-known `{ "mcpServers": {...} }` schema). */
export type McpServers = Record<string, McpServerConfig>;

/** Outcome of connecting to one server — surfaced to the front-end for display. */
export interface McpServerStatus {
  name: string;
  ok: boolean;
  /** Number of tools the server exposed (0 on failure). */
  toolCount: number;
  /** Failure reason when ok === false. */
  error?: string;
}

/** A single content block returned by an MCP tool call (the subset we render). */
export type McpContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string }
  | { type: "audio"; data: string; mimeType: string }
  | { type: "resource"; resource: McpResourceContents }
  | { type: string; [key: string]: unknown };

export interface McpResourceContents {
  uri: string;
  mimeType?: string;
  text?: string;
  blob?: string;
}

/** The normalized result of `tools/call` (what the adapter maps to a ToolResult). */
export interface McpCallResult {
  content?: McpContentBlock[];
  isError?: boolean;
}

/** Performs the actual `tools/call` against a connected server (signal-aware). */
export type McpCall = (args: Record<string, unknown>, signal: AbortSignal) => Promise<McpCallResult>;
