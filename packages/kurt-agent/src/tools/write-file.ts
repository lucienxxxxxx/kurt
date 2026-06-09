/**
 * WriteFileTool — write a text file via direct Bun I/O (no subprocess needed).
 *
 * Application-level access control: writes are confined to one or more allowed
 * root directories; any path that resolves outside them is rejected. This is the
 * file-side counterpart to the sandbox's "阻止越权文件访问" for subprocess tools.
 */

import { mkdir } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import type { Tool, ToolContext, ToolResult, ToolSpec } from "../engine/index.ts";
import { malformedArgsError } from "../tool-args.ts";

export interface WriteFileToolOptions {
  /** Allowed write roots. A path must resolve inside one. Default: [cwd]. */
  roots?: string[];
}

export class WriteFileTool implements Tool {
  readonly spec: ToolSpec = {
    name: "write_file",
    description:
      "Create or overwrite a UTF-8 text file. Parent directories are created as " +
      "needed. Writes are restricted to the workspace; to write elsewhere, first " +
      "call request_write_access for that directory.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Destination path (relative to a workspace root, or absolute)." },
        content: { type: "string", description: "Full file contents to write." },
      },
      required: ["path", "content"],
    },
  };

  // Kept as the (possibly shared, mutable) reference — resolved at execute time
  // so dirs granted later via request_write_access are picked up live.
  #roots: string[];

  constructor(opts: WriteFileToolOptions = {}) {
    this.#roots = opts.roots ?? [process.cwd()];
  }

  async execute(input: unknown, _ctx: ToolContext): Promise<ToolResult> {
    const badArgs = malformedArgsError(input);
    if (badArgs) return { content: badArgs, isError: true };
    const { path, content } = (input ?? {}) as { path?: unknown; content?: unknown };
    if (typeof path !== "string" || path.length === 0) {
      return { content: 'Invalid input: "path" must be a non-empty string.', isError: true };
    }
    if (typeof content !== "string") {
      return { content: 'Invalid input: "content" must be a string.', isError: true };
    }

    const roots = this.#roots.map((r) => resolve(r));
    const base = roots[0] ?? process.cwd();
    const fullPath = isAbsolute(path) ? resolve(path) : resolve(base, path);

    if (!roots.some((root) => isInside(root, fullPath))) {
      return {
        content:
          `Refused: ${path} resolves outside the allowed roots (${roots.join(", ")}). ` +
          `To write here, first call request_write_access with the target directory.`,
        isError: true,
      };
    }

    try {
      await mkdir(dirname(fullPath), { recursive: true });
      await Bun.write(fullPath, content);
      return { content: `Wrote ${content.length} bytes to ${fullPath}` };
    } catch (err) {
      return { content: `Failed to write ${path}: ${err instanceof Error ? err.message : String(err)}`, isError: true };
    }
  }
}

/** True if `target` is `root` itself or nested inside it. */
function isInside(root: string, target: string): boolean {
  const rel = relative(root, target);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}
