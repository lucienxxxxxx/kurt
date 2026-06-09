/**
 * Per-project "always allow" list, stored at <workspace>/.kurt/allowlist.json.
 * Keys are classifier rule ids (e.g. "rm"), so allowing once skips approval for
 * that kind of command in this project. Visible + commit-able + auditable.
 */

import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

export class Allowlist {
  #path: string;
  #keys: Set<string>;

  private constructor(path: string, keys: Set<string>) {
    this.#path = path;
    this.#keys = keys;
  }

  static async load(workspaceRoot: string): Promise<Allowlist> {
    const path = join(workspaceRoot, ".kurt", "allowlist.json");
    let keys = new Set<string>();
    try {
      const file = Bun.file(path);
      if (await file.exists()) {
        const json = (await file.json()) as { allow?: unknown };
        if (Array.isArray(json.allow)) {
          keys = new Set(json.allow.filter((x): x is string => typeof x === "string"));
        }
      }
    } catch {
      // corrupt/unreadable → behave as empty
    }
    return new Allowlist(path, keys);
  }

  has(key: string): boolean {
    return this.#keys.has(key);
  }

  keys(): string[] {
    return [...this.#keys];
  }

  get path(): string {
    return this.#path;
  }

  async add(key: string): Promise<void> {
    this.#keys.add(key);
    await mkdir(dirname(this.#path), { recursive: true });
    await Bun.write(this.#path, JSON.stringify({ allow: [...this.#keys] }, null, 2) + "\n");
  }
}
