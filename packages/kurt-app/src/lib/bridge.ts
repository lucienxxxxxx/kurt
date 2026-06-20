/**
 * Client for the kurt-bridge HTTP/SSE API (the engine, run by a local Bun
 * process). Mirrors the bridge's wire contract (kurt-bridge/src/types.ts) — these
 * shapes must stay in sync.
 */

import type { Step } from "../types.ts";

/** A sensitive op awaiting the user's decision (sent back via `approve`). */
export interface ApprovalRequest {
  id: string;
  key: string;
  title: string;
  command: string;
  explanation: string;
  risk: string;
}
export type ApprovalDecision = "allow" | "always" | "deny";

/** An ask_user question awaiting the user's answer (sent back via `answer`). */
export interface AskRequest {
  id: string;
  question: string;
  options?: string[];
}

/** SSE frames the bridge streams during a run. */
export type RunFrame =
  | { kind: "session"; id: string; title: string }
  | { kind: "step"; step: Step } // a step created/changed — upsert by _id
  | ({ kind: "approval" } & ApprovalRequest) // sensitive op blocks until POST /approve
  | ({ kind: "ask" } & AskRequest) // ask_user blocks until POST /answer
  | { kind: "usage"; inputTokens: number; outputTokens: number; totalTokens: number }
  | { kind: "done" }
  | { kind: "aborted"; reason: string }
  | { kind: "error"; message: string };

export interface SessionInfo {
  id: string;
  title: string;
  updatedAt: number;
  messageCount: number;
}

/** GET /sessions/:id — metadata + the conversation reconstructed into steps. */
export interface SessionDetail {
  id: string;
  title: string;
  updatedAt: number;
  steps: Step[];
}

export interface RunHandlers {
  onSession?: (id: string, title: string) => void;
  onStep?: (step: Step) => void;
  onApproval?: (req: ApprovalRequest) => void;
  onAsk?: (req: AskRequest) => void;
  onUsage?: (u: { inputTokens: number; outputTokens: number; totalTokens: number }) => void;
  onError?: (message: string) => void;
  onAborted?: (reason: string) => void;
}

/**
 * POST /run and consume the SSE stream, dispatching each frame to `handlers`.
 * Resolves when the run ends (done/error/abort or stream close). Pass a signal
 * to stop the run (closing the stream aborts it server-side).
 */
export async function runStream(
  baseUrl: string,
  body: { sessionId?: string; text: string; model?: string; effort?: string; thinking?: boolean; mode?: "chat" | "agent" | "plan" },
  handlers: RunHandlers,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${baseUrl}/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) {
    handlers.onError?.(`bridge /run failed: ${res.status}`);
    return;
  }

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let idx: number;
      while ((idx = buf.indexOf("\n\n")) >= 0) {
        const block = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        dispatch(block, handlers);
      }
    }
  } catch (err) {
    if ((err as Error)?.name !== "AbortError") handlers.onError?.((err as Error)?.message ?? String(err));
  }
}

function dispatch(block: string, handlers: RunHandlers): void {
  const line = block.split("\n").find((l) => l.startsWith("data: "));
  if (!line) return;
  let frame: RunFrame;
  try {
    frame = JSON.parse(line.slice(6)) as RunFrame;
  } catch {
    return;
  }
  switch (frame.kind) {
    case "session": handlers.onSession?.(frame.id, frame.title); break;
    case "step": handlers.onStep?.(frame.step); break;
    case "approval": handlers.onApproval?.(frame); break;
    case "ask": handlers.onAsk?.(frame); break;
    case "usage": handlers.onUsage?.(frame); break;
    case "error": handlers.onError?.(frame.message); break;
    case "aborted": handlers.onAborted?.(frame.reason); break;
    case "done": break;
  }
}

