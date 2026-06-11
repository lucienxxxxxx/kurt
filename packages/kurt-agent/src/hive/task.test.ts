import { describe, expect, test } from "bun:test";
import { formatPlan, TaskGraph, type TaskSpec, type TaskState } from "./task.ts";

const t = (id: string, dependsOn: string[] = []): TaskSpec => ({ id, title: id.toUpperCase(), goal: `do ${id}`, dependsOn });

describe("TaskGraph validation", () => {
  test("accepts a valid DAG", () => {
    expect(() => new TaskGraph([t("a"), t("b", ["a"]), t("c", ["a", "b"])])).not.toThrow();
  });

  test("rejects duplicates, unknown deps, self-deps, cycles, and empty plans", () => {
    expect(() => new TaskGraph([])).toThrow(/no tasks/);
    expect(() => new TaskGraph([t("a"), t("a")])).toThrow(/duplicate/);
    expect(() => new TaskGraph([t("a", ["ghost"])])).toThrow(/unknown dependency/);
    expect(() => new TaskGraph([t("a", ["a"])])).toThrow(/depends on itself/);
    expect(() => new TaskGraph([t("a", ["b"]), t("b", ["a"])])).toThrow(/cycle/);
    expect(() => new TaskGraph([{ ...t("ok"), title: " " }])).toThrow(/missing title/);
  });
});

describe("TaskGraph scheduling helpers", () => {
  const graph = new TaskGraph([t("a"), t("b", ["a"]), t("c"), t("d", ["b", "c"])]);
  const states = (m: Record<string, TaskState>): Map<string, TaskState> =>
    new Map(graph.tasks.map((x) => [x.id, m[x.id] ?? "pending"]));

  test("ready: only pending tasks whose deps are all done", () => {
    expect(graph.ready(states({})).map((x) => x.id)).toEqual(["a", "c"]);
    expect(graph.ready(states({ a: "done" })).map((x) => x.id)).toEqual(["b", "c"]);
    expect(graph.ready(states({ a: "done", b: "done", c: "done" })).map((x) => x.id)).toEqual(["d"]);
  });

  test("blockedBy: pending tasks downstream of a failure", () => {
    expect(graph.blockedBy(states({ a: "failed" })).map((x) => x.id)).toEqual(["b"]);
    // once b is blocked, d is blocked transitively on the next pass
    expect(graph.blockedBy(states({ a: "failed", b: "blocked" })).map((x) => x.id)).toEqual(["d"]);
  });

  test("formatPlan renders one line per task with state marks", () => {
    const out = formatPlan(graph, states({ a: "done", b: "running" }));
    expect(out).toContain("[x] a — A");
    expect(out).toContain("[~] b — B  (deps: a)");
    expect(out).toContain("[ ] d — D  (deps: b, c)");
  });
});
