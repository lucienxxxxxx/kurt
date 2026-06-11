import { describe, expect, test } from "bun:test";
import type { ModelProvider, ModelStreamEvent } from "../engine/index.ts";
import { isTransientModelError, withRetry } from "./retry.ts";

/** A model whose stream() behavior is scripted per call. */
function scripted(behaviors: Array<"throw429" | "throw400" | "midstream" | "ok">): ModelProvider & { calls: number } {
  const m = {
    name: "scripted",
    calls: 0,
    async countTokens() {
      return 0;
    },
    async *stream(): AsyncIterable<ModelStreamEvent> {
      const behavior = behaviors[m.calls++] ?? "ok";
      if (behavior === "throw429") throw new Error("deepseek HTTP 429 Too Many Requests: slow down");
      if (behavior === "throw400") throw new Error("deepseek HTTP 400 Bad Request: nope");
      if (behavior === "midstream") {
        yield { type: "text_delta", text: "partial" };
        throw new Error("deepseek HTTP 500 Internal Server Error: boom");
      }
      yield { type: "text_delta", text: "ok" };
      yield { type: "done", stopReason: "end_turn" };
    },
  };
  return m;
}

async function drain(model: ModelProvider): Promise<ModelStreamEvent[]> {
  const out: ModelStreamEvent[] = [];
  for await (const e of model.stream({ system: "", messages: [], tools: [] }, new AbortController().signal)) out.push(e);
  return out;
}

describe("isTransientModelError", () => {
  test("classifies rate limits / 5xx / network as transient, 4xx as not", () => {
    expect(isTransientModelError("x HTTP 429 Too Many Requests: y")).toBe(true);
    expect(isTransientModelError("x HTTP 503 Service Unavailable: y")).toBe(true);
    expect(isTransientModelError("fetch failed")).toBe(true);
    expect(isTransientModelError("x HTTP 400 Bad Request: y")).toBe(false);
    expect(isTransientModelError("x HTTP 401 Unauthorized: y")).toBe(false);
  });
});

describe("withRetry", () => {
  test("retries a pre-stream 429 with backoff, then succeeds (onRetry observed)", async () => {
    const inner = scripted(["throw429", "ok"]);
    const retried: string[] = [];
    const model = withRetry(inner, { baseDelayMs: 1, onRetry: (a, e) => retried.push(`${a}:${e.slice(0, 20)}`) });
    const events = await drain(model);
    expect(events.map((e) => e.type)).toEqual(["text_delta", "done"]);
    expect(inner.calls).toBe(2);
    expect(retried).toHaveLength(1);
  });

  test("does NOT retry non-transient errors", async () => {
    const inner = scripted(["throw400", "ok"]);
    await expect(drain(withRetry(inner, { baseDelayMs: 1 }))).rejects.toThrow(/400/);
    expect(inner.calls).toBe(1);
  });

  test("does NOT retry once events were already yielded (no duplication)", async () => {
    const inner = scripted(["midstream", "ok"]);
    const out: ModelStreamEvent[] = [];
    const model = withRetry(inner, { baseDelayMs: 1 });
    await expect(
      (async () => {
        for await (const e of model.stream({ system: "", messages: [], tools: [] }, new AbortController().signal)) out.push(e);
      })(),
    ).rejects.toThrow(/500/);
    expect(inner.calls).toBe(1);
    expect(out).toHaveLength(1); // the partial chunk reached downstream exactly once
  });

  test("gives up after the retry budget", async () => {
    const inner = scripted(["throw429", "throw429", "throw429", "ok"]);
    await expect(drain(withRetry(inner, { retries: 2, baseDelayMs: 1 }))).rejects.toThrow(/429/);
    expect(inner.calls).toBe(3); // 1 + 2 retries
  });
});
