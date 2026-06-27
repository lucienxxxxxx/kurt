/**
 * MarkdownMemoryStore — fixed markdown-file memory for global/project scopes.
 *
 * Paths are supplied by the orchestration layer. The model never chooses them,
 * which keeps the memory tool free of path traversal surface.
 */

import { atomicWrite } from "../fs-atomic.ts";
import type { MemoryScope, MemoryStore } from "./types.ts";

export interface MarkdownMemoryStoreOptions {
  /** Absolute path to the global memory file, e.g. ~/.kurt/memory.md. */
  globalPath: string;
  /** Absolute path to the project memory file, e.g. <ws>/.kurt/memory.md. */
  projectPath?: string;
}

export class MarkdownMemoryStore implements MemoryStore {
  #globalPath: string;
  #projectPath: string | undefined;

  constructor(opts: MarkdownMemoryStoreOptions) {
    this.#globalPath = opts.globalPath;
    this.#projectPath = opts.projectPath;
  }

  supports(scope: MemoryScope): boolean {
    return scope === "global" || this.#projectPath !== undefined;
  }

  label(scope: MemoryScope): string {
    return scope;
  }

  async read(scope: MemoryScope): Promise<string> {
    const path = this.#path(scope);
    const file = Bun.file(path);
    return (await file.exists()) ? await file.text() : "";
  }

  async write(scope: MemoryScope, text: string): Promise<void> {
    await atomicWrite(this.#path(scope), text);
  }

  #path(scope: MemoryScope): string {
    if (scope === "global") return this.#globalPath;
    if (this.#projectPath) return this.#projectPath;
    throw new Error("No project memory available");
  }
}
