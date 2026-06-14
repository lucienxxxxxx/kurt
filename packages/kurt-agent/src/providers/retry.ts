/**
 * withRetry — a ModelProvider decorator that retries TRANSIENT failures
 * (HTTP 429/5xx, network drops) with exponential backoff + jitter.
 *
 * Safety rule: a stream is only retried if it failed BEFORE yielding any event —
 * once chunks have been delivered downstream, a blind retry would duplicate
 * them, so mid-stream errors are rethrown. Most rate-limit/connect errors fail
 * at request time, which is exactly the retryable window. Aborts never retry.
 *
 * Composition-layer decorator (铁律 #3): wraps any ModelProvider, engine untouched.
 */

import type { ModelProvider, ModelRequest, ModelStreamEvent } from "../engine/index.ts";

export interface RetryOptions {
  /** Extra attempts after the first failure. Default 2 (= 3 attempts total). */
  retries?: number;
  /** First backoff delay; doubles per attempt (±20% jitter). Default 1000ms. */
  baseDelayMs?: number;
  /** Observability hook: called before each backoff sleep. */
  onRetry?: (attempt: number, error: string, delayMs: number) => void;
}

/** True for errors worth retrying: rate limits, server errors, network blips. */
export function isTransientModelError(message: string): boolean {
  return /HTTP (429|5\d\d)\b/i.test(message) || /fetch failed|ECONNRESET|ECONNREFUSED|ETIMEDOUT|socket|network/i.test(message);
}

export function withRetry(model: ModelProvider, opts: RetryOptions = {}): ModelProvider {
  const retries = opts.retries ?? 2;
  const base = opts.baseDelayMs ?? 1000;

  return {
    name: model.name,
    countTokens: (request: ModelRequest) => model.countTokens(request),
    async *stream(request: ModelRequest, signal: AbortSignal): AsyncIterable<ModelStreamEvent> {
      for (let attempt = 0; ; attempt++) {
        let yielded = false;
        try {
          for await (const ev of model.stream(request, signal)) {
            yielded = true;
            yield ev;
          }
          return;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          const aborted = (err instanceof Error && err.name === "AbortError") || signal.aborted;
          if (aborted || yielded || attempt >= retries || !isTransientModelError(message)) throw err;
          const delay = Math.round(base * 2 ** attempt * (0.8 + Math.random() * 0.4));
          opts.onRetry?.(attempt + 1, message, delay);
          await sleep(delay, signal);
        }
      }
    },
  };
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const abortError = (): Error => {
      const e = new Error("Aborted");
      e.name = "AbortError";
      return e;
    };
    if (signal.aborted) return reject(abortError());
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(abortError());
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}
