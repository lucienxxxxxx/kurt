/**
 * DirectSandbox — runs commands with NO isolation (just timeout + output cap).
 *
 * This is the "裸执行版" the Phase 2 acceptance criterion calls for: swapping a
 * tool's SandboxProvider between Seatbelt and Direct must require ZERO changes to
 * the engine or modes. It also serves as a fallback on platforms without
 * `sandbox-exec`. The `policy` is intentionally ignored here.
 */

import type { SandboxExecOptions, SandboxProvider, SandboxResult } from "./types.ts";
import { defaultEnv, runProcess } from "./run-process.ts";

const DEFAULT_TIMEOUT_MS = 600_000; // hard cap: 10 min
const DEFAULT_IDLE_MS = 90_000; // kill if no output for 90s
const DEFAULT_MAX_OUTPUT = 100_000;

export class DirectSandbox implements SandboxProvider {
  readonly name = "direct";

  async exec(options: SandboxExecOptions, signal: AbortSignal): Promise<SandboxResult> {
    return runProcess(
      {
        argv: options.cmd,
        cwd: options.cwd,
        env: { ...defaultEnv(), ...options.env },
        stdin: options.stdin,
        timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        idleTimeoutMs: options.idleTimeoutMs ?? DEFAULT_IDLE_MS,
        maxOutputBytes: options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT,
        onOutput: options.onOutput,
      },
      signal,
    );
  }
}
