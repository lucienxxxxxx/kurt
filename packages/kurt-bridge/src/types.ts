/**
 * The bridge's HTTP/SSE wire contract. The desktop app mirrors these shapes (it
 * talks to the bridge over HTTP, not via a TS import), so keep the two in sync.
 *
 * Steps carry PLAIN strings (real engine output is single-language), unlike the
 * prototype's bilingual {zh,en} mock fixtures. The app's `tr()` passes strings
 * through unchanged.
 */

export type Step =
  | { _id: number; type: "user"; text: string } // only in reloaded sessions (live runs don't emit user steps)
  | { _id: number; type: "thinking"; sec?: number; text: string }
  | { _id: number; type: "text"; text: string }
  | { _id: number; type: "tool"; name: string; title: string; cmd: string; out: string; isError?: boolean }
  | { _id: number; type: "read"; file: string; lines: string }
  | { _id: number; type: "skill"; name: string; title: string; input?: string; output?: string; isError?: boolean };

/** One step of the agent's plan (from the update_plan tool). */
export interface PlanStep {
  title: string;
  status: "pending" | "in_progress" | "done";
}

/** SSE frames the bridge streams during a run (one JSON object per `data:` line). */
export type RunFrame =
  | { kind: "session"; id: string; title: string } // the resolved/created session for this run
  | { kind: "step"; step: Step } // a step was created or changed — upsert by _id
  | { kind: "plan"; steps: PlanStep[] } // the agent (re)recorded its plan via update_plan
  | { kind: "approval"; id: string; key: string; title: string; command: string; explanation: string; risk: string } // a sensitive op awaits POST /approve
  | { kind: "ask"; id: string; question: string; options?: string[] } // ask_user awaits POST /answer
  | { kind: "usage"; inputTokens: number; outputTokens: number; totalTokens: number }
  | { kind: "done" }
  | { kind: "aborted"; reason: string }
  | { kind: "error"; message: string };

/** Session metadata returned by GET /sessions (no message bodies). */
export interface SessionInfo {
  id: string;
  title: string;
  updatedAt: number;
  messageCount: number;
  workspace: string;
}

/** Skill metadata returned by GET /skills. `name` is the callable id. */
export interface SkillInfo {
  name: string;
  displayName: string;
  description: string;
  scope: "global" | "project" | "codex" | "agents" | "claude" | "custom";
  source: string;
  path: string;
}
