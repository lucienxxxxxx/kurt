import { describe, expect, test } from "bun:test";
import type { AskRequest } from "../ask/index.ts";
import { AskUserTool } from "./ask-user.ts";
import { UpdatePlanTool } from "./update-plan.ts";

const ctx = () => ({ signal: new AbortController().signal, toolCallId: "t", emit: () => {} });

describe("AskUserTool", () => {
  test("passes question+options to the provider and returns the answer", async () => {
    let seen: AskRequest | null = null;
    const tool = new AskUserTool({
      async ask(req) {
        seen = req;
        return "B";
      },
    });
    const res = await tool.execute({ question: "Pick one", options: ["A", "B"] }, ctx());
    expect(seen!.question).toBe("Pick one");
    expect(seen!.options).toEqual(["A", "B"]);
    expect(res.content).toContain("User answered: B");
  });

  test("empty answer → 'skipped'; no provider → error; bad input → error", async () => {
    const skip = new AskUserTool({ async ask() { return ""; } });
    expect((await skip.execute({ question: "q" }, ctx())).content).toContain("skipped");

    const none = new AskUserTool();
    expect((await none.execute({ question: "q" }, ctx())).isError).toBe(true);

    expect((await skip.execute({}, ctx())).isError).toBe(true);
  });
});

describe("UpdatePlanTool", () => {
  test("formats an ordered checklist with status marks + done count", async () => {
    const tool = new UpdatePlanTool();
    const res = await tool.execute(
      { steps: [{ title: "read code", status: "done" }, { title: "write fix", status: "in_progress" }, { title: "test" }] },
      ctx(),
    );
    expect(res.isError).toBeUndefined();
    expect(res.content).toContain("Plan (1/3 done)");
    expect(res.content).toContain("[x] 1. read code");
    expect(res.content).toContain("[~] 2. write fix");
    expect(res.content).toContain("[ ] 3. test");
  });

  test("rejects an empty/invalid plan", async () => {
    const tool = new UpdatePlanTool();
    expect((await tool.execute({ steps: [] }, ctx())).isError).toBe(true);
    expect((await tool.execute({ steps: [{ title: "" }] }, ctx())).isError).toBe(true);
  });
});
