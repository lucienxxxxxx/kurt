/**
 * UpdatePlanTool — the agent records/updates a step-by-step plan as an ordered
 * checklist the user can see (mainly for plan mode). Stateless: the model passes
 * the FULL plan each call, and the formatted checklist is returned as the tool
 * result (the TUI renders it in the tool card). No engine event/state needed.
 */

import type { Tool, ToolContext, ToolResult, ToolSpec } from "../engine/index.ts";

type Status = "pending" | "in_progress" | "done";
const MARK: Record<Status, string> = { pending: "[ ]", in_progress: "[~]", done: "[x]" };

export class UpdatePlanTool implements Tool {
  readonly spec: ToolSpec = {
    name: "update_plan",
    description:
      "Record or update your step-by-step plan as an ordered checklist the user can " +
      "see. Call it whenever the plan changes. Pass the FULL list each time (it " +
      "replaces the previous plan). Each step has a `title` and optional `status` " +
      "(pending | in_progress | done).",
    inputSchema: {
      type: "object",
      properties: {
        steps: {
          type: "array",
          description: "The full, ordered list of steps.",
          items: {
            type: "object",
            properties: {
              title: { type: "string", description: "What the step does." },
              status: { type: "string", description: "pending | in_progress | done (default pending)." },
            },
            required: ["title"],
          },
        },
      },
      required: ["steps"],
    },
  };

  async execute(input: unknown, _ctx: ToolContext): Promise<ToolResult> {
    const steps = (input as { steps?: unknown })?.steps;
    if (!Array.isArray(steps) || steps.length === 0) {
      return { content: 'Invalid input: "steps" must be a non-empty array.', isError: true };
    }

    const lines: string[] = [];
    let n = 1;
    for (const raw of steps) {
      const s = (raw ?? {}) as { title?: unknown; status?: unknown };
      const title = typeof s.title === "string" ? s.title.trim() : "";
      if (title.length === 0) continue;
      const status: Status = s.status === "in_progress" || s.status === "done" ? s.status : "pending";
      lines.push(`${MARK[status]} ${n}. ${title}`);
      n++;
    }
    if (lines.length === 0) return { content: "Invalid input: no valid steps (each needs a title).", isError: true };

    const done = lines.filter((l) => l.startsWith(MARK.done)).length;
    return { content: `Plan (${done}/${lines.length} done):\n${lines.join("\n")}` };
  }
}
