/**
 * LsTool — list a directory's entries via direct fs (no subprocess / no bash).
 * Confined to the workspace (+ approved dirs); output is truncated if huge.
 */

import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Tool, ToolContext, ToolResult, ToolSpec } from "../engine/index.ts";
import { resolveWithin } from "./fs-access.ts";
import { truncate, truncationNote } from "../truncate.ts";

export interface LsToolOptions {
  roots?: string[];
}

export class LsTool implements Tool {
  readonly spec: ToolSpec = {
    name: "ls",
    description:
      "List the entries of a directory (one level). Path is relative to the " +
      "workspace (default: the workspace root). Set all:true to include dotfiles.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Directory to list (relative to the workspace). Default: workspace root." },
        all: { type: "boolean", description: "Include hidden entries (dotfiles). Default false." },
      },
    },
  };

  #roots: string[];
  constructor(opts: LsToolOptions = {}) {
    this.#roots = opts.roots ?? [process.cwd()];
  }

  async execute(input: unknown, _ctx: ToolContext): Promise<ToolResult> {
    const { path, all } = (input ?? {}) as { path?: unknown; all?: unknown };
    const dir = typeof path === "string" && path.length > 0 ? path : ".";
    const within = resolveWithin(dir, this.#roots, "Listing");
    if ("error" in within) return { content: within.error, isError: true };

    let entries;
    try {
      entries = readdirSync(within.path, { withFileTypes: true });
    } catch (err) {
      return { content: `Cannot list ${dir}: ${err instanceof Error ? err.message : String(err)}`, isError: true };
    }

    const rows = entries
      .filter((e) => all === true || !e.name.startsWith("."))
      .sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name))
      .map((e) => {
        if (e.isDirectory()) return `d           ${e.name}/`;
        let size = 0;
        try {
          size = statSync(join(within.path, e.name)).size;
        } catch {
          // unreadable — show 0
        }
        const type = e.isSymbolicLink() ? "l" : "-";
        return `${type} ${humanSize(size).padStart(9)}  ${e.name}`;
      });

    const body = rows.length > 0 ? rows.join("\n") : "(empty directory)";
    const t = truncate(body);
    return { content: `${dir}:\n${t.text}${truncationNote(t)}` };
  }
}

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  const units = ["K", "M", "G", "T"];
  let n = bytes / 1024;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n >= 10 ? Math.round(n) : n.toFixed(1)}${units[i]}`;
}
