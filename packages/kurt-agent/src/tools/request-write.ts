/**
 * RequestWriteAccessTool — lets the agent ask the user to open a directory
 * OUTSIDE the workspace for writing (the "沙盒提权" path). It routes through the
 * same PermissionProvider as risky commands; on approval it adds the directory
 * to the shared writable-roots array that the file/exec tools read live, so
 * subsequent write_file/shell/run_code can write there for the rest of the session.
 */

import { homedir } from "node:os";
import { resolve } from "node:path";
import type { Tool, ToolContext, ToolResult, ToolSpec } from "../engine/index.ts";
import type { PermissionProvider } from "../permission/types.ts";

export class RequestWriteAccessTool implements Tool {
  readonly spec: ToolSpec = {
    name: "request_write_access",
    description:
      "Request permission to write to a directory OUTSIDE the workspace (e.g. ~/Downloads). " +
      "The user is shown the directory and asked to approve. On approval, write_file/shell/" +
      "run_code may write there for the rest of the session. Call this when a write was refused " +
      "for being outside the workspace, then retry the write.",
    inputSchema: {
      type: "object",
      properties: {
        directory: { type: "string", description: "Absolute path of the directory to allow access to (alias: path)." },
        path: { type: "string", description: "Alias for directory." },
        reason: { type: "string", description: "Why you need access there." },
      },
      required: ["directory"],
    },
  };

  /** Shared, mutable writable-roots array (the file/exec tools read it live). */
  #writable: string[];
  #permission: PermissionProvider | undefined;

  constructor(writable: string[], permission?: PermissionProvider) {
    this.#writable = writable;
    this.#permission = permission;
  }

  async execute(input: unknown, _ctx: ToolContext): Promise<ToolResult> {
    const { directory, path, reason } = (input ?? {}) as { directory?: unknown; path?: unknown; reason?: unknown };
    // Accept `path` as an alias for `directory` (models often pass `path`).
    const target = typeof directory === "string" && directory.length > 0 ? directory : typeof path === "string" ? path : "";
    if (target.length === 0) {
      return { content: 'Invalid input: "directory" (or "path") must be a non-empty string.', isError: true };
    }
    const dir = resolve(expandHome(target));

    if (this.#writable.includes(dir)) {
      return { content: `Already writable: ${dir}` };
    }
    if (!this.#permission) {
      return { content: "No approver available — cannot grant write access.", isError: true };
    }

    const why = typeof reason === "string" && reason.length > 0 ? ` — ${reason}` : "";
    const decision = await this.#permission.request({
      key: `write-access:${dir}`,
      title: "write access — outside workspace",
      command: dir,
      explanation: `Grant write access to ${dir}${why}.`,
      risk: "The agent could create or overwrite files here, outside the sandboxed workspace.",
    });

    if (decision === "deny") {
      return { content: `Denied: write access to ${dir} was not granted.`, isError: true };
    }
    this.#writable.push(dir);
    return { content: `Granted write access to ${dir}. You can now write files there.` };
  }
}

function expandHome(p: string): string {
  if (p === "~") return homedir();
  if (p.startsWith("~/")) return homedir() + p.slice(1);
  return p;
}
