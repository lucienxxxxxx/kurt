/**
 * SessionStore — persists conversations under ~/.kurt/sessions/<id>.json so they
 * survive across launches and are SHARED across front-ends (TUI + desktop bridge).
 * Sessions are stored globally but tagged with the workspace they came from, so a
 * front-end can list just the current workspace's.
 *
 * Orchestration-layer I/O (the engine is stateless; history is just `Message[]`).
 * Lives in kurt-agent so every front-end consumes one implementation + one store.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Message } from "../engine/index.ts";
import { atomicWrite } from "../fs-atomic.ts";
import { sessionsDir } from "./paths.ts";

/** Listing-sized session info (no message bodies). */
export interface SessionMeta {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  /** Absolute workspace root this session belongs to. */
  workspace: string;
  model: string;
  messageCount: number;
}

/** A full session: metadata + the conversation history. */
export interface SessionRecord extends SessionMeta {
  messages: Message[];
}

// Monotonic, strictly-increasing timestamp: two saves in the same millisecond
// still get distinct values, so list() ordering is deterministic.
let lastStamp = 0;
function stamp(): number {
  lastStamp = Math.max(Date.now(), lastStamp + 1);
  return lastStamp;
}

export class SessionStore {
  #dir: string;

  constructor(dir: string = sessionsDir()) {
    this.#dir = dir;
  }

  /** A fresh, unsaved session (persisted lazily on the first {@link save}). */
  create(workspace: string, model: string): SessionRecord {
    const now = stamp();
    const id = `${now}-${Math.random().toString(36).slice(2, 8)}`;
    return { id, title: "", createdAt: now, updatedAt: now, workspace, model, messageCount: 0, messages: [] };
  }

  async save(rec: SessionRecord): Promise<void> {
    rec.updatedAt = stamp();
    rec.messageCount = rec.messages.length;
    // Atomic: a concurrent reader never sees a half-written session file.
    await atomicWrite(this.#file(rec.id), JSON.stringify(rec, null, 2));
  }

  async load(id: string): Promise<SessionRecord | null> {
    const file = Bun.file(this.#file(id));
    if (!(await file.exists())) return null;
    try {
      const rec = (await file.json()) as SessionRecord;
      return { ...rec, messages: Array.isArray(rec.messages) ? rec.messages : [] };
    } catch {
      return null; // corrupt → treat as missing
    }
  }

  /** Metadata for all sessions, optionally filtered to one workspace, newest first. */
  async list(workspace?: string): Promise<SessionMeta[]> {
    if (!existsSync(this.#dir)) return [];
    const metas: SessionMeta[] = [];
    for (const name of readdirSync(this.#dir)) {
      if (!name.endsWith(".json")) continue;
      try {
        const rec = (await Bun.file(join(this.#dir, name)).json()) as SessionRecord;
        if (workspace && rec.workspace !== workspace) continue;
        metas.push(metaOf(rec));
      } catch {
        // skip corrupt/partial files
      }
    }
    return metas.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async remove(id: string): Promise<void> {
    rmSync(this.#file(id), { force: true });
    this.releaseLock(id);
  }

  /**
   * Rewind a session to keep only its first `keepUserTurns` user turns, dropping
   * that user message and everything after it (the "回退/rollback" feature). Returns
   * the updated record, or null if the session is missing.
   */
  async truncate(id: string, keepUserTurns: number): Promise<SessionRecord | null> {
    const rec = await this.load(id);
    if (!rec) return null;
    rec.messages = truncateToUserTurns(rec.messages, keepUserTurns);
    await this.save(rec);
    return rec;
  }

  // ── Occupancy locks ──────────────────────────────────────────────────────
  // Two front-ends editing the SAME session id would silently overwrite each
  // other's history (each autosaves its own in-memory messages). A lock file
  // marks a session as "open here"; another process refuses to open it (and
  // forks a new session instead). Staleness is decided by process liveness, so
  // a crashed process's lock is reclaimed automatically — no timeout heuristics.

  /** Try to claim a session. Returns false if another LIVE process holds it. */
  acquireLock(id: string): boolean {
    mkdirSync(this.#dir, { recursive: true });
    const lock = this.#lock(id);
    const payload = JSON.stringify({ pid: process.pid, ts: Date.now() });
    try {
      writeFileSync(lock, payload, { flag: "wx" }); // wx = fail if it already exists
      return true;
    } catch {
      if (!this.#lockIsStale(lock)) return false; // held by a live process
      try {
        writeFileSync(lock, payload, { flag: "w" }); // reclaim a dead process's lock
        return true;
      } catch {
        return false;
      }
    }
  }

  /** Release a session lock we own (no-op if it's not ours / already gone). */
  releaseLock(id: string): void {
    const lock = this.#lock(id);
    try {
      const { pid } = JSON.parse(readFileSync(lock, "utf8")) as { pid?: number };
      if (pid === process.pid) unlinkSync(lock);
    } catch {
      /* not ours / unreadable / already gone */
    }
  }

  /** A lock is stale if its owning process is no longer alive (or it's unreadable). */
  #lockIsStale(lock: string): boolean {
    try {
      const { pid } = JSON.parse(readFileSync(lock, "utf8")) as { pid?: number };
      if (typeof pid !== "number") return true;
      try {
        process.kill(pid, 0); // signal 0 = liveness probe (doesn't kill)
        return false; // alive
      } catch (err) {
        return (err as NodeJS.ErrnoException).code === "ESRCH"; // ESRCH = no such process → stale; EPERM = alive
      }
    } catch {
      return true; // unreadable/corrupt lock → treat as stale
    }
  }

  #lock(id: string): string {
    return join(this.#dir, `${id}.lock`);
  }

  #file(id: string): string {
    return join(this.#dir, `${id}.json`);
  }
}

/**
 * Keep only the first `keepUserTurns` user turns of a conversation: returns the
 * prefix of `messages` up to (but not including) the `keepUserTurns`-th user
 * message (0-based), so that user message and all later messages are dropped.
 * Pure — the unit of the rollback contract.
 */
export function truncateToUserTurns(messages: Message[], keepUserTurns: number): Message[] {
  if (keepUserTurns <= 0) return [];
  let userSeen = 0;
  for (let i = 0; i < messages.length; i++) {
    if (messages[i]!.role === "user") {
      if (userSeen === keepUserTurns) return messages.slice(0, i);
      userSeen++;
    }
  }
  return messages.slice(); // fewer user turns than asked → nothing to drop
}

function metaOf(rec: SessionRecord): SessionMeta {
  return {
    id: rec.id,
    title: rec.title ?? "",
    createdAt: rec.createdAt,
    updatedAt: rec.updatedAt,
    workspace: rec.workspace,
    model: rec.model,
    messageCount: rec.messageCount ?? (Array.isArray(rec.messages) ? rec.messages.length : 0),
  };
}
