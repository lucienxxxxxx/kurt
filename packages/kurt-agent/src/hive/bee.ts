/**
 * Bee — one worker-bee execution: an Agent instantiated for a single task
 * (Bee(context, model, tools, taskSpec) per the architecture doc), run to
 * completion, condensed into a structured BeeResult.
 *
 * The bee's full event stream is folded into:
 *  - activity lines (for the live tool-card tail in the UI),
 *  - a final summary (the bee's last assistant text),
 *  - an artifact list (paths it wrote via write_file).
 */

import { Agent } from "../agent/agent.ts";
import { withRetry } from "../providers/retry.ts";
import type { Event, Message, ModelProvider, Tool } from "../engine/index.ts";
import type { TaskSpec } from "./task.ts";

export interface BeeRunOptions {
  task: TaskSpec;
  model: ModelProvider;
  tools: Tool[];
  system: string;
  /** The task brief (user message) — built by the queen, includes upstream handoffs. */
  brief: string;
  /** Safety bound on the bee's loop turns. Default 32 (a bound must exist —
   * unbounded bees can loop forever and parallel bees multiply the burn). */
  maxTurns?: number;
  signal?: AbortSignal;
  /** Called with a short human-readable line for each notable bee event. */
  onActivity?: (line: string) => void;
  /** Called with each real token-usage report from the bee's model calls. */
  onUsage?: (usage: { inputTokens: number; outputTokens: number; totalTokens: number }) => void;
}

export interface BeeResult {
  taskId: string;
  status: "done" | "failed";
  /** The bee's final report (its last assistant text), or an error description. */
  summary: string;
  /** Files the bee wrote (write_file paths, deduped, in order). */
  artifacts: string[];
  /** WHY it failed (maxTurns / API error / aborted) — shown first in the result. */
  reason?: string;
}

export async function runBee(opts: BeeRunOptions): Promise<BeeResult> {
  const agent = new Agent({
    // Transient API failures (429 rate limits under parallel bees, 5xx, network
    // blips) back off and retry instead of killing the bee mid-task.
    model: withRetry(opts.model, {
      onRetry: (attempt, error, delayMs) =>
        opts.onActivity?.(`⟳ model retry ${attempt} (${firstLine(error)}) in ${Math.ceil(delayMs / 1000)}s\n`),
    }),
    system: opts.system,
    tools: opts.tools,
    maxTurns: opts.maxTurns ?? 32,
  });

  const messages: Message[] = [{ role: "user", content: [{ type: "text", text: opts.brief }] }];

  let text = "";
  let lastTurnText = "";
  const artifacts: string[] = [];
  let failure: string | null = null;

  try {
    for await (const ev of agent.run(messages, opts.signal)) {
      const line = activityLine(ev);
      if (line) opts.onActivity?.(line);
      switch (ev.type) {
        case "turn_start":
          lastTurnText = "";
          break;
        case "llm_delta":
          lastTurnText += ev.text;
          text += ev.text;
          break;
        case "tool_call":
          if (ev.name === "write_file") {
            const path = (ev.input as { path?: unknown })?.path;
            if (typeof path === "string" && path.length > 0 && !artifacts.includes(path)) artifacts.push(path);
          }
          break;
        case "error":
          if (ev.fatal) failure = ev.message;
          break;
        case "aborted":
          failure = `aborted (${ev.reason})`;
          break;
        case "usage":
          opts.onUsage?.({ inputTokens: ev.inputTokens, outputTokens: ev.outputTokens, totalTokens: ev.totalTokens });
          break;
      }
    }
  } catch (err) {
    failure = err instanceof Error ? err.message : String(err);
  }

  // Prefer the final turn's text as the report (earlier turns are working notes).
  const summary = (lastTurnText.trim() || text.trim()).slice(0, 2000);
  if (failure) {
    return { taskId: opts.task.id, status: "failed", summary: summary || failure, artifacts, reason: failure };
  }
  return { taskId: opts.task.id, status: "done", summary: summary || "(no report)", artifacts };
}

/** Map a bee's engine event to a short activity line (or null to skip). */
function activityLine(ev: Event): string | null {
  switch (ev.type) {
    case "tool_call":
      return `→ ${ev.name}\n`;
    case "tool_result":
      return ev.isError ? `  ✗ ${firstLine(ev.content)}\n` : null;
    case "error":
      return `✗ ${firstLine(ev.message)}\n`;
    default:
      return null;
  }
}

function firstLine(s: string): string {
  return (s.split("\n")[0] ?? "").slice(0, 100);
}
