/**
 * Queen — the hive's scheduling core. MVP shape (user-confirmed):
 *   1. ONE structured LLM call decomposes the goal into a task DAG (planTasks);
 *   2. a DETERMINISTIC scheduler drives the state machine — dispatches READY
 *      tasks to bees (bounded concurrency), collects structured BeeResults,
 *      blocks dependents of failures;
 *   3. one final LLM call streams the run summary.
 *
 * It emits STANDARD engine events (synthesized in this composition layer), so
 * any existing front-end renders a hive run with zero changes:
 *   - the plan = one `hive_plan` tool card,
 *   - each task = one `bee` tool card (live activity via tool_output, result on
 *     completion),
 *   - the queen's summary = ordinary llm_delta text.
 * The engine itself is untouched (铁律 #3) — this reuses runLoop via Agent/runBee.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { AsyncEventQueue } from "../engine/index.ts";
import type { Event, ModelProvider, ModelRequest, Tool } from "../engine/index.ts";
import { runBee, type BeeResult } from "./bee.ts";
import { formatPlan, TaskGraph, type TaskSpec, type TaskState } from "./task.ts";

// ── Planning ─────────────────────────────────────────────────────────────────

const PLAN_TOOL = {
  name: "submit_plan",
  description: "Submit the final task plan. Call exactly once with the full task list.",
  inputSchema: {
    type: "object" as const,
    properties: {
      tasks: {
        type: "array" as const,
        description: "2-6 tasks. Parallelize where possible; depend only where truly needed.",
        items: {
          type: "object" as const,
          properties: {
            id: { type: "string" as const, description: "short-slug-id" },
            title: { type: "string" as const },
            goal: { type: "string" as const, description: "What the worker must accomplish, concretely." },
            dependsOn: { type: "array" as const, items: { type: "string" as const } },
            files: { type: "array" as const, items: { type: "string" as const }, description: "Files/dirs this task owns (others must not touch them)." },
            acceptance: { type: "string" as const, description: "How to judge it done." },
          },
          required: ["id", "title", "goal"],
        },
      },
    },
    required: ["tasks"],
  },
};

const PLANNER_SYSTEM = [
  "You are the queen of a hive of worker-bee agents working IN PARALLEL in one shared workspace.",
  "Decompose the user's goal into 2-6 concrete tasks for the bees.",
  "Rules: tasks that can run in parallel must NOT depend on each other; give each task an",
  "exclusive `files` ownership list so parallel bees never edit the same file; put shared",
  "contracts (types/schemas/interfaces) in an early task others depend on.",
  "You MUST call the submit_plan tool exactly once with the full list. NEVER answer in plain text.",
].join("\n");

/** Pull a {"tasks":[…]} object out of free text (handles ```json fences / prose). */
function extractPlanJson(text: string): unknown {
  const cleaned = text.replace(/```[a-z]*\n?/gi, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
}

/** A real token-usage report from one model call. */
export interface UsageReport {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

/** Run one planning round; prefer the tool call, fall back to JSON in the text. */
async function planAttempt(
  planner: ModelProvider,
  request: ModelRequest,
  signal: AbortSignal,
  onUsage?: (u: UsageReport) => void,
): Promise<{ raw: unknown; text: string }> {
  let raw: unknown = null;
  let text = "";
  for await (const ev of planner.stream(request, signal)) {
    if (ev.type === "tool_use" && ev.name === "submit_plan") raw = ev.input;
    else if (ev.type === "text_delta") text += ev.text;
    else if (ev.type === "usage") onUsage?.(ev);
  }
  if (raw == null) raw = extractPlanJson(text);
  return { raw, text };
}

/** One structured LLM call → a validated TaskGraph (retried once in JSON-only mode). */
export async function planTasks(
  planner: ModelProvider,
  goal: string,
  context: string,
  signal: AbortSignal,
  maxTasks = 10,
  onUsage?: (u: UsageReport) => void,
): Promise<TaskGraph> {
  const userMsg = { role: "user" as const, content: [{ type: "text" as const, text: `${goal}\n\nWorkspace context:\n${context}` }] };
  let { raw, text } = await planAttempt(planner, { system: PLANNER_SYSTEM, messages: [userMsg], tools: [PLAN_TOOL] }, signal, onUsage);

  // Some models ignore the tool and chat instead — retry once demanding bare JSON.
  if (!Array.isArray((raw as { tasks?: unknown })?.tasks)) {
    ({ raw, text } = await planAttempt(
      planner,
      {
        system:
          PLANNER_SYSTEM +
          '\nThe tool is unavailable: respond with ONLY this JSON shape — no prose, no code fences:\n' +
          '{"tasks":[{"id":"short-slug","title":"...","goal":"...","dependsOn":[],"files":["path"],"acceptance":"..."}]}',
        messages: [userMsg],
        tools: [],
      },
      signal,
      onUsage,
    ));
  }

  const tasks = (raw as { tasks?: unknown })?.tasks;
  if (!Array.isArray(tasks)) {
    const said = text.trim().slice(0, 200);
    throw new Error(`planner did not produce a task plan${said ? ` — model said: "${said}"` : ""}`);
  }
  if (tasks.length > maxTasks) throw new Error(`planner produced ${tasks.length} tasks (max ${maxTasks})`);

  const specs = normalizePlan(tasks);
  try {
    return new TaskGraph(specs); // validates ids/deps/cycles
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`invalid plan: ${msg} — plan was: ${JSON.stringify(specs).slice(0, 300)}`);
  }
}

/**
 * Coerce a model-produced plan into TaskSpecs. Models drift from the schema
 * (name/description/depends_on/snake_case, missing ids), so accept the common
 * aliases, derive missing ids from titles, and let title/goal back-fill each
 * other — only a task with NEITHER is unusable.
 */
function normalizePlan(tasks: unknown[]): TaskSpec[] {
  const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim().length > 0 ? v.trim() : undefined);
  const list = (...vs: unknown[]): string[] | undefined => {
    for (const v of vs) if (Array.isArray(v)) return v.map(String).filter((s) => s.length > 0);
    return undefined;
  };
  const slugify = (s: string): string =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 32);

  const used = new Set<string>();
  return tasks.map((t, i) => {
    const o = (t ?? {}) as Record<string, unknown>;
    const title = str(o.title) ?? str(o.name) ?? str(o.task);
    const goal = str(o.goal) ?? str(o.description) ?? str(o.detail) ?? str(o.objective);
    let id = str(o.id) ?? str(o.slug) ?? (slugify(title ?? "") || `task-${i + 1}`);
    if (!/^[a-z0-9][a-z0-9_-]*$/i.test(id)) id = slugify(id) || `task-${i + 1}`;
    while (used.has(id)) id = `${id}-${i + 1}`; // dedupe generated ids
    used.add(id);
    return {
      id,
      title: title ?? (goal ? goal.slice(0, 60) : ""), // TaskGraph rejects if still empty
      goal: goal ?? title ?? "",
      dependsOn: list(o.dependsOn, o.depends_on, o.deps, o.dependencies, o.after) ?? [],
      files: list(o.files, o.ownership, o.paths),
      acceptance: str(o.acceptance) ?? str(o.acceptance_criteria) ?? str(o.done_when),
    };
  });
}

// ── The hive run ─────────────────────────────────────────────────────────────

export interface HiveOptions {
  goal: string;
  /** Model for the planning call. */
  planner: ModelProvider;
  /** Model for the final summary (default: planner). */
  summarizer?: ModelProvider;
  /** Model used by each bee (a factory, so callers can vary per task). */
  beeModel: (task: TaskSpec) => ModelProvider;
  /** Tools each bee gets (shared instances are fine — they're re-entrant). */
  beeTools: (task: TaskSpec) => Tool[];
  /** System prompt for a bee (the caller injects workspace specifics). */
  beeSystem: (task: TaskSpec, plan: TaskSpec[]) => string;
  /** Short workspace description fed to the planner. */
  context?: string;
  /** Max bees running at once. Default 3. */
  concurrency?: number;
  beeMaxTurns?: number;
  maxTasks?: number;
  signal?: AbortSignal;
  /** Directory to persist status.json into (created if missing). */
  statusDir?: string;
}

interface TaskRecord {
  state: TaskState;
  summary?: string;
  artifacts?: string[];
}

/** Run a full hive: plan → schedule bees over the DAG → summarize. */
export function runHive(opts: HiveOptions): AsyncIterable<Event> {
  const queue = new AsyncEventQueue<Event>();
  const signal = opts.signal ?? new AbortController().signal;
  void drive(opts, queue, signal)
    .catch((err: unknown) => {
      queue.push({ type: "error", message: err instanceof Error ? err.message : String(err), fatal: true });
    })
    .finally(() => queue.close());
  return queue;
}

async function drive(opts: HiveOptions, queue: AsyncEventQueue<Event>, signal: AbortSignal): Promise<void> {
  const emit = (e: Event): void => queue.push(e);
  const startedAt = Date.now();
  emit({ type: "turn_start", turn: 1 });

  // Aggregate token usage across the planner + ALL bees + the summarizer, and
  // re-emit CUMULATIVE totals (front-ends show the latest usage event as-is).
  const totals = { input: 0, output: 0, total: 0 };
  const addUsage = (u: UsageReport): void => {
    totals.input += u.inputTokens;
    totals.output += u.outputTokens;
    totals.total += u.totalTokens;
    emit({ type: "usage", inputTokens: totals.input, outputTokens: totals.output, totalTokens: totals.total });
  };

  // 1. Plan (one structured call), shown as a tool card.
  emit({ type: "tool_call", id: "hive-plan", name: "hive_plan", input: { goal: opts.goal } });
  let graph: TaskGraph;
  try {
    graph = await planTasks(opts.planner, opts.goal, opts.context ?? "", signal, opts.maxTasks ?? 10, addUsage);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    emit({ type: "tool_result", id: "hive-plan", content: `Planning failed: ${msg}`, isError: true });
    emit({ type: "error", message: `hive planning failed: ${msg}`, fatal: true });
    return;
  }
  emit({ type: "tool_result", id: "hive-plan", content: `${graph.tasks.length} tasks:\n${formatPlan(graph)}`, isError: false });

  // 2. Mechanical scheduling over the DAG.
  const records = new Map<string, TaskRecord>(graph.tasks.map((t) => [t.id, { state: "pending" as TaskState }]));
  const states = (): Map<string, TaskState> => new Map([...records].map(([id, r]) => [id, r.state]));
  const writeStatus = (): void => persistStatus(opts, graph, records, startedAt);
  writeStatus();

  const running = new Map<string, Promise<BeeResult>>();
  const concurrency = Math.max(1, opts.concurrency ?? 3);

  const dispatch = (task: TaskSpec): void => {
    records.get(task.id)!.state = "running";
    emit({
      type: "tool_call",
      id: `bee:${task.id}`,
      name: "bee",
      input: { task: task.id, title: task.title, dependsOn: task.dependsOn, files: task.files ?? [] },
    });
    const brief = beeBrief(task, graph, records);
    running.set(
      task.id,
      runBee({
        task,
        model: opts.beeModel(task),
        tools: opts.beeTools(task),
        system: opts.beeSystem(task, graph.tasks),
        brief,
        maxTurns: opts.beeMaxTurns,
        signal,
        onActivity: (line) => emit({ type: "tool_output", id: `bee:${task.id}`, text: line }),
        onUsage: addUsage,
      }),
    );
  };

  while (true) {
    if (signal.aborted) {
      emit({ type: "aborted", reason: "signal" });
      return;
    }
    // Block dependents of failures, then dispatch everything ready (bounded).
    for (const t of graph.blockedBy(states())) records.get(t.id)!.state = "blocked";
    for (const t of graph.ready(states())) {
      if (running.size >= concurrency) break;
      dispatch(t);
    }
    writeStatus();
    if (running.size === 0) break; // nothing running and nothing ready → finished (or all blocked)

    // Wait for the next bee to settle, record it, loop again.
    const result = await Promise.race(running.values());
    running.delete(result.taskId);
    const rec = records.get(result.taskId)!;
    rec.state = result.status;
    rec.summary = result.summary;
    rec.artifacts = result.artifacts;
    const body = [
      // The reason goes on the FIRST line so output clipping can never hide it.
      `status: ${result.status}${result.reason ? ` — ${result.reason}` : ""}`,
      result.summary,
      result.artifacts.length > 0 ? `artifacts:\n${result.artifacts.map((a) => `- ${a}`).join("\n")}` : "",
    ]
      .filter((s) => s.length > 0)
      .join("\n");
    emit({ type: "tool_result", id: `bee:${result.taskId}`, content: body, isError: result.status === "failed" });
    writeStatus();
  }

  // 3. Queen's final summary, streamed as ordinary assistant text.
  const summarizer = opts.summarizer ?? opts.planner;
  try {
    for await (const ev of summarizer.stream(summaryRequest(opts.goal, graph, records), signal)) {
      if (ev.type === "text_delta") emit({ type: "llm_delta", text: ev.text });
      else if (ev.type === "usage") addUsage(ev);
    }
  } catch {
    emit({ type: "llm_delta", text: fallbackSummary(graph, records) });
  }
  emit({ type: "turn_end", turn: 1, stopReason: "end_turn" });
  persistStatus(opts, graph, records, startedAt, Date.now());
}

/** The task brief a bee receives — includes upstream handoffs (结构化交接). */
function beeBrief(task: TaskSpec, graph: TaskGraph, records: Map<string, TaskRecord>): string {
  const lines = [
    `Task: ${task.title}`,
    `Goal: ${task.goal}`,
    task.acceptance ? `Acceptance: ${task.acceptance}` : "",
    task.files && task.files.length > 0
      ? `You may ONLY modify these files/dirs (other bees own the rest): ${task.files.join(", ")}`
      : "Modify only what your task strictly requires.",
  ];
  const handoffs = task.dependsOn
    .map((d) => {
      const dep = graph.get(d);
      const rec = records.get(d);
      return dep && rec?.summary ? `- ${dep.title}: ${rec.summary.slice(0, 500)}` : null;
    })
    .filter((s): s is string => s !== null);
  if (handoffs.length > 0) lines.push("", "Upstream results (already done):", ...handoffs);
  lines.push("", "Do the work now using your tools, then reply with a SHORT report of what you did.");
  return lines.filter((l) => l !== "").join("\n");
}

function summaryRequest(goal: string, graph: TaskGraph, records: Map<string, TaskRecord>): ModelRequest {
  const report = graph.tasks
    .map((t) => {
      const r = records.get(t.id)!;
      const arts = r.artifacts?.length ? ` [files: ${r.artifacts.join(", ")}]` : "";
      return `${t.id} (${r.state})${arts}: ${r.summary ?? "-"}`;
    })
    .join("\n");
  return {
    system: "You are the hive queen reporting to the user. Be concise and factual.",
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text:
              `Goal: ${goal}\n\nTask results:\n${report}\n\n` +
              "Summarize what was accomplished, list files changed, and call out any failed/blocked tasks with next steps.",
          },
        ],
      },
    ],
    tools: [],
  };
}

function fallbackSummary(graph: TaskGraph, records: Map<string, TaskRecord>): string {
  const done = graph.tasks.filter((t) => records.get(t.id)!.state === "done").length;
  return `Hive run finished: ${done}/${graph.tasks.length} tasks done.\n${formatPlan(graph, new Map([...records].map(([id, r]) => [id, r.state])))}`;
}

/** Persist status.json (per the doc's standard artifacts) when a statusDir is set. */
function persistStatus(
  opts: HiveOptions,
  graph: TaskGraph,
  records: Map<string, TaskRecord>,
  startedAt: number,
  finishedAt?: number,
): void {
  if (!opts.statusDir) return;
  try {
    mkdirSync(opts.statusDir, { recursive: true });
    const snapshot = {
      goal: opts.goal,
      startedAt,
      ...(finishedAt ? { finishedAt } : {}),
      tasks: graph.tasks.map((t) => {
        const r = records.get(t.id)!;
        return {
          id: t.id,
          title: t.title,
          goal: t.goal,
          dependsOn: t.dependsOn,
          files: t.files ?? [],
          state: r.state,
          ...(r.summary ? { summary: r.summary } : {}),
          ...(r.artifacts && r.artifacts.length > 0 ? { artifacts: r.artifacts } : {}),
        };
      }),
    };
    // Sync write: small file, and it guarantees the snapshot is on disk when the
    // run's event stream completes (no fire-and-forget race).
    writeFileSync(join(opts.statusDir, "status.json"), JSON.stringify(snapshot, null, 2));
  } catch {
    // status persistence is best-effort; never fail the run over it
  }
}
