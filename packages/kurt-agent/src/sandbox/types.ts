/**
 * SandboxProvider — the abstraction that quarantines subprocess execution.
 *
 * 铁律 #1 & #3: the engine never spawns a process; tools do, and always through
 * this interface. `sandbox-exec` (macOS Seatbelt) is officially deprecated but
 * still works — it is sealed INSIDE `SeatbeltSandbox`. No tool, mode, or engine
 * file may reference `sandbox-exec` directly. Swapping to Firecracker / gVisor /
 * a remote container later = a new `SandboxProvider`; nothing else changes.
 */

export interface SandboxPolicy {
  /** Absolute directories the process may write to (everything else read-only). */
  writablePaths: string[];
  /** Whether the process may use the network. Granted per-tool. */
  allowNetwork: boolean;
}

export interface SandboxExecOptions {
  /** argv: program + args. Prefer absolute interpreter paths. */
  cmd: string[];
  cwd?: string;
  /** Extra env vars merged over a minimal default set. */
  env?: Record<string, string>;
  /** Data piped to the process's stdin. */
  stdin?: string;
  /** Hard wall-clock cap; the process is SIGKILLed past it. */
  timeoutMs?: number;
  /** Idle cap; killed if no output for this long. 0/undefined disables it. */
  idleTimeoutMs?: number;
  /** Per-stream capture cap; output past it is clipped. Default 100 KB. */
  maxOutputBytes?: number;
  /** Called with each decoded output chunk as it streams in (for live display). */
  onOutput?: (text: string) => void;
  /** Isolation policy. Ignored by implementations that don't isolate (Direct). */
  policy: SandboxPolicy;
}

export interface SandboxResult {
  stdout: string;
  stderr: string;
  /** Exit code, or null if killed by a signal (timeout/abort). */
  exitCode: number | null;
  /** True if killed for exceeding a timeout. */
  timedOut: boolean;
  /** Which timeout fired: "idle" (went quiet) or "cap" (hard limit). */
  timeoutReason?: "idle" | "cap";
  /** True if stdout/stderr was clipped at `maxOutputBytes`. */
  truncated: boolean;
}

export interface SandboxProvider {
  readonly name: string;
  /**
   * Run a command to completion. Rejects with an AbortError if `signal` fires;
   * a timeout is NOT an error — it returns a result with `timedOut: true`.
   */
  exec(options: SandboxExecOptions, signal: AbortSignal): Promise<SandboxResult>;
}
