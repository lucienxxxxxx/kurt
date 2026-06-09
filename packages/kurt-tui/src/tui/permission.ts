/**
 * PermissionBridge — connects a tool's `permission.request()` (which runs inside
 * the agent loop) to the TUI's approval prompt. It implements the engine-side
 * PermissionProvider, and exposes a useSyncExternalStore-friendly surface
 * (subscribe/getSnapshot) plus `decide()` for the App to resolve the prompt.
 *
 * Whitelisted keys (project allowlist) auto-allow without prompting.
 */

import type { PermissionDecision, PermissionProvider, PermissionRequest } from "kurt-agent";
import type { Allowlist } from "../allowlist.ts";

export type ApprovalChoice = "allow" | "always" | "deny";

export class PermissionBridge implements PermissionProvider {
  #allowlist: Allowlist;
  #pending: { req: PermissionRequest; resolve: (d: PermissionDecision) => void } | null = null;
  #listeners = new Set<() => void>();

  constructor(allowlist: Allowlist) {
    this.#allowlist = allowlist;
  }

  /** Engine side: called by the tool before a sensitive op. */
  async request(req: PermissionRequest): Promise<PermissionDecision> {
    if (this.#allowlist.has(req.key)) return "allow";
    return new Promise<PermissionDecision>((resolve) => {
      this.#pending = { req, resolve };
      this.#emit();
    });
  }

  // UI side (stable refs for useSyncExternalStore).
  subscribe = (cb: () => void): (() => void) => {
    this.#listeners.add(cb);
    return () => this.#listeners.delete(cb);
  };

  getSnapshot = (): PermissionRequest | null => this.#pending?.req ?? null;

  /** The App calls this when the user picks. "always" persists to the allowlist. */
  decide(choice: ApprovalChoice): void {
    const p = this.#pending;
    if (!p) return;
    this.#pending = null;
    if (choice === "always") void this.#allowlist.add(p.req.key);
    this.#emit();
    p.resolve(choice === "deny" ? "deny" : "allow");
  }

  #emit(): void {
    for (const l of this.#listeners) l();
  }
}