/** Answer a pending approval (POST /approve). */
export async function approve(baseUrl: string, id: string, decision: ApprovalDecision): Promise<void> {
  await fetch(`${baseUrl}/approve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, decision }),
  });
}

/** Answer a pending ask_user question (POST /answer). "" = skipped. */
export async function answer(baseUrl: string, id: string, text: string): Promise<void> {
  await fetch(`${baseUrl}/answer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, answer: text }),
  });
}

export async function listSessions(baseUrl: string, workspace?: string): Promise<SessionInfo[]> {
  const url = workspace ? `${baseUrl}/sessions?workspace=${encodeURIComponent(workspace)}` : `${baseUrl}/sessions`;
  const res = await fetch(url);
  return res.ok ? ((await res.json()) as SessionInfo[]) : [];
}

export async function getSession(baseUrl: string, id: string): Promise<SessionDetail | null> {
  const res = await fetch(`${baseUrl}/sessions/${encodeURIComponent(id)}`);
  return res.ok ? ((await res.json()) as SessionDetail) : null;
}

export async function deleteSession(baseUrl: string, id: string): Promise<void> {
  await fetch(`${baseUrl}/sessions/${encodeURIComponent(id)}`, { method: "DELETE" });
}

/** Rollback: keep only the first `keepUserTurns` user turns of a session. */
export async function truncateSession(baseUrl: string, id: string, keepUserTurns: number): Promise<SessionDetail | null> {
  const res = await fetch(`${baseUrl}/sessions/${encodeURIComponent(id)}/truncate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ keepUserTurns }),
  });
  return res.ok ? ((await res.json()) as SessionDetail) : null;
}

/** Model/key status (never includes the key itself). */
export interface BridgeInfo {
  hasKey: boolean;
  model: string;
  models: string[];
  /** The bridge's workspace root (Files tab + terminal cwd). */
  workspace: string;
}

export async function getInfo(baseUrl: string): Promise<BridgeInfo | null> {
  const res = await fetch(`${baseUrl}/info`);
  return res.ok ? ((await res.json()) as BridgeInfo) : null;
}

/** The full desktop.json the bridge runs on (mirrors kurt-bridge ModelConfig). */
export interface DesktopConfig {
  apiKey: string;
  baseURL: string;
  models: string[];
  format: "openai" | "claude";
}

/** GET the full config (incl. the key — localhost). */
export async function getConfig(baseUrl: string): Promise<DesktopConfig | null> {
  const res = await fetch(`${baseUrl}/config`);
  return res.ok ? ((await res.json()) as DesktopConfig) : null;
}

/** Set model config in the running bridge; it persists + rebuilds the model. */
export async function setConfig(baseUrl: string, patch: Partial<DesktopConfig>): Promise<BridgeInfo | null> {
  const res = await fetch(`${baseUrl}/config`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  return res.ok ? ((await res.json()) as BridgeInfo) : null;
}

// ── Workspace files (Files tab + preview) ────────────────────────────────────

export interface DirEntry { name: string; path: string; dir: boolean }
export interface DirListing { path: string; entries: DirEntry[] }
export interface FileContent { path: string; content: string; truncated: boolean }

/** List a workspace directory ("" = root). */
export async function listDir(baseUrl: string, path = ""): Promise<DirListing | null> {
  const res = await fetch(`${baseUrl}/fs?path=${encodeURIComponent(path)}`);
  return res.ok ? ((await res.json()) as DirListing) : null;
}

/** Read a workspace text file for preview. */
export async function readFile(baseUrl: string, path: string): Promise<FileContent | null> {
  const res = await fetch(`${baseUrl}/file?path=${encodeURIComponent(path)}`);
  return res.ok ? ((await res.json()) as FileContent) : null;
}

/** URL serving a workspace file's raw bytes (pdf/html/img <iframe> src). */
export function rawFileUrl(baseUrl: string, path: string): string {
  return `${baseUrl}/raw?path=${encodeURIComponent(path)}`;
}

export async function health(baseUrl: string): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl}/health`);
    return res.ok;
  } catch {
    return false;
  }
}
