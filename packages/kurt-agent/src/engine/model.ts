/**
 * The ModelProvider contract — the engine's view of "an LLM".
 *
 * 铁律 #2: provider differences (wire formats, streaming chunk shapes, token
 * counting) are digested INSIDE each implementation (Phase 4: Anthropic, OpenAI,
 * local, ...). The engine only ever sees this normalized shape. Auth/keys are an
 * orchestration concern and never reach the engine.
 */

import type { Message } from "./types.ts";
import type { ToolSpec } from "./tool.ts";

export interface ModelRequest {
  system: string;
  messages: Message[];
  tools: ToolSpec[];
}

/**
 * Normalized streaming chunks. Providers MAY stream partial tool-call JSON
 * internally, but they MUST accumulate and emit a single, complete `tool_use`
 * chunk — the engine never deals with partial tool input.
 */
export type ModelStreamEvent =
  | { type: "text_delta"; text: string }
  /** Reasoning/"thinking" tokens, kept separate from the answer (display-only). */
  | { type: "thinking_delta"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  /** Real token usage reported by the API (when available). */
  | { type: "usage"; inputTokens: number; outputTokens: number; totalTokens: number }
  | { type: "done"; stopReason: string };

export interface ModelProvider {
  readonly name: string;

  /** Estimate token usage for a request (used by the compaction trigger). */
  countTokens(request: ModelRequest): Promise<number>;

  /** Stream a single assistant response. Must reject/stop promptly on abort. */
  stream(request: ModelRequest, signal: AbortSignal): AsyncIterable<ModelStreamEvent>;
}
