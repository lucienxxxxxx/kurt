/**
 * runLoop — the agentic loop. The load-bearing wall of the whole project.
 *
 * It orchestrates model ↔ tools ↔ model until the model stops requesting tools,
 * emitting a clean, ordered event stream the whole time. It performs ZERO I/O
 * itself (铁律 #1): all side effects come from injected Tool / ModelProvider /
 * CompactionPolicy implementations.
 *
 * Guaranteed invariants (the Phase 1 acceptance criteria):
 *   1. Ordering: turn_start ... (llm_delta* tool_call* tool_result*) ... turn_end.
 *   2. Pairing: every emitted `tool_call` is followed by exactly one matching
 *      `tool_result` — even on abort or tool failure. No dangling tool_calls.
 *   3. Resilience: a throwing tool becomes a `tool_result(isError:true)` and the
 *      loop keeps going; it never crashes the engine.
 */

import type { ContentBlock, Event, Message, ToolResultBlock, ToolUseBlock } from "./types.ts";
import type { ModelProvider, ModelRequest } from "./model.ts";
import type { Tool, ToolContext, ToolResult } from "./tool.ts";
import type { CompactionPolicy } from "./compaction.ts";
import { AsyncEventQueue } from "./async-queue.ts";

export interface RunLoopOptions {
  system: string;
  /** Initial conversation. Copied internally; the caller's array is not mutated. */
  messages: Message[];
  tools: Tool[];
  model: ModelProvider;
  /** Optional Phase 3 injection. When absent, no token counting happens. */
  compaction?: CompactionPolicy;
  /** External cancellation. */
  signal?: AbortSignal;
  /** Safety bound on loop iterations. Default 50. */
  maxTurns?: number;
}

/**
 * Start a run. Returns immediately with an `AsyncIterable<Event>`; the loop runs
 * as the stream is consumed. To stop early, abort the signal passed in `options`.
 */
export function runLoop(options: RunLoopOptions): AsyncIterable<Event> {
  const queue = new AsyncEventQueue<Event>();
  const signal = options.signal ?? new AbortController().signal;

  void drive(options, queue, signal)
    .catch((err: unknown) => {
      queue.push({ type: "error", message: errorMessage(err), fatal: true });
    })
    .finally(() => queue.close());

  return queue;
}

async function drive(
  options: RunLoopOptions,
  queue: AsyncEventQueue<Event>,
  signal: AbortSignal,
): Promise<void> {
  const messages: Message[] = options.messages.map((m) => ({ ...m, content: [...m.content] }));
  const toolMap = new Map(options.tools.map((t) => [t.spec.name, t]));
  const toolSpecs = options.tools.map((t) => t.spec);
  const maxTurns = options.maxTurns ?? 50;

  const emit = (event: Event): void => queue.push(event);

  for (let turn = 1; turn <= maxTurns; turn++) {
    if (signal.aborted) return void emit({ type: "aborted", reason: "signal" });

    emit({ type: "turn_start", turn });

    // ── Phase 3 seam: engine judges WHEN, injected policy decides HOW. ──
    if (options.compaction) {
      const request: ModelRequest = { system: options.system, messages, tools: toolSpecs };
      const tokens = await options.model.countTokens(request);
      if (tokens >= options.compaction.thresholdTokens) {
        const before = messages.length;
        const compacted = await options.compaction.compact(messages, signal);
        messages.splice(0, messages.length, ...compacted);
        emit({
          type: "compaction",
          reason: `tokens=${tokens} >= threshold=${options.compaction.thresholdTokens}`,
          messagesBefore: before,
          messagesAfter: messages.length,
        });
      }
    }

    // ── Stream one assistant response. ──
    const request: ModelRequest = { system: options.system, messages, tools: toolSpecs };
    let textBuffer = "";
    let thinkingBuffer = "";
    const toolCalls: ToolUseBlock[] = [];
    let stopReason = "end_turn";

    try {
      for await (const chunk of options.model.stream(request, signal)) {
        switch (chunk.type) {
          case "text_delta":
            textBuffer += chunk.text;
            emit({ type: "llm_delta", text: chunk.text });
            break;
          case "thinking_delta":
            // Forwarded for UIs AND accumulated, so it can be replayed in history
            // for providers that require it (capabilities-gated at serialize time).
            thinkingBuffer += chunk.text;
            emit({ type: "thinking", text: chunk.text });
            break;
          case "tool_use":
            toolCalls.push({ type: "tool_use", id: chunk.id, name: chunk.name, input: chunk.input });
            break;
          case "usage":
            emit({
              type: "usage",
              inputTokens: chunk.inputTokens,
              outputTokens: chunk.outputTokens,
              totalTokens: chunk.totalTokens,
            });
            break;
          case "done":
            stopReason = chunk.stopReason;
            break;
        }
      }
    } catch (err) {
      if (isAbort(err) || signal.aborted) return void emit({ type: "aborted", reason: "signal" });
      throw err;
    }

    // Record the assistant turn (thinking, then text, then any tool_use blocks).
    const assistantContent: ContentBlock[] = [];
    if (thinkingBuffer.length > 0) assistantContent.push({ type: "thinking", text: thinkingBuffer });
    if (textBuffer.length > 0) assistantContent.push({ type: "text", text: textBuffer });
    assistantContent.push(...toolCalls);
    messages.push({ role: "assistant", content: assistantContent });

    // No tools requested → the model is done. Close out and finish.
    if (toolCalls.length === 0) {
      emit({ type: "turn_end", turn, stopReason });
      return;
    }

    // Announce all tool calls up front (so a UI can render them as they arrive).
    for (const call of toolCalls) {
      emit({ type: "tool_call", id: call.id, name: call.name, input: call.input });
    }

    // Execute each call, ALWAYS producing exactly one paired tool_result.
    const resultBlocks: ToolResultBlock[] = [];
    for (const call of toolCalls) {
      const result = await runTool(toolMap.get(call.name), call, emit, signal);
      emit({ type: "tool_result", id: call.id, content: result.content, isError: result.isError === true });
      resultBlocks.push({
        type: "tool_result",
        toolUseId: call.id,
        content: result.content,
        isError: result.isError === true,
      });
    }
    messages.push({ role: "tool", content: resultBlocks });

    emit({ type: "turn_end", turn, stopReason });

    // Aborted mid-turn? We've already paired every tool_call above, so the
    // history is consistent — stop cleanly now.
    if (signal.aborted) return void emit({ type: "aborted", reason: "signal" });
  }

  emit({ type: "error", message: `Exceeded maxTurns (${maxTurns})`, fatal: true });
}

/** Resolve a single tool call to a result, never throwing. */
async function runTool(
  tool: Tool | undefined,
  call: ToolUseBlock,
  emit: (event: Event) => void,
  signal: AbortSignal,
): Promise<ToolResult> {
  if (signal.aborted) return { content: "Aborted before tool execution.", isError: true };
  if (!tool) return { content: `Unknown tool: ${call.name}`, isError: true };
  const ctx: ToolContext = { signal, emit, toolCallId: call.id };
  try {
    return await tool.execute(call.input, ctx);
  } catch (err) {
    if (isAbort(err)) return { content: `Tool "${call.name}" aborted.`, isError: true };
    return { content: `Tool "${call.name}" failed: ${errorMessage(err)}`, isError: true };
  }
}

function isAbort(err: unknown): boolean {
  return err instanceof Error && err.name === "AbortError";
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
