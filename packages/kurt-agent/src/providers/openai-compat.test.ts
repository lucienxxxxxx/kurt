/**
 * Offline tests for OpenAICompatModel — no network. A fake fetch returns canned
 * SSE so we can verify wire translation and stream parsing deterministically.
 */

import { describe, expect, test } from "bun:test";
import { OpenAICompatModel, toOpenAIMessages, toOpenAITool } from "./openai-compat.ts";
import type { ModelRequest, ModelStreamEvent } from "../engine/index.ts";
import { MALFORMED_ARGS } from "../tool-args.ts";

function sseResponse(...lines: string[]): Response {
  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const l of lines) controller.enqueue(enc.encode(l));
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}

const REQ: ModelRequest = { system: "sys", messages: [], tools: [] };

async function drain(it: AsyncIterable<ModelStreamEvent>): Promise<ModelStreamEvent[]> {
  const out: ModelStreamEvent[] = [];
  for await (const e of it) out.push(e);
  return out;
}

describe("toOpenAIMessages", () => {
  test("maps system, user, assistant(text+tool_use), and tool results", () => {
    const msgs = toOpenAIMessages("you are kurt", [
      { role: "user", content: [{ type: "text", text: "hi" }] },
      {
        role: "assistant",
        content: [
          { type: "text", text: "let me check" },
          { type: "tool_use", id: "c1", name: "read_file", input: { path: "a.txt" } },
        ],
      },
      { role: "tool", content: [{ type: "tool_result", toolUseId: "c1", content: "FILE", isError: false }] },
    ]) as Array<Record<string, unknown>>;

    expect(msgs[0]).toEqual({ role: "system", content: "you are kurt" });
    expect(msgs[1]).toEqual({ role: "user", content: "hi" });
    const asst = msgs[2] as { role: string; content: string; tool_calls: Array<{ id: string; function: { name: string; arguments: string } }> };
    expect(asst.role).toBe("assistant");
    expect(asst.content).toBe("let me check");
    expect(asst.tool_calls[0]!.id).toBe("c1");
    expect(asst.tool_calls[0]!.function.name).toBe("read_file");
    expect(JSON.parse(asst.tool_calls[0]!.function.arguments)).toEqual({ path: "a.txt" });
    expect(msgs[3]).toEqual({ role: "tool", tool_call_id: "c1", content: "FILE" });
  });

  test("omits an empty system message", () => {
    const msgs = toOpenAIMessages("", [{ role: "user", content: [{ type: "text", text: "x" }] }]);
    expect((msgs[0] as { role: string }).role).toBe("user");
  });
});

describe("toOpenAITool", () => {
  test("wraps a ToolSpec as a function tool", () => {
    const t = toOpenAITool({ name: "foo", description: "d", inputSchema: { type: "object" } }) as {
      type: string;
      function: { name: string; parameters: unknown };
    };
    expect(t.type).toBe("function");
    expect(t.function.name).toBe("foo");
    expect(t.function.parameters).toEqual({ type: "object" });
  });
});

