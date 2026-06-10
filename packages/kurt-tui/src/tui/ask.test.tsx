import { describe, expect, test } from "bun:test";
import { render } from "ink-testing-library";
import { AskBridge } from "./ask.ts";
import { AskPrompt } from "./ask-prompt.tsx";

describe("AskBridge", () => {
  test("exposes the pending question, then answer() resolves the awaiting tool", async () => {
    const bridge = new AskBridge();
    expect(bridge.getSnapshot()).toBeNull();

    const answered = bridge.ask({ question: "Pick", options: ["A", "B"] });
    expect(bridge.getSnapshot()).toEqual({ question: "Pick", options: ["A", "B"] });

    bridge.answer("B");
    expect(await answered).toBe("B");
    expect(bridge.getSnapshot()).toBeNull(); // cleared after answering
  });

  test("aborting the signal resolves the ask with empty (loop unwinds)", async () => {
    const bridge = new AskBridge();
    const ac = new AbortController();
    const answered = bridge.ask({ question: "q" }, ac.signal);
    ac.abort();
    expect(await answered).toBe("");
  });
});

describe("AskPrompt render", () => {
  test("shows the question and lettered options", () => {
    const { lastFrame, unmount } = render(
      <AskPrompt pending={{ question: "Which DB?", options: ["Postgres", "SQLite"] }} input="" selected={0} />,
    );
    const frame = lastFrame() ?? "";
    expect(frame).toContain("Which DB?");
    expect(frame).toContain("A. Postgres");
    expect(frame).toContain("B. SQLite");
    unmount();
  });
});
