/**
 * The bridge's HTTP/SSE wire contract. The desktop app mirrors these shapes (it
 * talks to the bridge over HTTP, not via a TS import), so keep the two in sync.
 *
 * Steps carry PLAIN strings (real engine output is single-language), unlike the
 * prototype's bilingual {zh,en} mock fixtures. The app's `tr()` passes strings
 * through unchanged.
 */

export type Step =
  | { _id: number; type: "thinking"; sec?: number; text: string }
  | { _id: number; type: "text"; text: string }
  | { _id: number; type: "tool"; name: string; title: string; cmd: string; out: string; isError?: boolean }
  | { _id: number; type: "read"; file: string; lines: string }
  | { _id: number; type: "skill"; name: string; title: string; input?: string; output?: string; isError?: boolean };

/** SSE frames the bridge streams during a run (one JSON object per `data:` line). */
export type RunFrame =
  | { kind: "step"; step: Step } // a step was created or changed — upsert by _id
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
}