describe("OpenAICompatModel.stream", () => {
  test("parses streamed text into deltas then done(end_turn)", async () => {
    const model = new OpenAICompatModel({
      baseURL: "https://example.test",
      model: "m",
      apiKey: "k",
      fetchImpl: async () =>
        sseResponse(
          'data: {"choices":[{"delta":{"content":"Hel"}}]}\n',
          'data: {"choices":[{"delta":{"content":"lo"}}]}\n',
          'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n',
          "data: [DONE]\n",
        ),
    });
    const events = await drain(model.stream(REQ, new AbortController().signal));
    expect(events).toEqual([
      { type: "text_delta", text: "Hel" },
      { type: "text_delta", text: "lo" },
      { type: "done", stopReason: "end_turn" },
    ]);
  });

  test("accumulates streamed tool-call arguments into one tool_use + done(tool_use)", async () => {
    const model = new OpenAICompatModel({
      baseURL: "https://example.test",
      model: "m",
      apiKey: "k",
      fetchImpl: async () =>
        sseResponse(
          'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"shell","arguments":"{\\"comm"}}]}}]}\n',
          'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"and\\":\\"ls\\"}"}}]}}]}\n',
          'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n',
          "data: [DONE]\n",
        ),
    });
    const events = await drain(model.stream(REQ, new AbortController().signal));
    expect(events).toEqual([
      { type: "tool_use", id: "call_1", name: "shell", input: { command: "ls" } },
      { type: "done", stopReason: "tool_use" },
    ]);
  });

  test("emits thinking_delta for reasoning_content and a usage event", async () => {
    const model = new OpenAICompatModel({
      baseURL: "https://example.test",
      model: "deepseek-reasoner",
      apiKey: "k",
      fetchImpl: async () =>
        sseResponse(
          'data: {"choices":[{"delta":{"reasoning_content":"let me think"}}]}\n',
          'data: {"choices":[{"delta":{"content":"the answer"}}]}\n',
          'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n',
          'data: {"choices":[],"usage":{"prompt_tokens":120,"completion_tokens":30,"total_tokens":150}}\n',
          "data: [DONE]\n",
        ),
    });
    const events = await drain(model.stream(REQ, new AbortController().signal));
    expect(events).toEqual([
      { type: "thinking_delta", text: "let me think" },
      { type: "text_delta", text: "the answer" },
      { type: "usage", inputTokens: 120, outputTokens: 30, totalTokens: 150 },
      { type: "done", stopReason: "end_turn" },
    ]);
  });

  test("truncated tool-call arguments (finish_reason length) surface a malformed-args marker", async () => {
    const model = new OpenAICompatModel({
      baseURL: "https://example.test",
      model: "m",
      apiKey: "k",
      fetchImpl: async () =>
        sseResponse(
          'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"c1","function":{"name":"write_file","arguments":"{\\"path\\":\\"a\\",\\"content\\":\\"<<incomplete"}}]}}]}\n',
          'data: {"choices":[{"delta":{},"finish_reason":"length"}]}\n',
          "data: [DONE]\n",
        ),
    });
    const events = await drain(model.stream(REQ, new AbortController().signal));
    const tu = events.find((e) => e.type === "tool_use") as { type: "tool_use"; input: Record<string, unknown> };
    expect(tu.input[MALFORMED_ARGS]).toBe(true);
    expect(tu.input.truncated).toBe(true);
  });

  test("shapes the request body from the model's capabilities (thinking off)", async () => {
    let body: Record<string, unknown> = {};
    const model = new OpenAICompatModel({
      baseURL: "https://example.test",
      model: "deepseek-v4-pro",
      apiKey: "k",
      thinking: false,
      fetchImpl: async (_url, init) => {
        body = JSON.parse(String(init?.body));
        return sseResponse('data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n', "data: [DONE]\n");
      },
    });
    await drain(model.stream(REQ, new AbortController().signal));
    expect(body.thinking).toEqual({ type: "disabled" }); // explicit, overrides API default
    expect(body.reasoning_effort).toBeUndefined();
    expect(body.temperature).toBeDefined(); // sampling allowed outside thinking
  });

  test("enables thinking, sends mapped reasoning_effort, and omits sampling params", async () => {
    let body: Record<string, unknown> = {};
    const model = new OpenAICompatModel({
      baseURL: "https://example.test",
      model: "deepseek-v4-pro",
      apiKey: "k",
      thinking: true,
      effort: "medium", // collapses to "high" on V4
      fetchImpl: async (_url, init) => {
        body = JSON.parse(String(init?.body));
        return sseResponse('data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n', "data: [DONE]\n");
      },
    });
    await drain(model.stream(REQ, new AbortController().signal));
    expect(body.thinking).toEqual({ type: "enabled" });
    expect(body.reasoning_effort).toBe("high");
    expect(body.temperature).toBeUndefined(); // rejected by the API while thinking
  });

  test("never sends vendor reasoning fields for a model without thinking support", async () => {
    let body: Record<string, unknown> = {};
    const model = new OpenAICompatModel({
      baseURL: "https://example.test",
      model: "some-unknown-model",
      apiKey: "k",
      thinking: true, // requested, but the model can't — so it must be ignored
      fetchImpl: async (_url, init) => {
        body = JSON.parse(String(init?.body));
        return sseResponse('data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n', "data: [DONE]\n");
      },
    });
    await drain(model.stream(REQ, new AbortController().signal));
    expect(body.thinking).toBeUndefined();
    expect(body.reasoning_effort).toBeUndefined();
    expect(body.temperature).toBeDefined();
  });

  test("throws a helpful error on non-2xx", async () => {
    const model = new OpenAICompatModel({
      baseURL: "https://example.test",
      model: "m",
      apiKey: "bad",
      name: "deepseek",
      fetchImpl: async () => new Response("Unauthorized", { status: 401, statusText: "Unauthorized" }),
    });
    await expect(drain(model.stream(REQ, new AbortController().signal))).rejects.toThrow(/deepseek HTTP 401/);
  });
});
