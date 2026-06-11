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

  test("falls back to JSON in plain text (incl. ```json fences)", async () => {
    const jsonPlanner = new MockModel([{ text: `Here you go: ${JSON.stringify(PLAN)}` }]);
    expect((await planTasks(jsonPlanner, "g", "", new AbortController().signal)).tasks).toHaveLength(3);

    const fenced = new MockModel([{ text: "```json\n" + JSON.stringify(PLAN) + "\n```" }]);
    expect((await planTasks(fenced, "g", "", new AbortController().signal)).tasks).toHaveLength(3);
  });

  test("normalizes alias/snake_case fields, numeric ids, and missing titles (live-failure repro)", async () => {
    // Repro of the real DeepSeek failure: tasks with id "1", name/description
    // instead of title/goal, depends_on instead of dependsOn.
    const messy = {
      tasks: [
        { id: "1", name: "设计页面结构", description: "搭好 index.html 骨架", files: ["index.html"] },
        { id: "2", description: "写样式", depends_on: ["1"], ownership: ["style.css"] },
        { name: "联调", description: "整合页面与样式", dependencies: ["1", "2"] },
      ],
    };
    const planner = new MockModel([{ toolCalls: [{ name: "submit_plan", input: messy }] }]);
    const graph = await planTasks(planner, "build webui", "", new AbortController().signal);

    expect(graph.tasks).toHaveLength(3);
    expect(graph.get("1")!.title).toBe("设计页面结构"); // name → title
    expect(graph.get("2")!.title).toBe("写样式"); // description backfills the missing title
    expect(graph.get("2")!.dependsOn).toEqual(["1"]); // depends_on → dependsOn
    expect(graph.get("2")!.files).toEqual(["style.css"]); // ownership → files
    const third = graph.tasks[2]!;
    expect(third.dependsOn).toEqual(["1", "2"]); // dependencies → dependsOn
    expect(third.id.length).toBeGreaterThan(0); // id derived (slug or task-3)
  });

  test("invalid plans fail with the offending plan attached", async () => {
    const bad = { tasks: [{ id: "a", title: "A", goal: "g", dependsOn: ["ghost"] }] };
    const planner = new MockModel([
      { toolCalls: [{ name: "submit_plan", input: bad }] },
      { toolCalls: [{ name: "submit_plan", input: bad }] }, // retry gets the same bad plan
    ]);
    await expect(planTasks(planner, "g", "", new AbortController().signal)).rejects.toThrow(
      /unknown dependency.*plan was:/,
    );
  });

  test("retries once in JSON-only mode when the model chats instead of planning", async () => {
    const planner = new MockModel([
      { text: "我会把这个项目拆分成几个任务……" }, // first attempt: prose, no plan
      { text: JSON.stringify(PLAN) }, // retry: bare JSON
    ]);
    const graph = await planTasks(planner, "g", "", new AbortController().signal);
    expect(graph.tasks.map((t) => t.id)).toEqual(["types", "api", "docs"]);
  });

  test("errors (with the model's words) when both attempts produce no plan", async () => {
    const chatty = new MockModel([{ text: "I would split this into tasks..." }, { text: "still chatting" }]);
    await expect(planTasks(chatty, "g", "", new AbortController().signal)).rejects.toThrow(
      /did not produce a task plan.*still chatting/,
    );
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
    ) as { isError: boolean; content: string };
    expect(typesResult.isError).toBe(true);
    // The WHY is on the first line of the result, so clipping can never hide it.
    expect(typesResult.content.split("\n")[0]).toContain("model exploded");
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

  test("aggregates bee usage into cumulative usage events", async () => {
    // A bee model that reports real token usage (MockModel doesn't).
    const usageModel: ModelProvider = {
      name: "usage",
      async countTokens() {
        return 0;
      },
      async *stream() {
        yield { type: "usage" as const, inputTokens: 60, outputTokens: 40, totalTokens: 100 };
        yield { type: "text_delta" as const, text: "done" };
        yield { type: "done" as const, stopReason: "end_turn" };
      },
    };
    const events = await collect(runHive(baseOptions(() => usageModel)));
    const usages = events.filter((e) => e.type === "usage") as Array<{ totalTokens: number }>;
    expect(usages.length).toBeGreaterThanOrEqual(3); // one per bee, cumulative
    // Three bees × 100 tokens each → the final cumulative total is 300.
    expect(usages.at(-1)!.totalTokens).toBe(300);
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
