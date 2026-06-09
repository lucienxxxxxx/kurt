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
  /** Hard wall-clock cap (ms): the process is killed no matter what. */
  timeoutMs: number;
  /** Idle cap (ms): killed if no new output for this long. 0/undefined = off. */
  idleTimeoutMs?: number;
  maxOutputBytes: number;
  /** Called with each decoded output chunk as it arrives (for live streaming). */
  onOutput?: (text: string) => void;
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
  let timeoutReason: "idle" | "cap" | undefined;
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

  // Hard wall-clock cap.
  const capTimer = setTimeout(() => {
    timedOut = true;
    timeoutReason = "cap";
    kill();
  }, opts.timeoutMs);

  // Idle cap: reset on every output chunk; fires if the command goes quiet.
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  const resetIdle = (): void => {
    if (!opts.idleTimeoutMs) return;
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      timedOut = true;
      timeoutReason = "idle";
      kill();
    }, opts.idleTimeoutMs);
  };
  resetIdle();

  const onAbort = (): void => kill();
  signal.addEventListener("abort", onAbort, { once: true });

  const onExceed = (): void => {
    truncated = true;
    kill();
  };
  const onChunk = (text: string): void => {
    resetIdle();
    opts.onOutput?.(text);
  };

  try {
    const [out, err] = await Promise.all([
      readCapped(proc.stdout as ReadableStream<Uint8Array>, opts.maxOutputBytes, onExceed, onChunk),
      readCapped(proc.stderr as ReadableStream<Uint8Array>, opts.maxOutputBytes, onExceed, onChunk),
    ]);
    await proc.exited;

    if (signal.aborted) throw abortError();

    return {
      stdout: out.text,
      stderr: err.text,
      exitCode: proc.exitCode,
      timedOut,
      timeoutReason,
      truncated: truncated || out.truncated || err.truncated,
    };
  } finally {
    clearTimeout(capTimer);
    if (idleTimer) clearTimeout(idleTimer);
    signal.removeEventListener("abort", onAbort);
  }
}

async function readCapped(
  stream: ReadableStream<Uint8Array>,
  maxBytes: number,
  onExceed: () => void,
  onChunk?: (text: string) => void,
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
        if (remaining > 0) {
          const piece = decoder.decode(value.subarray(0, remaining), { stream: true });
          text += piece;
          if (piece) onChunk?.(piece);
        }
        truncated = true;
        onExceed();
        break;
      }
      const piece = decoder.decode(value, { stream: true });
      text += piece;
      total += value.length;
      if (piece) onChunk?.(piece);
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
