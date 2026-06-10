/**
 * GrepTool — search file contents for a regex via direct fs (no subprocess).
 * Recursively walks a path (confined to the workspace), skipping VCS/dependency
 * dirs and binary/oversized files, and returns `relpath:line: match` rows capped
 * by a match limit + the shared truncate lib.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import type { Tool, ToolContext, ToolResult, ToolSpec } from "../engine/index.ts";
import { resolveWithin } from "./fs-access.ts";
import { truncate, truncationNote } from "../truncate.ts";

const SKIP_DIRS = new Set([".git", "node_modules", ".kurt", "dist", "build", ".next", "target"]);
const MAX_FILE_BYTES = 2_000_000; // skip files larger than ~2MB
const MAX_MATCHES = 300;
const MAX_FILES_SCANNED = 5000;

export interface GrepToolOptions {
  roots?: string[];
}

export class GrepTool implements Tool {
  readonly spec: ToolSpec = {
    name: "grep",
    description:
      "Search file contents for a regular expression, recursively under a path " +
      "(relative to the workspace; default: the whole workspace). Returns matching " +
      "lines as `path:line: text`. Skips .git/node_modules/binaries; results are capped.",
    inputSchema: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "JavaScript regular expression to search for." },
        path: { type: "string", description: "File or directory to search (relative to the workspace). Default: workspace root." },
        flags: { type: "string", description: 'Regex flags, e.g. "i" for case-insensitive. Default "".' },
      },
      required: ["pattern"],
    },
  };

  #roots: string[];
  constructor(opts: GrepToolOptions = {}) {
    this.#roots = opts.roots ?? [process.cwd()];
  }

  async execute(input: unknown, ctx: ToolContext): Promise<ToolResult> {
    const { pattern, path, flags } = (input ?? {}) as { pattern?: unknown; path?: unknown; flags?: unknown };
    if (typeof pattern !== "string" || pattern.length === 0) {
      return { content: 'Invalid input: "pattern" must be a non-empty string.', isError: true };
    }
    let re: RegExp;
    try {
      re = new RegExp(pattern, typeof flags === "string" ? flags.replace(/[gm]/g, "") : "");
    } catch (err) {
      return { content: `Invalid regex: ${err instanceof Error ? err.message : String(err)}`, isError: true };
    }

    const target = typeof path === "string" && path.length > 0 ? path : ".";
    const within = resolveWithin(target, this.#roots, "Searching");
    if ("error" in within) return { content: within.error, isError: true };

    const base = within.path;
    const matches: string[] = [];
    let scanned = 0;
    let capped = false;

    const visit = (abs: string): void => {
      if (ctx.signal.aborted || matches.length >= MAX_MATCHES || scanned >= MAX_FILES_SCANNED) {
        capped = true;
        return;
      }
      let st;
      try {
        st = statSync(abs);
      } catch {
        return;
      }
      if (st.isDirectory()) {
        let entries: string[];
        try {
          entries = readdirSync(abs);
        } catch {
          return;
        }
        for (const name of entries) {
          if (SKIP_DIRS.has(name) || name.startsWith(".")) continue;
          if (matches.length >= MAX_MATCHES) break;
          visit(join(abs, name));
        }
        return;
      }
      if (!st.isFile() || st.size > MAX_FILE_BYTES) return;
      scanned++;
      let text: string;
      try {
        text = readFileSync(abs, "utf8");
      } catch {
        return;
      }
      if (looksBinary(text)) return;
      const lines = text.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (matches.length >= MAX_MATCHES) {
          capped = true;
          break;
        }
        if (re.test(lines[i]!)) {
          const rel = relative(base, abs) || abs.split("/").pop() || abs;
          matches.push(`${rel}:${i + 1}: ${lines[i]!.trim().slice(0, 300)}`);
        }
      }
    };

    visit(base);

    if (matches.length === 0) return { content: `No matches for /${pattern}/ under ${target}.` };
    const t = truncate(matches.join("\n"));
    const note = capped ? `\n\n…[results capped at ${MAX_MATCHES} matches]` : "";
    return { content: t.text + note + truncationNote(t) };
  }
}

/** Heuristic: a NUL byte in the first 1KB means a binary file. */
function looksBinary(text: string): boolean {
  const n = Math.min(text.length, 1024);
  for (let i = 0; i < n; i++) if (text.charCodeAt(i) === 0) return true;
  return false;
}
