/**
 * McpTool — adapts one remote MCP tool to the engine's `Tool` interface. The
 * engine cannot tell it apart from a native tool; calling it round-trips to the
 * MCP server via the injected `call` closure (which owns the SDK client).
 *
 * Side effects live entirely here in the tool layer. Non-read-only tools are
 * gated through the same PermissionProvider as shell commands, so an external
 * server can't silently mutate the system.
 */

import type { Tool, ToolContext, ToolResult, ToolSpec } from "../engine/index.ts";
import type { JSONSchema } from "../engine/index.ts";
import type { PermissionProvider } from "../permission/index.ts";
import type { McpCall, McpContentBlock } from "./types.ts";

export interface McpToolOptions {
  /** Model-facing name (namespaced, e.g. "mcp__github__create_issue"). */
  name: string;
  /** The tool's original name on the server (sent in tools/call). */
  remoteName: string;
  /** The server this tool belongs to (for permission keys + display). */
  serverName: string;
  description: string;
  inputSchema: JSONSchema;
  /** From the server's readOnlyHint annotation — read-only tools skip approval. */
  readOnly: boolean;
  call: McpCall;
  /** When set, non-read-only calls require approval before running. */
  permission?: PermissionProvider;
}

export class McpTool implements Tool {
  readonly spec: ToolSpec;
  readonly #opts: McpToolOptions;

  constructor(opts: McpToolOptions) {
    this.#opts = opts;
    this.spec = {
      name: opts.name,
      description: opts.description || `MCP tool ${opts.remoteName} (server: ${opts.serverName}).`,
      inputSchema: opts.inputSchema,
    };
  }

  /** True if the server marked this tool read-only (no side effects). */
  get readOnly(): boolean {
    return this.#opts.readOnly;
  }

  /** The MCP server this tool came from. */
  get serverName(): string {
    return this.#opts.serverName;
  }

  async execute(input: unknown, ctx: ToolContext): Promise<ToolResult> {
    const args = isRecord(input) ? input : {};

    // Gate side-effecting tools through approval (read-only tools run freely).
    if (this.#opts.permission && !this.#opts.readOnly) {
      const decision = await this.#opts.permission.request({
        key: `mcp:${this.#opts.serverName}/${this.#opts.remoteName}`,
        title: `${this.#opts.serverName} · ${this.#opts.remoteName}`,
        command: `${this.spec.name}(${argsPreview(args)})`,
        explanation: this.spec.description,
        risk: "Runs a tool on an external MCP server, which may have side effects.",
      });
      if (decision === "deny") {
        return { content: `Denied: the user declined to run MCP tool ${this.spec.name}.`, isError: true };
      }
    }

    try {
      const res = await this.#opts.call(args, ctx.signal);
      const content = flattenContent(res.content ?? []);
      return { content: content || "(no content)", isError: res.isError ?? false };
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") throw err; // let the engine handle abort
      return { content: `MCP tool ${this.spec.name} failed: ${err instanceof Error ? err.message : String(err)}`, isError: true };
    }
  }
}

/** Flatten MCP content blocks into the plain string the model receives. */
export function flattenContent(blocks: McpContentBlock[]): string {
  return blocks
    .map((b) => {
      switch (b.type) {
        case "text":
          return typeof (b as { text?: unknown }).text === "string" ? (b as { text: string }).text : "";
        case "image":
        case "audio": {
          const mime = (b as { mimeType?: string }).mimeType ?? "application/octet-stream";
          const data = (b as { data?: string }).data ?? "";
          return `[${b.type}: ${mime}, ${data.length} base64 chars]`;
        }
        case "resource": {
          const r = (b as { resource?: { uri?: string; text?: string } }).resource ?? {};
          return r.text != null ? `[resource ${r.uri ?? ""}]\n${r.text}` : `[resource ${r.uri ?? ""}]`;
        }
        default:
          return `[${b.type}]`;
      }
    })
    .filter((s) => s.length > 0)
    .join("\n");
}

/**
 * Build a valid, namespaced model-facing tool name: "mcp__<server>__<tool>",
 * sanitized to ^[A-Za-z0-9_-]+ and capped at 64 chars (OpenAI/DeepSeek limit).
 */
export function namespacedName(serverName: string, toolName: string): string {
  const raw = `mcp__${sanitizeSegment(serverName)}__${sanitizeSegment(toolName)}`;
  return raw.length <= 64 ? raw : raw.slice(0, 64);
}

function sanitizeSegment(s: string): string {
  return s.replace(/[^A-Za-z0-9_-]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "") || "x";
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function argsPreview(args: Record<string, unknown>): string {
  const json = JSON.stringify(args);
  return json.length <= 120 ? json : json.slice(0, 117) + "...";
}
