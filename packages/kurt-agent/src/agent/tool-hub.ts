/**
 * ToolHub — a shared registry of constructed Tool instances, keyed by name. The
 * orchestration layer builds it once (all tools), then hands each Agent a SUBSET
 * by name (e.g. chat mode gets read-only tools, agent mode gets everything).
 *
 * Pure composition: holds Tool references, no I/O of its own.
 */

import type { Tool } from "../engine/index.ts";

export class ToolHub {
  #byName: Map<string, Tool>;

  constructor(tools: Tool[]) {
    this.#byName = new Map(tools.map((t) => [t.spec.name, t]));
  }

  /** Every registered tool. */
  all(): Tool[] {
    return [...this.#byName.values()];
  }

  /** Registered tool names. */
  names(): string[] {
    return [...this.#byName.keys()];
  }

  has(name: string): boolean {
    return this.#byName.has(name);
  }

  /** The tools matching `names`, in the order given (unknown names skipped). */
  get(names: readonly string[]): Tool[] {
    const out: Tool[] = [];
    for (const name of names) {
      const tool = this.#byName.get(name);
      if (tool) out.push(tool);
    }
    return out;
  }
}
