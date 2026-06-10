import { describe, expect, test } from "bun:test";
import type { Message } from "kurt-agent";
import { entriesFromMessages } from "./session-view.ts";

describe("entriesFromMessages", () => {
  test("rebuilds user / assistant text / tool call+result entries in order", () => {
    const messages: Message[] = [
      { role: "user", content: [{ type: "text", text: "list files" }] },
      {
        role: "assistant",
        content: [
          { type: "text", text: "sure, listing" },
          { type: "tool_use", id: "c1", name: "shell", input: { command: "ls" } },
        ],
      },
      { role: "tool", content: [{ type: "tool_result", toolUseId: "c1", content: "a\nb", isError: false }] },
      { role: "assistant", content: [{ type: "text", text: "done" }] },
    ];

    const entries = entriesFromMessages(messages);
    expect(entries.map((e) => e.kind)).toEqual(["user", "assistant", "tool", "assistant"]);
    const tool = entries[2]!;
    expect(tool.kind).toBe("tool");
    if (tool.kind === "tool") {
      expect(tool.name).toBe("shell");
      expect(tool.result).toBe("a\nb");
      expect(tool.isError).toBe(false);
    }
  });

  test("skips empty text blocks", () => {
    const messages: Message[] = [
      { role: "user", content: [{ type: "text", text: "" }] },
      { role: "assistant", content: [{ type: "text", text: "" }] },
    ];
    expect(entriesFromMessages(messages)).toEqual([]);
  });
});
