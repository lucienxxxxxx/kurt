import { describe, expect, test } from "bun:test";
import { Agent } from "./agent.ts";
import { ToolHub } from "./tool-hub.ts";
import { MockModel } from "../providers/mock-model.ts";
import type { Event, Tool, ToolContext, ToolResult } from "../engine/index.ts";

function fakeTool(name: string): Tool {
  return {
    spec: { name, description: name, inputSchema: { type: "object", properties: {} } },
    async execute(_i: unknown, _c: ToolContext): Promise<ToolResult> {
      return { content: `${name}-ran` };
    },
  };
}

async function collect(events: AsyncIterable<Event>): Promise<Event[]> {
  const out: Event[] = [];
  for await (const e of events) out.push(e);
  return out;
}

describe("ToolHub", () => {
  const hub = new ToolHub([fakeTool("read_file"), fakeTool("write_file"), fakeTool("ask_user")]);

  test("get() returns the named subset in order, skipping unknowns", () => {
    expect(hub.get(["ask_user", "read_file", "nope"]).map((t) => t.spec.name)).toEqual(["ask_user", "read_file"]);
  });

  test("all() / names() / has()", () => {
    expect(hub.names().sort()).toEqual(["ask_user", "read_file", "write_file"]);
    expect(hub.all()).toHaveLength(3);
    expect(hub.has("write_file")).toBe(true);
    expect(hub.has("ghost")).toBe(false);
  });
});

describe("Agent", () => {
  test("run() drives runLoop with its model + tools", async () => {
    const model = new MockModel([{ text: "hello" }]);
    const agent = new Agent({ model, system: "s", tools: [fakeTool("read_file")] });
    const events = await collect(agent.run([{ role: "user", content: [{ type: "text", text: "hi" }] }]));
    expect(events.some((e) => e.type === "turn_end")).toBe(true);
    expect(model.requests[0]!.tools.map((t) => t.name)).toEqual(["read_file"]);
  });

  test("with() derives a variant carrying a different toolset", () => {
    const base = new Agent({ model: new MockModel([]), system: "s", tools: [fakeTool("a")] });
    const variant = base.with({ tools: [fakeTool("b"), fakeTool("c")] });
    expect(variant.tools.map((t) => t.spec.name)).toEqual(["b", "c"]);
    expect(base.tools.map((t) => t.spec.name)).toEqual(["a"]); // base unchanged
  });
});
