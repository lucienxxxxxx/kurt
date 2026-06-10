/**
 * ReadFileTool — read a UTF-8 text file via direct Bun I/O (no subprocess).
 *
 * Reads are confined to the workspace (+ dirs opened via request_write_access),
 * the read-side counterpart to the sandbox's write confinement. Output is capped
 * by the shared truncate lib (lines/bytes, whichever first) so a huge file can't
 * blow up the context; `offset`/`limit` let the model page through large files.
 */

import type { Tool, ToolContext, ToolResult, ToolSpec } from "../engine/index.ts";
import { resolveWithin } from "./fs-access.ts";
import { DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES, truncate, truncationNote } from "../truncate.ts";

export interface ReadFileToolOptions {
  /** Allowed roots (shared, mutable, read live). Default: [cwd]. */
  roots?: string[];
  maxLines?: number;
  maxBytes?: number;
}

export class ReadFileTool implements Tool {
  readonly spec: ToolSpec = {
    name: "read_file",
    description:
      "Read a UTF-8 text file and return its contents. Path is relative to the " +
      "workspace (or absolute, but must stay inside it). Use offset/limit to page " +
      "through large files; output is truncated if very large.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path (relative to the workspace, or absolute inside it)." },
        offset: { type: "number", description: "1-based first line to read (optional)." },
        limit: { type: "number", description: "Max number of lines to read from offset (optional)." },
      },
      required: ["path"],
    },
  };

  #roots: string[];
  #maxLines: number;
  #maxBytes: number;

  constructor(opts: ReadFileToolOptions = {}) {
    this.#roots = opts.roots ?? [process.cwd()];
    this.#maxLines = opts.maxLines ?? DEFAULT_MAX_LINES;
    this.#maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
  }

  async execute(input: unknown, _ctx: ToolContext): Promise<ToolResult> {
    const { path, offset, limit } = (input ?? {}) as { path?: unknown; offset?: unknown; limit?: unknown };
    if (typeof path !== "string" || path.length === 0) {
      return { content: 'Invalid input: "path" must be a non-empty string.', isError: true };
    }

    const within = resolveWithin(path, this.#roots, "Reading");
    if ("error" in within) return { content: within.error, isError: true };

    const file = Bun.file(within.path);
    if (!(await file.exists())) return { content: `File not found: ${path}`, isError: true };

    let text = await file.text();
    let rangeNote = "";
    const start = typeof offset === "number" && offset > 0 ? Math.floor(offset) - 1 : 0;
    const count = typeof limit === "number" && limit > 0 ? Math.floor(limit) : undefined;
    if (start > 0 || count !== undefined) {
      const lines = text.split("\n");
      const end = count !== undefined ? start + count : lines.length;
      text = lines.slice(start, end).join("\n");
      rangeNote = ` [lines ${start + 1}-${Math.min(end, lines.length)} of ${lines.length}]`;
    }

    const t = truncate(text, { maxLines: this.#maxLines, maxBytes: this.#maxBytes });
    return { content: (t.text || "(empty)") + rangeNote + truncationNote(t) };
  }
}
