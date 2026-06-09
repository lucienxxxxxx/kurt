/**
 * Markdown → ANSI for the TUI, via marked + marked-terminal.
 *
 * We render a *finalized* assistant message to ANSI and drop it into an Ink
 * <Text>. While a reply is still streaming we show plain text instead, because
 * partial markdown (an unclosed ``` fence, half a list) renders badly.
 */

import { Marked } from "marked";
import { markedTerminal } from "marked-terminal";

/** Render markdown to an ANSI string wrapped to `width`. */
export function renderMarkdown(md: string, width: number): string {
  // Fresh instance per call so width can vary with the terminal (no global state).
  // @types/marked-terminal (v6) lags the v7 lib API, hence the cast.
  const m = new Marked(markedTerminal({ width: Math.max(20, width), reflowText: true }) as never);
  const out = m.parse(md) as string;
  return out.replace(/\s+$/, "");
}
