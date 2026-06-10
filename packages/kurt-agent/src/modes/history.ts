/**
 * Rebuild the messages the engine appended internally, from the event stream
 * alone. Front-ends (chat, TUI) use this to keep multi-turn history without the
 * engine needing to expose its internal state (铁律 #3).
 */

import type { ContentBlock, Event, Message, ToolResultBlock, ToolUseBlock } from "../engine/index.ts";

export function messagesFromEvents(events: Event[]): Message[] {
  const out: Message[] = [];
  let text = "";
  let thinking = "";
  let toolUses: ToolUseBlock[] = [];
  let results: ToolResultBlock[] = [];

  const flush = (): void => {
    const content: ContentBlock[] = [];
    if (thinking.length > 0) content.push({ type: "thinking", text: thinking });
    if (text.length > 0) content.push({ type: "text", text });
    content.push(...toolUses);
    if (content.length > 0) out.push({ role: "assistant", content });
    if (results.length > 0) out.push({ role: "tool", content: results });
    text = "";
    thinking = "";
    toolUses = [];
    results = [];
  };

  for (const e of events) {
    switch (e.type) {
      case "llm_delta":
        text += e.text;
        break;
      case "thinking":
        // Accumulated so it can be replayed (capabilities-gated at serialize time).
        thinking += e.text;
        break;
      case "tool_call":
        toolUses.push({ type: "tool_use", id: e.id, name: e.name, input: e.input });
        break;
      case "tool_result":
        results.push({ type: "tool_result", toolUseId: e.id, content: e.content, isError: e.isError });
        break;
      case "turn_end":
        flush();
        break;
      // usage is display-only and never enters history.
    }
  }
  flush(); // handle a stream that ended without a final turn_end
  return out;
}
