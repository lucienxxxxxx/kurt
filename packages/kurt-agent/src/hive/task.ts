/**
 * Hive task model — the DAG of tasks the queen plans and the scheduler drives.
 * Pure data + pure validation (no I/O), so it's directly unit-testable.
 *
 * Task lifecycle (per the beehive architecture doc):
 *   pending → ready → running → done | failed
 *   blocked   = a dependency failed (or can never become ready)
 *   verifying / reopened are reserved for later rounds (review & re-open flows).
 */

export type TaskState =
  | "pending"
  | "ready"
  | "running"
  | "blocked"
  | "verifying"
  | "done"
  | "failed"
  | "reopened";

export interface TaskSpec {
  /** Short slug id, unique within the plan (e.g. "api-types"). */
  id: string;
  /** Human-readable title. */
  title: string;
  /** What the bee must accomplish. */
  goal: string;
  /** Ids of tasks that must be done first. */
  dependsOn: string[];
  /** Ownership: files/dirs this task may modify (advisory, written into the bee prompt). */
  files?: string[];
  /** Acceptance criteria, if the planner provided them. */
  acceptance?: string;
}

/** A validated task DAG. Throws on construction if the plan is malformed. */
export class TaskGraph {
  readonly tasks: TaskSpec[];
  #byId: Map<string, TaskSpec>;

  constructor(tasks: TaskSpec[]) {
    if (!Array.isArray(tasks) || tasks.length === 0) throw new Error("plan has no tasks");
    const seen = new Set<string>();
    for (const t of tasks) {
      if (typeof t.id !== "string" || !/^[a-z0-9][a-z0-9_-]*$/i.test(t.id)) {
        throw new Error(`invalid task id: ${JSON.stringify(t.id)}`);
      }
      if (seen.has(t.id)) throw new Error(`duplicate task id: ${t.id}`);
      seen.add(t.id);
      if (typeof t.title !== "string" || t.title.trim().length === 0) throw new Error(`task ${t.id}: missing title`);
      if (typeof t.goal !== "string" || t.goal.trim().length === 0) throw new Error(`task ${t.id}: missing goal`);
    }
    for (const t of tasks) {
      for (const dep of t.dependsOn) {
        if (!seen.has(dep)) throw new Error(`task ${t.id}: unknown dependency "${dep}"`);
        if (dep === t.id) throw new Error(`task ${t.id}: depends on itself`);
      }
    }
    this.tasks = tasks;
    this.#byId = new Map(tasks.map((t) => [t.id, t]));
    this.#assertAcyclic();
  }

  get(id: string): TaskSpec | undefined {
    return this.#byId.get(id);
  }

  /** Tasks whose dependencies are all done, given the current states. */
  ready(states: ReadonlyMap<string, TaskState>): TaskSpec[] {
    return this.tasks.filter(
      (t) => states.get(t.id) === "pending" && t.dependsOn.every((d) => states.get(d) === "done"),
    );
  }

  /** Tasks that can never run because some (transitive) dependency failed. */
  blockedBy(states: ReadonlyMap<string, TaskState>): TaskSpec[] {
    return this.tasks.filter((t) => {
      if (states.get(t.id) !== "pending") return false;
      return t.dependsOn.some((d) => states.get(d) === "failed" || states.get(d) === "blocked");
    });
  }

  #assertAcyclic(): void {
    const visiting = new Set<string>();
    const done = new Set<string>();
    const visit = (id: string): void => {
      if (done.has(id)) return;
      if (visiting.has(id)) throw new Error(`dependency cycle involving "${id}"`);
      visiting.add(id);
      for (const dep of this.#byId.get(id)!.dependsOn) visit(dep);
      visiting.delete(id);
      done.add(id);
    };
    for (const t of this.tasks) visit(t.id);
  }
}

/** One-line-per-task plan table (shown in the hive_plan tool card). */
export function formatPlan(graph: TaskGraph, states?: ReadonlyMap<string, TaskState>): string {
  const mark = (s: TaskState | undefined): string =>
    s === "done" ? "[x]" : s === "running" ? "[~]" : s === "failed" ? "[✗]" : s === "blocked" ? "[!]" : "[ ]";
  return graph.tasks
    .map((t) => {
      const deps = t.dependsOn.length > 0 ? `  (deps: ${t.dependsOn.join(", ")})` : "";
      const files = t.files && t.files.length > 0 ? `  files: ${t.files.join(", ")}` : "";
      return `${mark(states?.get(t.id))} ${t.id} — ${t.title}${deps}${files}`;
    })
    .join("\n");
}
