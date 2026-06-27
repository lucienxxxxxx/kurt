/**
 * MemoryTool — the agent's persistent, self-managed memory. It reads/writes a
 * fixed markdown file per scope (global or project) that the orchestration layer
 * preloads into the system prompt, so notes saved now resurface in future turns
 * and sessions.
 *
 * Pure orchestration: a side-effect Tool over an injected MemoryStore. The default
 * store is fixed markdown paths (never model-supplied), so there's no path-
 * traversal surface. The engine is untouched.
 */

import type { Tool, ToolContext, ToolResult, ToolSpec } from "../engine/index.ts";
import { MarkdownMemoryStore, type MemoryScope, type MemoryStore } from "../memory/index.ts";

const DEFAULT_MAX_BYTES = 32_000;

export interface MemoryToolOptions {
  /** Injected store. When absent, globalPath/projectPath build a MarkdownMemoryStore. */
  store?: MemoryStore;
  /** Absolute path to the global memory file (e.g. ~/.kurt/memory.md). */
  globalPath?: string;
  /** Absolute path to the project memory file (e.g. <ws>/.kurt/memory.md). */
  projectPath?: string;
  /** Soft cap; an append beyond it is refused with a "curate" hint. Default ~32KB. */
  maxBytes?: number;
}

export class MemoryTool implements Tool {
  readonly spec: ToolSpec = {
    name: "memory",
    description:
      "Your long-term memory: markdown preloaded into your system prompt on future " +
      "turns and sessions. Decide on your own to save durable facts worth recalling — " +
      "user preferences, project conventions/commands, decisions, environment details. " +
      "Do NOT store transient task state or secrets. scope 'global' persists across all " +
      "projects; 'project' is specific to this workspace. Use action 'replace' to " +
      "curate/condense when it grows stale.",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", description: "One of: view | append | replace." },
        text: { type: "string", description: "Markdown to add (append) or the full new contents (replace)." },
        scope: { type: "string", description: "'global' (default) or 'project'." },
      },
      required: ["action"],
    },
  };

  #store: MemoryStore;
  #maxBytes: number;

  constructor(opts: MemoryToolOptions) {
    if (opts.store) {
      this.#store = opts.store;
    } else {
      if (!opts.globalPath) throw new Error("MemoryTool requires either store or globalPath.");
      this.#store = new MarkdownMemoryStore({ globalPath: opts.globalPath, projectPath: opts.projectPath });
    }
    this.#maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
  }

  async execute(input: unknown, _ctx: ToolContext): Promise<ToolResult> {
    const { action, text, scope } = (input ?? {}) as { action?: unknown; text?: unknown; scope?: unknown };
    if (action !== "view" && action !== "append" && action !== "replace") {
      return { content: 'Invalid input: "action" must be one of view | append | replace.', isError: true };
    }

    const memScope: MemoryScope = scope === "project" ? "project" : "global";
    if (!this.#store.supports(memScope)) {
      return { content: "No project memory available (no workspace). Use scope 'global'.", isError: true };
    }
    const label = this.#store.label(memScope);

    const current = await this.#store.read(memScope);

    if (action === "view") {
      return { content: current.trim().length > 0 ? current : `(${label} memory is empty)` };
    }

    if (typeof text !== "string" || text.trim().length === 0) {
      return { content: `Invalid input: "text" is required for ${action}.`, isError: true };
    }

    let next: string;
    if (action === "append") {
      const block = text.trim();
      next = current.trim().length > 0 ? `${current.trimEnd()}\n\n${block}\n` : `${block}\n`;
      const bytes = new TextEncoder().encode(next).length;
      if (bytes > this.#maxBytes) {
        return {
          content:
            `Refused: appending would grow ${label} memory to ${bytes} bytes (cap ${this.#maxBytes}). ` +
            `Use action 'replace' to curate/condense it instead.`,
          isError: true,
        };
      }
    } else {
      next = text.trim() + "\n";
    }

    try {
      await this.#store.write(memScope, next);
    } catch (err) {
      return {
        content: `Failed to update ${label} memory: ${err instanceof Error ? err.message : String(err)}`,
        isError: true,
      };
    }
    return { content: `Updated ${label} memory (${action}); it now has ${next.trimEnd().split("\n").length} lines.` };
  }
}
