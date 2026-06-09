/**
 * OpenAICompatModel — a ModelProvider for any OpenAI-compatible Chat Completions
 * API (DeepSeek, OpenAI, Together, local servers, …).
 *
 * 铁律 #2: every vendor difference is digested HERE — the wire message shape, the
 * streaming SSE format, tool-call argument accumulation, token estimation — so the
 * engine only ever sees the normalized `ModelStreamEvent`s. The API key lives in
 * the orchestration layer (passed in via options), never in the engine.
 */

import type {
  Message,
  ModelProvider,
  ModelRequest,
  ModelStreamEvent,
  ToolSpec,
} from "../engine/index.ts";
import { MALFORMED_ARGS } from "../tool-args.ts";

/** Minimal fetch shape (looser than Bun's `typeof fetch`, so test stubs fit). */
export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export interface OpenAICompatOptions {
  /** Base URL, e.g. "https://api.deepseek.com" (no trailing /chat/completions). */
  baseURL: string;
  /** Model id, e.g. "deepseek-v4-flash". */
  model: string;
  /** API key (Bearer). Supplied by the orchestration layer. */
  apiKey: string;
  /** Provider label for events/logs. Default: "openai-compat". */
  name?: string;
  temperature?: number;
  maxTokens?: number;
  /** Injectable fetch for offline testing. Default: global fetch. */
  fetchImpl?: FetchLike;
}

export class OpenAICompatModel implements ModelProvider {
  readonly name: string;
  #o: Required<Omit<OpenAICompatOptions, "name">>;

  constructor(opts: OpenAICompatOptions) {
    this.name = opts.name ?? "openai-compat";
    this.#o = {
      baseURL: opts.baseURL.replace(/\/+$/, ""),
      model: opts.model,
      apiKey: opts.apiKey,
      temperature: opts.temperature ?? 0.7,
      maxTokens: opts.maxTokens ?? 8192,
      fetchImpl: opts.fetchImpl ?? fetch,
    };
  }

  /** No standard count endpoint; estimate ~4 chars/token (enough for compaction). */
  async countTokens(request: ModelRequest): Promise<number> {
    const text =
      request.system + JSON.stringify(request.messages) + JSON.stringify(request.tools);
    return Math.ceil(text.length / 4);
  }

  async *stream(request: ModelRequest, signal: AbortSignal): AsyncIterable<ModelStreamEvent> {
    const body = {
      model: this.#o.model,
      messages: toOpenAIMessages(request.system, request.messages),
      tools: request.tools.length > 0 ? request.tools.map(toOpenAITool) : undefined,
      temperature: this.#o.temperature,
      max_tokens: this.#o.maxTokens,
      stream: true,
      // Ask the API to include a final usage chunk (real token counts).
      stream_options: { include_usage: true },
    };

    const res = await this.#o.fetchImpl(`${this.#o.baseURL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.#o.apiKey}`,
      },
      body: JSON.stringify(body),
      signal,
    });

    if (!res.ok || !res.body) {
      const detail = await safeText(res);
      throw new Error(`${this.name} HTTP ${res.status} ${res.statusText}: ${detail}`);
    }

    const toolCalls = new Map<number, { id: string; name: string; args: string }>();
    let finishReason = "stop";

    for await (const data of sseLines(res.body, signal)) {
      if (data === "[DONE]") break;
      let chunk: ChatChunk;
      try {
        chunk = JSON.parse(data) as ChatChunk;
      } catch {
        continue; // ignore keep-alives / malformed lines
      }
      // A final usage-only chunk may arrive with no choices.
      if (chunk.usage) {
        yield {
          type: "usage",
          inputTokens: chunk.usage.prompt_tokens ?? 0,
          outputTokens: chunk.usage.completion_tokens ?? 0,
          totalTokens: chunk.usage.total_tokens ?? 0,
        };
      }

      const choice = chunk.choices?.[0];
      if (!choice) continue;

      // DeepSeek reasoner streams reasoning separately from the answer.
      const reasoning = choice.delta?.reasoning_content;
      if (reasoning) yield { type: "thinking_delta", text: reasoning };

      const content = choice.delta?.content;
      if (content) yield { type: "text_delta", text: content };

      for (const tc of choice.delta?.tool_calls ?? []) {
        const cur = toolCalls.get(tc.index) ?? { id: "", name: "", args: "" };
        if (tc.id) cur.id = tc.id;
        if (tc.function?.name) cur.name = tc.function.name;
        if (tc.function?.arguments) cur.args += tc.function.arguments;
        toolCalls.set(tc.index, cur);
      }

      if (choice.finish_reason) finishReason = choice.finish_reason;
    }

    // Emit completed tool calls (arguments fully accumulated), then done.
    for (const [, call] of [...toolCalls.entries()].sort((a, b) => a[0] - b[0])) {
      yield {
        type: "tool_use",
        id: call.id || `call_${call.name}_${Math.random().toString(36).slice(2, 8)}`,
        name: call.name,
        input: parseArgs(call.args, finishReason),
      };
    }

    yield { type: "done", stopReason: finishReason === "tool_calls" ? "tool_use" : "end_turn" };
  }
}

