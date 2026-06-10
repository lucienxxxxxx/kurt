/**
 * Reconstruct display entries from a saved conversation's `Message[]` — the
 * inverse of how the live loop builds entries from events. Used to repaint a
 * resumed session. Pure → unit-tested. (Streamed thinking isn't persisted, so a
 * resumed view shows text + tool calls/results but not past reasoning.)
 */

import type { Message } from "kurt-agent";
import type { Entry } from "./entries.ts";

export function entriesFromMessages(messages: Message[]): Entry[] {
  const entries: Entry[] = [];

  for (const msg of messages) {
    if (msg.role === "user") {
      const text = textOf(msg.content);
      if (text.length > 0) entries.push({ kind: "user", text });
      continue;
    }
    if (msg.role === "assistant") {
      for (const block of msg.content) {
        if (block.type === "text" && block.text.length > 0) {
          entries.push({ kind: "assistant", text: block.text });
        } else if (block.type === "tool_use") {
          entries.push({ kind: "tool", id: block.id, name: block.name, input: block.input });
        }
      }
      continue;
    }
    // role === "tool": attach each result to its matching tool card.
    for (const block of msg.content) {
      if (block.type !== "tool_result") continue;
      const tool = entries.find((e) => e.kind === "tool" && e.id === block.toolUseId && e.result === undefined);
      if (tool && tool.kind === "tool") {
        tool.result = block.content;
        tool.isError = block.isError;
      }
    }
  }

  return entries;
}

function textOf(content: Message["content"]): string {
  return content
    .filter((b) => b.type === "text")
    .map((b) => (b as Extract<typeof b, { type: "text" }>).text)
    .join("");
}
