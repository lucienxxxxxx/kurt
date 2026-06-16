/**
 * Where kurt keeps global state. Shared by all front-ends (TUI, bridge) so they
 * agree on one ~/.kurt — sessions saved by one are visible to the others.
 * Override the whole home with KURT_HOME (used by tests).
 */

import { homedir } from "node:os";
import { join } from "node:path";

export function kurtHome(): string {
  return process.env.KURT_HOME ?? join(homedir(), ".kurt");
}

/** Saved conversations live here (<id>.json), shared across front-ends. */
export function sessionsDir(): string {
  return join(kurtHome(), "sessions");
}
