/**
 * MockModel — a scripted ModelProvider with zero external dependencies.
 *
 * It replays a fixed list of responses, one per `stream()` call (i.e. one per
 * loop turn). Each response can emit streamed text and/or tool calls. This is
 * how Phase 1 validates the full event flow with no API key and no network.
 */

import type { ModelProvider, ModelRequest, ModelStreamEvent } from "../engine/index.ts";

export interface MockToolCall {
  name: string;
  input: unknown;
}

export interface MockResponse {
  /** Assistant text; streamed out in small deltas to exercise the stream path. */
  text?: string;
  /** Tool calls the model makes this turn. */
  toolCalls?: MockToolCall[];
}

export interface MockModelOptions {
  /** Delay (ms) inserted between streamed chunks. Lets tests abort mid-stream. */
  chunkDelayMs?: number;
  /** Chars per streamed text delta. Default 12. */
  chunkSize?: number;
}

export class MockModel implements ModelProvider {
  readonly name = "mock";

  #script: MockResponse[];
  #turn = 0;
  #callSeq = 0;
  #opts: Required<MockModelOptions>;

  constructor(script: MockResponse[], opts: MockModelOptions = {}) {
    this.#script = script;
    this.#opts = { chunkDelayMs: opts.chunkDelayMs ?? 0, chunkSize: opts.chunkSize ?? 12 };
  }

  async countTokens(request: ModelRequest): Promise<number> {
    // Crude ~4-chars-per-token estimate over the serialized request.
    const text = request.system + JSON.stringify(request.messages) + JSON.stringify(request.tools);
    return Math.ceil(text.length / 4);
  }

  async *stream(_request: ModelRequest, signal: AbortSignal): AsyncIterable<ModelStreamEvent> {
    const response: MockResponse = this.#script[this.#turn++] ?? {
      text: "(mock script exhausted)",
    };

    if (response.text) {
      for (const piece of chunk(response.text, this.#opts.chunkSize)) {
        throwIfAborted(signal);
        if (this.#opts.chunkDelayMs > 0) await delay(this.#opts.chunkDelayMs, signal);
        yield { type: "text_delta", text: piece };
      }
    }

    if (response.toolCalls) {
      for (const call of response.toolCalls) {
        throwIfAborted(signal);
        yield { type: "tool_use", id: `mock_call_${++this.#callSeq}`, name: call.name, input: call.input };
      }
    }

    yield { type: "done", stopReason: response.toolCalls?.length ? "tool_use" : "end_turn" };
  }
}

function chunk(text: string, size: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
  return out;
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw abortError();
}

function abortError(): Error {
  const err = new Error("Aborted");
  err.name = "AbortError";
  return err;
}