// ── Wire types (only the fields we read) ─────────────────────────────────────
interface ChatChunk {
  choices?: Array<{
    delta?: {
      content?: string;
      reasoning_content?: string;
      tool_calls?: Array<{
        index: number;
        id?: string;
        function?: { name?: string; arguments?: string };
      }>;
    };
    finish_reason?: string | null;
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}

// ── Translation: normalized kurt-agent ↔ OpenAI wire format ──────────────────

/** Build the OpenAI `messages` array from the engine's normalized history. */
export function toOpenAIMessages(system: string, messages: Message[]): unknown[] {
  const out: unknown[] = [];
  if (system.trim().length > 0) out.push({ role: "system", content: system });

  for (const msg of messages) {
    if (msg.role === "user") {
      out.push({ role: "user", content: textOf(msg.content) });
      continue;
    }
    if (msg.role === "assistant") {
      const text = textOf(msg.content);
      const toolCalls = msg.content
        .filter((b) => b.type === "tool_use")
        .map((b) => {
          const t = b as Extract<typeof b, { type: "tool_use" }>;
          return {
            id: t.id,
            type: "function",
            function: { name: t.name, arguments: JSON.stringify(t.input ?? {}) },
          };
        });
      out.push({
        role: "assistant",
        content: text.length > 0 ? text : null,
        ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
      });
      continue;
    }
    // role === "tool": one OpenAI tool message per result block.
    for (const block of msg.content) {
      if (block.type !== "tool_result") continue;
      out.push({ role: "tool", tool_call_id: block.toolUseId, content: block.content });
    }
  }
  return out;
}

/** Convert a kurt-agent ToolSpec into an OpenAI function-tool definition. */
export function toOpenAITool(spec: ToolSpec): unknown {
  return {
    type: "function",
    function: { name: spec.name, description: spec.description, parameters: spec.inputSchema },
  };
}

function textOf(content: Message["content"]): string {
  return content
    .filter((b) => b.type === "text")
    .map((b) => (b as Extract<typeof b, { type: "text" }>).text)
    .join("");
}

function parseArgs(args: string, finishReason: string): unknown {
  if (!args || args.trim().length === 0) return {};
  try {
    return JSON.parse(args);
  } catch {
    // Invalid/incomplete JSON — almost always the args were cut off by the output
    // token limit (finish_reason "length"). Mark it so tools give a clear error.
    return { [MALFORMED_ARGS]: true, truncated: finishReason === "length", raw: args };
  }
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 500);
  } catch {
    return "(no body)";
  }
}

/** Yield the payload of each `data:` line from an SSE byte stream. */
async function* sseLines(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal,
): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      if (signal.aborted) {
        const err = new Error("Aborted");
        err.name = "AbortError";
        throw err;
      }
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (line.startsWith("data:")) yield line.slice(5).trim();
      }
    }
  } finally {
    try {
      await reader.cancel();
    } catch {
      // already closed
    }
  }
}
