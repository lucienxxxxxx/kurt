/**
 * SessionStore — persists conversations under ~/.kurt/sessions/<id>.json so they
 * survive across launches. Sessions are stored globally but tagged with the
 * workspace they came from, so the TUI can list just the current workspace's.
 *
 * This is pure orchestration (the engine is stateless; history is just
 * `Message[]`). No engine dependency beyond the `Message` type.
 */

import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { Message } from "kurt-agent";
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

export class SessionStore {
  #dir: string;

  constructor(dir: string = sessionsDir()) {
    this.#dir = dir;
  }

  /** A fresh, unsaved session (persisted lazily on the first {@link save}). */
  create(workspace: string, model: string): SessionRecord {
    const now = Date.now();
    const id = `${now}-${Math.random().toString(36).slice(2, 8)}`;
    return { id, title: "", createdAt: now, updatedAt: now, workspace, model, messageCount: 0, messages: [] };
  }

  async save(rec: SessionRecord): Promise<void> {
    rec.updatedAt = Date.now();
    rec.messageCount = rec.messages.length;
    mkdirSync(this.#dir, { recursive: true });
    await Bun.write(this.#file(rec.id), JSON.stringify(rec, null, 2));
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
  }

  #file(id: string): string {
    return join(this.#dir, `${id}.json`);
  }
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
