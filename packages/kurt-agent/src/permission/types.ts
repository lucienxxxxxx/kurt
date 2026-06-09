/**
 * Permission/approval contract — the seam for gating sensitive operations.
 *
 * A tool that's about to do something risky (e.g. ShellTool with an `rm`) asks
 * a `PermissionProvider` whether it may proceed. The provider is injected by the
 * orchestration layer: a TUI one prompts the user (allow / deny / always-allow),
 * a CLI one prompts on stdin, a non-interactive one denies. The engine never
 * learns about approvals — this lives entirely in the tool layer (铁律 #3).
 */

export type PermissionDecision = "allow" | "deny";

export interface PermissionRequest {
  /** Stable key for whitelisting (the matched rule id, e.g. "rm", "sudo"). */
  key: string;
  /** Short label, e.g. "rm — delete files". */
  title: string;
  /** The concrete operation, e.g. the shell command line. */
  command: string;
  /** What it does / why it's flagged. */
  explanation: string;
  /** What could go wrong. */
  risk: string;
}

export interface PermissionProvider {
  /**
   * Decide whether the operation may run. Implementations may consult a
   * whitelist, prompt the user, persist an "always allow", etc. Returning
   * "allow" lets it proceed; "deny" blocks it (the tool reports a clean error).
   */
  request(req: PermissionRequest): Promise<PermissionDecision>;
}

/** A provider that allows everything (e.g. for `--yes` / trusted contexts). */
export const allowAllPermission: PermissionProvider = { request: async () => "allow" };

/** A provider that denies every flagged op (safe default for non-interactive). */
export const denyAllPermission: PermissionProvider = { request: async () => "deny" };
