/**
 * Operating modes — the single source of truth for chat/agent/plan, shared by
 * every front-end (kurt-tui + kurt-bridge) so the tool subset and the per-mode
 * guidance can't drift apart between consumers.
 *
 * A mode is just an `AgentProfile` shape: a named tool subset + a guidance string
 * appended to the base system prompt. The base persona/system stays per-front-end
 * (a coding-assistant prompt in the TUI, the "Kurt" cognitive-partner prompt on the
 * desktop) — only the mode-specific tooling + guidance is unified here.
 *
 * 铁律 #3: this is orchestration data, not engine code. The engine never sees a Mode.
 */

import type { ToolHub } from "./tool-hub.ts";
import type { Tool } from "../engine/index.ts";

/** The three operating modes: chat = read-only, plan = +planning, agent = full. */
export type Mode = "chat" | "agent" | "plan";

/**
 * Read-only base tool set (chat mode). Notes on the two "safe-everywhere" tools:
 * - `request_access` is gated by approval and, in read-only modes, its kind:"write"
 *   grant also widens the shared readable roots — i.e. it's the escape hatch for
 *   reading OUTSIDE the workspace. Keeping it in chat/plan is deliberate.
 * - `skill` is a read-only loader (no approval), useful for exploration.
 * Both are harmless without write/exec, so they belong in every mode.
 */
export const READ_ONLY_TOOLS: readonly string[] = [
  "read_file",
  "ls",
  "grep",
  "web_search",
  "memory",
  "ask_user",
  "skill",
  "request_access",
];

/** Tool names each mode exposes ("all" = the whole hub, i.e. agent mode). */
export const MODE_TOOLS: Record<Mode, readonly string[] | "all"> = {
  chat: READ_ONLY_TOOLS,
  plan: [...READ_ONLY_TOOLS, "update_plan"],
  agent: "all",
};

/** The tool-name allowlist for a mode (or "all"). */
export function modeToolNames(mode: Mode): readonly string[] | "all" {
  return MODE_TOOLS[mode];
}

/**
 * Select a mode's tools from a flat list (front-ends that build tools per run and
 * append dynamic MCP/skill tools use this). `request_write_access` is accepted as a
 * back-compat alias of `request_access` so older callers/models keep working.
 */
export function toolsForMode(tools: readonly Tool[], mode: Mode): Tool[] {
  const allow = MODE_TOOLS[mode];
  if (allow === "all") return [...tools];
  const set = new Set(allow);
  return tools.filter(
    (t) => set.has(t.spec.name) || (set.has("request_access") && t.spec.name === "request_write_access"),
  );
}

/** Select a mode's tools from a ToolHub (front-ends that register a hub up front). */
export function toolsForModeFromHub(hub: ToolHub, mode: Mode): Tool[] {
  const allow = MODE_TOOLS[mode];
  if (allow === "all") return hub.all();
  const names = hub.has("request_access") && hub.has("request_write_access")
    ? [...allow, "request_write_access"]
    : allow;
  return hub.get(names);
}

/** Per-mode guidance lines appended to the base system prompt. */
export function modeGuidanceLines(mode: Mode): string[] {
  switch (mode) {
    case "chat":
      return [
        "MODE: chat. You can read and search (read_file/ls/grep/web_search) and use memory,",
        "but you CANNOT write files or run commands. Answer, explain, and explore. When the",
        "request is ambiguous or a choice is the user's, call ask_user to clarify.",
      ];
    case "plan":
      return [
        "MODE: plan. Investigate (read_file/ls/grep/web_search) and produce a step-by-step",
        "plan with the update_plan tool (keep it current). You CANNOT write files or run",
        "commands — you plan, you don't execute. Use ask_user to resolve unknowns before",
        "finalizing. End by presenting the plan and what running it (in agent mode) would do.",
      ];
    case "agent":
      return [
        "MODE: agent. Full tools available — act directly to accomplish the task. Use ask_user",
        "only when a decision is genuinely the user's to make.",
      ];
  }
}

/** Per-mode guidance as a single string (newline-joined). */
export function modeGuidance(mode: Mode): string {
  return modeGuidanceLines(mode).join("\n");
}

/** Map a stored/legacy mode to a current one ("ask" → "chat"); default "agent". */
export function normalizeMode(mode: string | undefined): Mode {
  if (mode === "ask" || mode === "chat") return "chat";
  if (mode === "plan") return "plan";
  return "agent";
}
