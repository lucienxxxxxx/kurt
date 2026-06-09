/**
 * Shared, isolation-agnostic process runner: spawn + timeout + output-capping +
 * abort. Both SeatbeltSandbox and DirectSandbox funnel through here; the only
 * difference between them is the argv they hand in.
 */

import type { SandboxResult } from "./types.ts";

export interface RawRunOptions {
  argv: string[];
  cwd?: string;
  env?: Record<string, string>;
  stdin?: string;
  timeoutMs: number;
  maxOutputBytes: number;
}

export function abortError(message = "Aborted"): Error {
  const err = new Error(message);
  err.name = "AbortError";
  return err;
}

/** A minimal, predictable env. Tools can extend it via options.env. */
export function defaultEnv(): Record<string, string> {
  const e = process.env;
  const out: Record<string, string> = {};
  for (const key of ["PATH", "HOME", "LANG", "LC_ALL", "TMPDIR", "USER", "SHELL", "TERM"]) {
    const v = e[key];
    if (v != null) out[key] = v;
  }
  return out;
}

export async function runProcess(opts: RawRunOptions, signal: AbortSignal): Promise<SandboxResult> {
  if (signal.aborted) throw abortError();

  let proc: ReturnType<typeof Bun.spawn>;
  try {
    proc = Bun.spawn(opts.argv, {
      cwd: opts.cwd,
      env: opts.env,
      stdin: opts.stdin != null ? new Blob([opts.stdin]) : "ignore",
      stdout: "pipe",
      stderr: "pipe",
      // Own process group, so we can kill the whole subtree (e.g. `npm install`
      // spawns children that would otherwise survive and hold the pipes open).
      detached: true,
    });
  } catch (err) {
    return {
      stdout: "",
      stderr: `Failed to start process: ${err instanceof Error ? err.message : String(err)}`,
      exitCode: 127,
      timedOut: false,
      truncated: false,
    };
  }

  let timedOut = false;
  let truncated = false;
  const kill = (): void => {
    // Kill the whole process group (negative pid) so children die too and the
    // stdout/stderr pipes actually close; fall back to the single process.
    try {
      process.kill(-proc.pid, "SIGKILL");
    } catch {
      try {
        proc.kill("SIGKILL");
      } catch {
        // already gone
      }
    }
  };

  const timer = setTimeout(() => {
    timedOut = true;
    kill();
  }, opts.timeoutMs);
  const onAbort = (): void => kill();
  signal.addEventListener("abort", onAbort, { once: true });

  const onExceed = (): void => {
    truncated = true;
    kill();
  };

  try {
    const [out, err] = await Promise.all([
      readCapped(proc.stdout as ReadableStream<Uint8Array>, opts.maxOutputBytes, onExceed),
      readCapped(proc.stderr as ReadableStream<Uint8Array>, opts.maxOutputBytes, onExceed),
    ]);
    await proc.exited;

    if (signal.aborted) throw abortError();

    return {
      stdout: out.text,
      stderr: err.text,
      exitCode: proc.exitCode,
      timedOut,
      truncated: truncated || out.truncated || err.truncated,
    };
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", onAbort);
  }
}

async function readCapped(
  stream: ReadableStream<Uint8Array>,
  maxBytes: number,
  onExceed: () => void,
): Promise<{ text: string; truncated: boolean }> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let total = 0;
  let truncated = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      if (total + value.length > maxBytes) {
        const remaining = maxBytes - total;
        if (remaining > 0) text += decoder.decode(value.subarray(0, remaining), { stream: true });
        truncated = true;
        onExceed();
        break;
      }
      text += decoder.decode(value, { stream: true });
      total += value.length;
    }
    text += decoder.decode();
  } finally {
    try {
      await reader.cancel();
    } catch {
      // stream already closed
    }
  }

  return { text, truncated };
}
