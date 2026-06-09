/**
 * Phase 1 acceptance tests — these encode the承重墙 (load-bearing) contract.
 *
 * Run: `bun test`
 */

import { describe, expect, test } from "bun:test";
import { runLoop } from "./loop.ts";
import type { Event } from "./types.ts";
import type { Tool, ToolContext, ToolResult } from "./tool.ts";
import { MockModel } from "../providers/mock-model.ts";

async function collect(events: AsyncIterable<Event>): Promise<Event[]> {
  const out: Event[] = [];
  for await (const e of events) out.push(e);
  return out;
}

function types(events: Event[]): string[] {
  return events.map((e) => e.type);
}

/** Invariant: every tool_call id has exactly one matching tool_result id. */
function assertNoDanglingToolCalls(events: Event[]): void {
  const calls = events.filter((e) => e.type === "tool_call").map((e) => (e as { id: string }).id);
  const results = events.filter((e) => e.type === "tool_result").map((e) => (e as { id: string }).id);
  for (const id of calls) {
    expect(results.filter((r) => r === id)).toHaveLength(1);
  }
  // And no orphan results either.
  for (const id of results) expect(calls).toContain(id);
}

// A tool whose execution we can hold open until aborted.
class SlowTool implements Tool {
  readonly spec = {
    name: "slow",
    description: "Blocks until aborted.",
    inputSchema: { type: "object" as const, properties: {} },
  };
  async execute(_input: unknown, ctx: ToolContext): Promise<ToolResult> {
    await new Promise<void>((_resolve, reject) => {
      const onAbort = () => {
        const err = new Error("Aborted");
        err.name = "AbortError";
        reject(err);
      };
      if (ctx.signal.aborted) return onAbort();
      ctx.signal.addEventListener("abort", onAbort, { once: true });
    });
    return { content: "never" };
  }
}

class ThrowingTool implements Tool {
  readonly spec = {
    name: "boom",
    description: "Always throws.",
    inputSchema: { type: "object" as const, properties: {} },
  };
  async execute(): Promise<ToolResult> {
    throw new Error("kaboom");
  }
}

// A tool that emits a sub-event before returning (Phase 7 seam check).
class EmittingTool implements Tool {
  readonly spec = {
    name: "emitter",
    description: "Emits an event then returns.",
    inputSchema: { type: "object" as const, properties: {} },
  };
  async execute(_input: unknown, ctx: ToolContext): Promise<ToolResult> {
    ctx.emit({ type: "llm_delta", text: "[from inside the tool]" });
    return { content: "emitted" };
  }
}

