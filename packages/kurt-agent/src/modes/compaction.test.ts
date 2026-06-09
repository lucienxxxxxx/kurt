import { describe, expect, test } from "bun:test";
import { compactHistory, compactionSplit, serializeForSummary } from "./compaction.ts";
import type { Message } from "../engine/index.ts";

// A conversation with tool pairing inside the first user turn, across 3 turns.
function sampleHistory(): Message[] {
  return [
    { role: "user", content: [{ type: "text", text: "turn 1" }] },
    { role: "assistant", content: [{ type: "tool_use", id: "c1", name: "shell", input: { command: "ls" } }] },
    { role: "tool", content: [{ type: "tool_result", toolUseId: "c1", content: "files", isError: false }] },
    { role: "assistant", content: [{ type: "text", text: "done 1" }] },
    { role: "user", content: [{ type: "text", text: "turn 2" }] },
    { role: "assistant", content: [{ type: "text", text: "done 2" }] },
    { role: "user", content: [{ type: "text", text: "turn 3" }] },
    { role: "assistant", content: [{ type: "text", text: "done 3" }] },
  ];
}

describe("compaction", () => {
  test("compactionSplit lands on a user boundary", () => {
    const msgs = sampleHistory();
    const split = compactionSplit(msgs, 2);
    expect(msgs[split]!.role).toBe("user");
  });

  test("no-op when there aren't enough user turns", () => {
    expect(compactionSplit(sampleHistory().slice(0, 4), 2)).toBe(0);
  });

  test("compactHistory preserves tool pairing and keeps recent turns", async () => {
    const { messages, summarizedCount } = await compactHistory(sampleHistory(), async () => "EARLIER", 2);

    expect(summarizedCount).toBeGreaterThan(0);
    expect(messages[0]!.role).toBe("user");
    expect((messages[0]!.content[0] as { text: string }).text).toContain("EARLIER");

    // Every tool_result still has a matching preceding tool_use.
    const useIds = new Set<string>();
    for (const m of messages) {
      for (const b of m.content) {
        if (b.type === "tool_use") useIds.add(b.id);
        if (b.type === "tool_result") expect(useIds.has(b.toolUseId)).toBe(true);
      }
    }
    expect((messages.at(-1)!.content[0] as { text: string }).text).toBe("done 3");
  });

  test("serializeForSummary flattens roles and tools", () => {
    const text = serializeForSummary(sampleHistory());
    expect(text).toContain("user: turn 1");
    expect(text).toContain("tool shell");
  });
});
