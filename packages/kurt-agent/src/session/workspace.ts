/**
 * SessionWorkspace — a per-session scratch directory with explicit cleanup.
 *
 * The plan: code/shell tools write to a session-specific temp dir that is opened
 * for writing in the sandbox profile and removed when the session ends. This is
 * orchestration-layer state (the engine knows nothing about it); tools receive a
 * workspace by injection.
 */

import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface SessionWorkspaceOptions {
  /** Base directory to create the session dir under. Default: OS temp dir. */
  baseDir?: string;
  /** Used in the dir name for readability. Default: "session". */
  sessionId?: string;
}

export class SessionWorkspace {
  /** Absolute path to this session's private temp directory. */
  readonly root: string;
  #disposed = false;

  constructor(options: SessionWorkspaceOptions = {}) {
    const base = options.baseDir ?? tmpdir();
    this.root = mkdtempSync(join(base, `kurt-${options.sessionId ?? "session"}-`));
  }

  /** Get (creating if needed) a named subdirectory under the session root. */
  dir(name: string): string {
    const path = join(this.root, name);
    mkdirSync(path, { recursive: true });
    return path;
  }

  get disposed(): boolean {
    return this.#disposed;
  }

  /** Delete the entire session directory. Idempotent. */
  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    rmSync(this.root, { recursive: true, force: true });
  }

  /** Enables `using ws = new SessionWorkspace()` auto-cleanup. */
  [Symbol.dispose](): void {
    this.dispose();
  }
}
