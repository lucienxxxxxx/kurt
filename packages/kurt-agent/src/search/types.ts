/**
 * SearchProvider — a pluggable web-search backend.
 *
 * Network access is granted per-tool (the search tool gets it; shell/code don't).
 * Keeping this an interface means WebSearchTool can be unit-tested with a mock,
 * and the real backend (DuckDuckGo, or a keyed API later) swaps freely.
 */

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface SearchProvider {
  readonly name: string;
  search(query: string, signal: AbortSignal): Promise<SearchResult[]>;
}
