/**
 * Offline hive tests — planner/bees/summarizer are all MockModels; bee tools are
 * fakes. Verifies the MVP claims: DAG-driven dispatch with parallelism, structured
 * handoff, failure → blocked dependents, and the status.json artifact.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MockModel } from "../providers/mock-model.ts";
import type { Event, ModelProvider, Tool } from "../engine/index.ts";
import { planTasks, runHive } from "./queen.ts";
import type { TaskSpec } from "./task.ts";

const okTool = (name: string): Tool => ({
  spec: { name, description: name, inputSchema: { type: "object", properties: {} } },
  async execute() {
    return { content: "ok" };
  },
});

const failingModel: ModelProvider = {
  name: "boom",
  async countTokens() {
    return 0;
  },
  // eslint-disable-next-line require-yield
  async *stream(): AsyncIterable<never> {
    throw new Error("model exploded");
  },
};

async function collect(events: AsyncIterable<Event>): Promise<Event[]> {
  const out: Event[] = [];
  for await (const e of events) out.push(e);
  return out;
}

const PLAN = {
  tasks: [
    { id: "types", title: "Define types", goal: "write shared types", dependsOn: [], files: ["src/types.ts"] },
    { id: "api", title: "Build API", goal: "implement api", dependsOn: ["types"] },
    { id: "docs", title: "Write docs", goal: "write docs", dependsOn: [] },
  ],
};

describe("planTasks", () => {
  test("parses a submit_plan tool call into a validated TaskGraph", async () => {
    const planner = new MockModel([{ toolCalls: [{ name: "submit_plan", input: PLAN }] }]);
    const graph = await planTasks(planner, "build it", "", new AbortController().signal);
    expect(graph.tasks.map((t) => t.id)).toEqual(["types", "api", "docs"]);
    expect(graph.get("api")!.dependsOn).toEqual(["types"]);
  });

  test("falls back to JSON in plain text; errors when there is no plan", async () => {
    const jsonPlanner = new MockModel([{ text: `Here you go: ${JSON.stringify(PLAN)}` }]);
    const graph = await planTasks(jsonPlanner, "g", "", new AbortController().signal);
    expect(graph.tasks).toHaveLength(3);

    const chatty = new MockModel([{ text: "I would split this into a few tasks..." }]);
    await expect(planTasks(chatty, "g", "", new AbortController().signal)).rejects.toThrow(/no submit_plan/);
  });
});

describe("runHive", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "kurt-hive-"));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  function baseOptions(beeModel: (task: TaskSpec) => ModelProvider) {
    return {
      goal: "build it",
      planner: new MockModel([{ toolCalls: [{ name: "submit_plan", input: PLAN }] }]),
      summarizer: new MockModel([{ text: "QUEEN SUMMARY" }]),
      beeModel,
      beeTools: () => [okTool("write_file")],
      beeSystem: (task: TaskSpec) => `you are bee ${task.id}`,
      statusDir: dir,
    };
  }

  test("dispatches by DAG (parallel roots first, dependent after), streams the summary", async () => {
    const events = await collect(
      runHive(
        baseOptions(
          (task) =>
            new MockModel([
              task.id === "types"
                ? { toolCalls: [{ name: "write_file", input: { path: "src/types.ts", content: "x" } }] }
                : { text: `did ${task.id}` },
              { text: `report: ${task.id} finished` },
            ]),
        ),
      ),
    );

    const seq = events.filter((e) => e.type === "tool_call" || e.type === "tool_result") as Array<{
      type: string;
      id: string;
      name?: string;
      isError?: boolean;
    }>;
    // Plan card first.
    expect(seq[0]).toMatchObject({ type: "tool_call", id: "hive-plan", name: "hive_plan" });
    expect(seq[1]).toMatchObject({ type: "tool_result", id: "hive-plan", isError: false });

    // Both roots (types, docs) dispatched in parallel BEFORE any bee result.
    const calls = seq.filter((e) => e.type === "tool_call").map((e) => e.id);
    const firstResultIdx = seq.findIndex((e) => e.type === "tool_result" && e.id.startsWith("bee:"));
    const callsBeforeFirstResult = seq.slice(0, firstResultIdx).filter((e) => e.type === "tool_call").map((e) => e.id);
    expect(callsBeforeFirstResult).toContain("bee:types");
    expect(callsBeforeFirstResult).toContain("bee:docs");

    // The dependent task only starts after its dependency's result.
    const typesResultIdx = seq.findIndex((e) => e.type === "tool_result" && e.id === "bee:types");
    const apiCallIdx = seq.findIndex((e) => e.type === "tool_call" && e.id === "bee:api");
    expect(apiCallIdx).toBeGreaterThan(typesResultIdx);
    expect(calls).toEqual(expect.arrayContaining(["bee:types", "bee:docs", "bee:api"]));

    // Artifact captured from the bee's write_file call; summary streamed as text.
    const typesResult = events.find((e) => e.type === "tool_result" && (e as { id: string }).id === "bee:types") as {
      content: string;
    };
    expect(typesResult.content).toContain("src/types.ts");
    const text = events.filter((e) => e.type === "llm_delta").map((e) => (e as { text: string }).text).join("");
    expect(text).toContain("QUEEN SUMMARY");
    expect(events.at(-1)).toMatchObject({ type: "turn_end" });
  });

  test("a failed bee blocks its dependents; status.json records everything", async () => {
    const events = await collect(
      runHive(baseOptions((task) => (task.id === "types" ? failingModel : new MockModel([{ text: `did ${task.id}` }])))),
    );

    const typesResult = events.find(
      (e) => e.type === "tool_result" && (e as { id: string }).id === "bee:types",
    ) as { isError: boolean };
    expect(typesResult.isError).toBe(true);
    // api (depends on types) must never have been dispatched.
    expect(events.some((e) => e.type === "tool_call" && (e as { id: string }).id === "bee:api")).toBe(false);

    const status = JSON.parse(readFileSync(join(dir, "status.json"), "utf8")) as {
      tasks: Array<{ id: string; state: string }>;
    };
    const byId = Object.fromEntries(status.tasks.map((t) => [t.id, t.state]));
    expect(byId.types).toBe("failed");
    expect(byId.api).toBe("blocked");
    expect(byId.docs).toBe("done");
  });

  test("planning failure surfaces as an error card + fatal error event", async () => {
    const events = await collect(
      runHive({
        ...baseOptions(() => new MockModel([{ text: "unused" }])),
        planner: new MockModel([{ text: "no plan from me" }]),
      }),
    );
    const planResult = events.find((e) => e.type === "tool_result") as { isError: boolean; content: string };
    expect(planResult.isError).toBe(true);
    expect(events.some((e) => e.type === "error" && (e as { fatal: boolean }).fatal)).toBe(true);
  });
});