describe("runLoop — Phase 1 承重墙", () => {
  test("emits a complete, correctly-ordered event stream", async () => {
    const model = new MockModel([
      { text: "calling tool", toolCalls: [{ name: "boom", input: {} }] },
      { text: "done" },
    ]);
    // boom throws, but ordering/structure is what we assert here.
    const events = await collect(
      runLoop({
        system: "s",
        messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
        tools: [new ThrowingTool()],
        model,
      }),
    );

    const seq = types(events);

    // turn_start is first; the stream ends normally (no error/aborted tail).
    expect(seq[0]).toBe("turn_start");
    expect(seq).not.toContain("error");
    expect(seq).not.toContain("aborted");

    // All five core event types appear.
    for (const t of ["turn_start", "llm_delta", "tool_call", "tool_result", "turn_end"]) {
      expect(seq).toContain(t);
    }

    // Pairing holds, and tool_call precedes its tool_result.
    assertNoDanglingToolCalls(events);
    expect(seq.indexOf("tool_call")).toBeLessThan(seq.indexOf("tool_result"));

    // Two turns: a tool turn then a final text turn. Last event is a turn_end.
    expect(seq.filter((t) => t === "turn_start")).toHaveLength(2);
    expect(seq.at(-1)).toBe("turn_end");
  });

  test("a throwing tool becomes tool_result(isError) and the loop continues", async () => {
    const model = new MockModel([
      { toolCalls: [{ name: "boom", input: {} }] },
      { text: "recovered" },
    ]);
    const events = await collect(
      runLoop({
        system: "s",
        messages: [{ role: "user", content: [{ type: "text", text: "go" }] }],
        tools: [new ThrowingTool()],
        model,
      }),
    );

    const result = events.find((e) => e.type === "tool_result") as
      | { type: "tool_result"; isError: boolean; content: string }
      | undefined;
    expect(result?.isError).toBe(true);
    expect(result?.content).toContain("kaboom");

    // The loop kept going: we reached the second turn's final text + turn_end.
    expect(events.some((e) => e.type === "llm_delta" && e.text === "recovered")).toBe(true);
    expect(types(events).at(-1)).toBe("turn_end");
  });

  test("abort during tool execution interrupts cleanly with no dangling tool_call", async () => {
    const model = new MockModel([{ toolCalls: [{ name: "slow", input: {} }] }, { text: "unreached" }]);
    const controller = new AbortController();

    const iterable = runLoop({
      system: "s",
      messages: [{ role: "user", content: [{ type: "text", text: "go" }] }],
      tools: [new SlowTool()],
      model,
      signal: controller.signal,
    });

    // Abort shortly after the slow tool starts blocking.
    setTimeout(() => controller.abort(), 30);
    const events = await collect(iterable);
    const seq = types(events);

    // It did start the tool, then aborted — and ended with an `aborted` event.
    expect(seq).toContain("tool_call");
    expect(seq).toContain("aborted");
    expect(seq.at(-1)).toBe("aborted");

    // The crucial invariant: the tool_call was still paired with a result.
    assertNoDanglingToolCalls(events);
    const result = events.find((e) => e.type === "tool_result") as { isError: boolean } | undefined;
    expect(result?.isError).toBe(true);

    // The unreached second turn never ran.
    expect(events.some((e) => e.type === "llm_delta" && e.text === "unreached")).toBe(false);
  });

  test("abort before streaming yields a clean aborted stream with no tool_call", async () => {
    const model = new MockModel([{ toolCalls: [{ name: "slow", input: {} }] }]);
    const controller = new AbortController();
    controller.abort(); // already aborted

    const events = await collect(
      runLoop({
        system: "s",
        messages: [{ role: "user", content: [{ type: "text", text: "go" }] }],
        tools: [new SlowTool()],
        model,
        signal: controller.signal,
      }),
    );

    expect(types(events)).toEqual(["aborted"]);
  });

  test("ToolContext.emit bubbles events into the engine stream in order (Phase 7 seam)", async () => {
    const model = new MockModel([{ toolCalls: [{ name: "emitter", input: {} }] }, { text: "fin" }]);
    const events = await collect(
      runLoop({
        system: "s",
        messages: [{ role: "user", content: [{ type: "text", text: "go" }] }],
        tools: [new EmittingTool()],
        model,
      }),
    );

    const emittedIdx = events.findIndex((e) => e.type === "llm_delta" && e.text === "[from inside the tool]");
    const resultIdx = events.findIndex((e) => e.type === "tool_result");
    expect(emittedIdx).toBeGreaterThanOrEqual(0);
    // The tool's emit lands before its own tool_result (it ran during execute()).
    expect(emittedIdx).toBeLessThan(resultIdx);
    assertNoDanglingToolCalls(events);
  });

  test("an unknown tool name is reported as an error result, not a crash", async () => {
    const model = new MockModel([{ toolCalls: [{ name: "ghost", input: {} }] }, { text: "ok" }]);
    const events = await collect(
      runLoop({
        system: "s",
        messages: [{ role: "user", content: [{ type: "text", text: "go" }] }],
        tools: [],
        model,
      }),
    );
    const result = events.find((e) => e.type === "tool_result") as { isError: boolean; content: string };
    expect(result.isError).toBe(true);
    expect(result.content).toContain("Unknown tool: ghost");
    assertNoDanglingToolCalls(events);
  });
});
