/**
 * SeatbeltSandbox — macOS isolation via `sandbox-exec` (SBPL profiles).
 *
 * This is the ONLY file in the codebase allowed to know `sandbox-exec` exists.
 * The generated profile denies everything by default, then opens the minimum:
 * read-most-of-FS (binaries/libs), write only to the policy's writable paths,
 * and network only when the policy grants it ("网络按工具区分").
 */

import { realpathSync } from "node:fs";
import type { SandboxExecOptions, SandboxPolicy, SandboxProvider, SandboxResult } from "./types.ts";
import { defaultEnv, runProcess } from "./run-process.ts";

const SANDBOX_EXEC = "/usr/bin/sandbox-exec";
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_OUTPUT = 100_000;

export class SeatbeltSandbox implements SandboxProvider {
  readonly name = "seatbelt";

  async exec(options: SandboxExecOptions, signal: AbortSignal): Promise<SandboxResult> {
    // Seatbelt matches canonical (symlink-resolved) paths, but macOS aliases
    // /var→/private/var, /tmp→/private/tmp, etc. Grant both forms.
    const resolvedPolicy: SandboxPolicy = {
      ...options.policy,
      writablePaths: resolveRealPaths(options.policy.writablePaths),
    };
    const profile = buildProfile(resolvedPolicy);
    const argv = [SANDBOX_EXEC, "-p", profile, ...options.cmd];
    return runProcess(
      {
        argv,
        cwd: options.cwd,
        env: { ...defaultEnv(), ...options.env },
        stdin: options.stdin,
        timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        maxOutputBytes: options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT,
      },
      signal,
    );
  }
}

/** Render a Seatbelt SBPL profile from a policy. Exported for testing. */
export function buildProfile(policy: SandboxPolicy): string {
  const lines = [
    "(version 1)",
    "(deny default)",
    // Running the command and any pipeline children.
    "(allow process-fork)",
    "(allow process-exec)",
    "(allow signal (target self))",
    // System plumbing most binaries need.
    "(allow sysctl-read)",
    "(allow mach-lookup)",
    "(allow ipc-posix-shm)",
    // Read everything (executables, dylibs, inputs). Writes stay denied below.
    "(allow file-read*)",
    // Standard device sinks (so commands and pipelines have somewhere to write
    // stdout/stderr/fd) — but NOT general temp space; that stays denied unless
    // a writable path explicitly grants it.
    '(allow file-write* (literal "/dev/null") (literal "/dev/stdout") (literal "/dev/stderr"))',
    '(allow file-write* (subpath "/dev/fd"))',
  ];

  for (const path of policy.writablePaths) {
    lines.push(`(allow file-write* (subpath ${sbplString(path)}))`);
  }

  if (policy.allowNetwork) {
    lines.push("(allow network*)");
    lines.push("(allow system-socket)");
  }

  return lines.join("\n") + "\n";
}

/** Add the symlink-resolved form of each path alongside the original. */
function resolveRealPaths(paths: string[]): string[] {
  const out = new Set<string>();
  for (const p of paths) {
    out.add(p);
    try {
      out.add(realpathSync(p));
    } catch {
      // path may not exist yet — the literal form still applies
    }
  }
  return [...out];
}

/** Escape a string as an SBPL double-quoted literal. */
function sbplString(value: string): string {
  return '"' + value.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
}
