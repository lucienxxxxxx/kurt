/**
 * ReadFileTool — a side-effect-bearing but sandbox-free tool.
 *
 * It validates the tool link end-to-end (model asks → engine dispatches → real
 * I/O happens → result feeds back). The I/O lives HERE, never in the engine
 * (铁律 #1). In Phase 2 the same `Tool` interface gets a sandboxed file
 * implementation; the engine and modes won't change a line.
 */

import { isAbsolute, resolve } from "node:path";
import type { Tool, ToolContext, ToolResult, ToolSpec } from "../engine/index.ts";

export interface ReadFileToolOptions {
  /** Base directory for relative paths. Default: process.cwd(). */
  cwd?: string;
  /** Max characters returned before truncation. Default 50_000. */
  maxChars?: number;
}

export class ReadFileTool implements Tool {
  readonly spec: ToolSpec = {
    name: "read_file",
    description:
      "Read a UTF-8 text file from disk and return its contents. Accepts a path relative to the working directory or an absolute path.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path to the file to read." },
      },
      required: ["path"],
    },
  };

  #cwd: string;
  #maxChars: number;

  constructor(opts: ReadFileToolOptions = {}) {
    this.#cwd = opts.cwd ?? process.cwd();
    this.#maxChars = opts.maxChars ?? 50_000;
  }

  async execute(input: unknown, _ctx: ToolContext): Promise<ToolResult> {
    const path = (input as { path?: unknown })?.path;
    if (typeof path !== "string" || path.length === 0) {
      return { content: 'Invalid input: "path" must be a non-empty string.', isError: true };
    }

    const fullPath = isAbsolute(path) ? path : resolve(this.#cwd, path);
    const file = Bun.file(fullPath);

    if (!(await file.exists())) {
      return { content: `File not found: ${path}`, isError: true };
    }

    const text = await file.text();
    if (text.length > this.#maxChars) {
      return {
        content: `${text.slice(0, this.#maxChars)}\n\n…[truncated ${text.length - this.#maxChars} chars]`,
      };
    }
    return { content: text };
  }
}
