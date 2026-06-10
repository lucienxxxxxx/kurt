/**
 * Shared output-truncation for read-style tools (read_file / ls / grep). Caps by
 * line count OR byte size, whichever is reached first, so a single huge read can
 * never blow up the model's context. Pure + deterministic.
 */

export interface TruncateOptions {
  /** Max lines to keep. Default {@link DEFAULT_MAX_LINES}. */
  maxLines?: number;
  /** Max bytes to keep (UTF-8). Default {@link DEFAULT_MAX_BYTES}. */
  maxBytes?: number;
}

export interface Truncation {
  text: string;
  truncated: boolean;
  totalLines: number;
  shownLines: number;
  totalBytes: number;
}

export const DEFAULT_MAX_LINES = 1000;
export const DEFAULT_MAX_BYTES = 100_000;

export function truncate(text: string, opts: TruncateOptions = {}): Truncation {
  const maxLines = opts.maxLines ?? DEFAULT_MAX_LINES;
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
  const enc = new TextEncoder();
  const totalBytes = enc.encode(text).length;
  const lines = text.split("\n");
  const totalLines = lines.length;

  if (totalLines <= maxLines && totalBytes <= maxBytes) {
    return { text, truncated: false, totalLines, shownLines: totalLines, totalBytes };
  }

  const kept: string[] = [];
  let bytes = 0;
  for (const line of lines) {
    if (kept.length >= maxLines) break;
    const add = enc.encode(line).length + (kept.length > 0 ? 1 : 0); // +1 for the rejoining "\n"
    if (kept.length > 0 && bytes + add > maxBytes) break; // keep at least one line
    bytes += add;
    kept.push(line);
  }
  return { text: kept.join("\n"), truncated: true, totalLines, shownLines: kept.length, totalBytes };
}

/** A one-line note describing what was clipped (or "" when nothing was). */
export function truncationNote(t: Truncation): string {
  if (!t.truncated) return "";
  return `\n\n…[truncated: showing ${t.shownLines} of ${t.totalLines} lines (${t.totalBytes} bytes total)]`;
}
