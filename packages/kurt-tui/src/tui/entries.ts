/**
 * The TUI's view-model: a flat list of render "entries" derived from the engine
 * event stream, plus viewport math to show a fixed window of them (auto-follow
 * tail with scroll-back). Pure and Ink-free, so it's unit-tested directly.
 */

import type { Event } from "kurt-agent";

export type Entry =
  | { kind: "user"; text: string }
  | { kind: "assistant"; text: string }
  | { kind: "thinking"; text: string }
  | { kind: "tool"; id: string; name: string; input: unknown; stream?: string; result?: string; isError?: boolean }
  | { kind: "notice"; level: "info" | "warn" | "error"; text: string };

/** Append a user message (the front-end does this before running the loop). */
export function pushUser(entries: Entry[], text: string): Entry[] {
  return [...entries, { kind: "user", text }];
}

/** Fold one engine event into the entry list. */
export function applyEvent(entries: Entry[], event: Event): Entry[] {
  switch (event.type) {
    case "llm_delta":
      return appendText(entries, "assistant", event.text);
    case "thinking":
      return appendText(entries, "thinking", event.text);
    case "tool_call":
      return [...entries, { kind: "tool", id: event.id, name: event.name, input: event.input }];
    case "tool_output":
      return entries.map((e) =>
        e.kind === "tool" && e.id === event.id ? { ...e, stream: (e.stream ?? "") + event.text } : e,
      );
    case "tool_result":
      return entries.map((e) =>
        e.kind === "tool" && e.id === event.id && e.result === undefined
          ? { ...e, result: event.content, isError: event.isError }
          : e,
      );
    case "aborted":
      return [...entries, { kind: "notice", level: "warn", text: `aborted (${event.reason})` }];
    case "error":
      return [...entries, { kind: "notice", level: "error", text: event.message }];
    case "compaction":
      return [
        ...entries,
        { kind: "notice", level: "info", text: `compacted ${event.messagesBefore}→${event.messagesAfter} msgs` },
      ];
    default:
      return entries; // turn_start / turn_end / usage handled outside the reducer
  }
}

function appendText(entries: Entry[], kind: "assistant" | "thinking", text: string): Entry[] {
  const last = entries[entries.length - 1];
  if (last && last.kind === kind) {
    return [...entries.slice(0, -1), { ...last, text: last.text + text }];
  }
  return [...entries, { kind, text }];
}

export function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
