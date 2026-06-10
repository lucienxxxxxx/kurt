import { describe, expect, test } from "bun:test";
import type { Event } from "../engine/index.ts";
import { messagesFromEvents } from "./history.ts";

describe("messagesFromEvents", () => {
  test("rebuilds an assistant turn with a thinking block, then the tool message", () => {
    const events: Event[] = [
      { type: "turn_start", turn: 1 },
      { type: "thinking", text: "let me " },
      { type: "thinking", text: "reason" },
      { type: "llm_delta", text: "calling" },
      { type: "tool_call", id: "c1", name: "shell", input: { command: "ls" } },
      { type: "tool_result", id: "c1", content: "a", isError: false },
      { type: "turn_end", turn: 1, stopReason: "tool_use" },
    ];
    const msgs = messagesFromEvents(events);
    expect(msgs[0]!.role).toBe("assistant");
    const blocks = msgs[0]!.content;
    expect(blocks[0]).toEqual({ type: "thinking", text: "let me reason" }); // thinking first
    expect(blocks.some((b) => b.type === "text")).toBe(true);
    expect(blocks.some((b) => b.type === "tool_use")).toBe(true);
    expect(msgs[1]!.role).toBe("tool");
  });

  test("no thinking events → no thinking block", () => {
    const events: Event[] = [
      { type: "llm_delta", text: "hi" },
      { type: "turn_end", turn: 1, stopReason: "end_turn" },
    ];
    const blocks = messagesFromEvents(events)[0]!.content;
    expect(blocks.some((b) => b.type === "thinking")).toBe(false);
  });
});
