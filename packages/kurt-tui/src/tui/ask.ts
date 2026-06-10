/**
 * AskBridge — connects the `ask_user` tool's `ask()` (which runs inside the agent
 * loop) to the TUI's ask prompt. Implements the engine-side AskProvider and
 * exposes a useSyncExternalStore-friendly surface (subscribe/getSnapshot) plus
 * `answer()` for the App to resolve the prompt. Mirrors PermissionBridge.
 */

import type { AskProvider, AskRequest } from "kurt-agent";

export interface PendingAsk {
  question: string;
  options: string[];
}

export class AskBridge implements AskProvider {
  #pending: { ask: PendingAsk; resolve: (answer: string) => void } | null = null;
  #listeners = new Set<() => void>();

  /** Engine side: the tool awaits the user's answer. */
  ask(req: AskRequest, signal?: AbortSignal): Promise<string> {
    return new Promise<string>((resolve) => {
      this.#pending = { ask: { question: req.question, options: req.options ?? [] }, resolve };
      this.#emit();
      // If the run is aborted while waiting, resolve empty so the loop unwinds.
      if (signal) {
        if (signal.aborted) this.answer("");
        else signal.addEventListener("abort", () => this.answer(""), { once: true });
      }
    });
  }

  // UI side (stable refs for useSyncExternalStore).
  subscribe = (cb: () => void): (() => void) => {
    this.#listeners.add(cb);
    return () => this.#listeners.delete(cb);
  };

  getSnapshot = (): PendingAsk | null => this.#pending?.ask ?? null;

  /** The App calls this with the chosen option or free-form text (or "" to skip). */
  answer(text: string): void {
    const p = this.#pending;
    if (!p) return;
    this.#pending = null;
    this.#emit();
    p.resolve(text);
  }

  #emit(): void {
    for (const l of this.#listeners) l();
  }
}
