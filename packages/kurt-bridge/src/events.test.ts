import { describe, expect, test } from "bun:test";
import type { Message } from "kurt-agent";
import { StepAccumulator, messagesToSteps } from "./events.ts";

describe("StepAccumulator", () => {
  test("thinking deltas accumulate into one step; closed with elapsed sec AND re-emitted", () => {
    let t = 1000;
    const acc = new StepAccumulator(() => t);
    acc.apply({ type: "thinking", text: "let me " });
    acc.apply({ type: "thinking", text: "think" });
    t = 4000; // 3s later
    const changed = acc.apply({ type: "llm_delta", text: "answer" });
    // the closed thinking step (with its final sec) must be re-emitted so the client
    // upserts it — otherwise it keeps the initial undefined sec and renders "0s".
    expect(changed.find((s) => s.type === "thinking")).toMatchObject({ type: "thinking", sec: 3 });
    expect(changed.find((s) => s.type === "text")).toMatchObject({ type: "text", text: "answer" });
    const steps = acc.steps();
    expect(steps).toHaveLength(2);
    expect(steps[0]).toMatchObject({ type: "thinking", text: "let me think", sec: 3 });
    expect(steps[1]).toMatchObject({ type: "text", text: "answer" });
  });

  test("llm_delta accumulates into one text step", () => {
    const acc = new StepAccumulator();
    acc.apply({ type: "llm_delta", text: "Hello " });
    const changed = acc.apply({ type: "llm_delta", text: "world" });
    expect(acc.steps()).toEqual([{ _id: 1, type: "text", text: "Hello world" }]);
    expect(changed[0]?._id).toBe(1); // same step upserted
  });

  test("a generic tool: call → output stream → result", () => {
    const acc = new StepAccumulator();
    acc.apply({ type: "tool_call", id: "c1", name: "shell", input: { command: "ls -la" } });
    acc.apply({ type: "tool_output", id: "c1", text: "partial..." });
    acc.apply({ type: "tool_result", id: "c1", content: "total 0\nfile.txt", isError: false });
    const tool = acc.steps()[0];
    expect(tool).toMatchObject({ type: "tool", name: "shell", cmd: "ls -la", out: "total 0\nfile.txt", isError: false });
  });

  test("write_file → tool step carries the target path as title", () => {
    const acc = new StepAccumulator();
    acc.apply({ type: "tool_call", id: "w1", name: "write_file", input: { path: "src/foo.ts", content: "x" } });
    expect(acc.steps()[0]).toMatchObject({ type: "tool", name: "write_file", title: "src/foo.ts" });
  });

  test("tool error result sets isError", () => {
    const acc = new StepAccumulator();
    acc.apply({ type: "tool_call", id: "c1", name: "shell", input: { command: "boom" } });
    acc.apply({ type: "tool_result", id: "c1", content: "failed", isError: true });
    expect(acc.steps()[0]).toMatchObject({ type: "tool", isError: true, out: "failed" });
  });

  test("read_file → read step with file + line range", () => {
    const acc = new StepAccumulator();
    acc.apply({ type: "tool_call", id: "r1", name: "read_file", input: { path: "/etc/hosts", offset: 1, limit: 18 } });
    expect(acc.steps()[0]).toEqual({ _id: 1, type: "read", file: "/etc/hosts", lines: "1-18" });
  });

  test("skill → skill step; result fills output with the '# Skill:' header stripped", () => {
    const acc = new StepAccumulator();
    acc.apply({ type: "tool_call", id: "s1", name: "skill", input: { name: "pdf" } });
    acc.apply({ type: "tool_result", id: "s1", content: "# Skill: pdf\n\n1. open\n2. extract", isError: false });
    expect(acc.steps()[0]).toMatchObject({ type: "skill", name: "pdf", input: "pdf", output: "1. open\n2. extract" });
  });

  test("turn/usage events produce no steps", () => {
    const acc = new StepAccumulator();
    expect(acc.apply({ type: "turn_start", turn: 1 })).toEqual([]);
    expect(acc.apply({ type: "usage", inputTokens: 1, outputTokens: 2, totalTokens: 3 })).toEqual([]);
    expect(acc.apply({ type: "turn_end", turn: 1, stopReason: "stop" })).toEqual([]);
    expect(acc.steps()).toEqual([]);
  });

  test("unknown tool_call id on output/result is ignored safely", () => {
    const acc = new StepAccumulator();
    expect(acc.apply({ type: "tool_output", id: "nope", text: "x" })).toEqual([]);
    expect(acc.apply({ type: "tool_result", id: "nope", content: "x", isError: false })).toEqual([]);
  });
});

describe("messagesToSteps (reload reconstruction)", () => {
  test("rebuilds user/thinking/text/tool steps and attaches tool results", () => {
    const messages: Message[] = [
      { role: "user", content: [{ type: "text", text: "tidy up" }] },
      {
        role: "assistant",
        content: [
          { type: "thinking", text: "plan it" },
          { type: "text", text: "On it." },
          { type: "tool_use", id: "t1", name: "shell", input: { command: "ls" } },
        ],
      },
      { role: "tool", content: [{ type: "tool_result", toolUseId: "t1", content: "a\nb", isError: false }] },
      { role: "assistant", content: [{ type: "text", text: "Done." }] },
    ];
    const steps = messagesToSteps(messages);
    expect(steps.map((s) => s.type)).toEqual(["user", "thinking", "text", "tool", "text"]);
    expect(steps[0]).toMatchObject({ type: "user", text: "tidy up" });
    expect(steps[3]).toMatchObject({ type: "tool", name: "shell", cmd: "ls", out: "a\nb", isError: false });
    expect(steps.map((s) => s._id)).toEqual([1, 2, 3, 4, 5]); // unique ids
  });

  test("read_file → read step; empty user message skipped", () => {
    const messages: Message[] = [
      { role: "user", content: [] },
      { role: "assistant", content: [{ type: "tool_use", id: "r1", name: "read_file", input: { path: "/a", offset: 1, limit: 5 } }] },
    ];
    const steps = messagesToSteps(messages);
    expect(steps).toEqual([{ _id: 1, type: "read", file: "/a", lines: "1-5" }]);
  });
});
