/**
 * DuckDuckGoSearch — a no-API-key SearchProvider via the DuckDuckGo Instant
 * Answer API. Results are limited (it's an instant-answer endpoint, not a full
 * SERP) but it needs no credentials, which keeps Phase 2 runnable out of the box.
 */

import type { SearchProvider, SearchResult } from "./types.ts";

export interface DuckDuckGoSearchOptions {
  maxResults?: number;
}

interface DDGTopic {
  Text?: string;
  FirstURL?: string;
  Topics?: DDGTopic[];
}

interface DDGResponse {
  Abstract?: string;
  AbstractURL?: string;
  Heading?: string;
  RelatedTopics?: DDGTopic[];
}

export class DuckDuckGoSearch implements SearchProvider {
  readonly name = "duckduckgo";
  #maxResults: number;

  constructor(opts: DuckDuckGoSearchOptions = {}) {
    this.#maxResults = opts.maxResults ?? 8;
  }

  async search(query: string, signal: AbortSignal): Promise<SearchResult[]> {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&no_redirect=1`;
    const res = await fetch(url, { signal, headers: { "User-Agent": "kurt-agent/0.1" } });
    if (!res.ok) throw new Error(`DuckDuckGo returned HTTP ${res.status}`);

    const data = (await res.json()) as DDGResponse;
    const results: SearchResult[] = [];

    if (data.Abstract && data.AbstractURL) {
      results.push({ title: data.Heading ?? query, url: data.AbstractURL, snippet: data.Abstract });
    }

    for (const topic of flattenTopics(data.RelatedTopics ?? [])) {
      if (results.length >= this.#maxResults) break;
      if (topic.Text && topic.FirstURL) {
        results.push({ title: firstSentence(topic.Text), url: topic.FirstURL, snippet: topic.Text });
      }
    }

    return results.slice(0, this.#maxResults);
  }
}

function flattenTopics(topics: DDGTopic[]): DDGTopic[] {
  const out: DDGTopic[] = [];
  for (const t of topics) {
    if (t.Topics) out.push(...flattenTopics(t.Topics));
    else out.push(t);
  }
  return out;
}

function firstSentence(text: string): string {
  const idx = text.indexOf(" - ");
  return idx > 0 ? text.slice(0, idx) : text.slice(0, 80);
}
