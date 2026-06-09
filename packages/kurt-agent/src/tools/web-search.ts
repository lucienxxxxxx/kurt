/**
 * WebSearchTool — the sanctioned network tool. It performs an in-process fetch
 * via an injected SearchProvider (so it's the one tool with network reach, while
 * shell/code run network-denied). The backend is swappable and mockable.
 */

import type { Tool, ToolContext, ToolResult, ToolSpec } from "../engine/index.ts";
import type { SearchProvider } from "../search/index.ts";

export interface WebSearchToolOptions {
  maxResults?: number;
}

export class WebSearchTool implements Tool {
  readonly spec: ToolSpec = {
    name: "web_search",
    description:
      "Search the web and return a list of result titles, URLs, and snippets. " +
      "Use for current information or facts not in context.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "The search query." },
      },
      required: ["query"],
    },
  };

  #provider: SearchProvider;
  #maxResults: number;

  constructor(provider: SearchProvider, opts: WebSearchToolOptions = {}) {
    this.#provider = provider;
    this.#maxResults = opts.maxResults ?? 8;
  }

  async execute(input: unknown, ctx: ToolContext): Promise<ToolResult> {
    const query = (input as { query?: unknown })?.query;
    if (typeof query !== "string" || query.trim().length === 0) {
      return { content: 'Invalid input: "query" must be a non-empty string.', isError: true };
    }

    try {
      const results = (await this.#provider.search(query, ctx.signal)).slice(0, this.#maxResults);
      if (results.length === 0) return { content: `No results for "${query}".` };

      const body = results
        .map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet}`)
        .join("\n\n");
      return { content: `Results for "${query}" (via ${this.#provider.name}):\n\n${body}` };
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") throw err;
      return { content: `Search failed: ${err instanceof Error ? err.message : String(err)}`, isError: true };
    }
  }
}
