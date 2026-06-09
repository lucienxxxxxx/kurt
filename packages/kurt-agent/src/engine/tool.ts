/**
 * The Tool contract — the engine's ONLY sanctioned place for side effects.
 *
 * 铁律 #1 (引擎零 I/O): the engine itself touches no files/network/console. Every
 * side effect lives behind this interface. A tool may be backed by the local FS,
 * a sandbox, a docker container, a remote service, or even a whole sub-agent
 * (Phase 7) — the engine cannot tell the difference and never needs to.
 *
 * Phase 7 seam: `ToolContext.emit` lets a tool push events into the parent's
 * stream. A SubAgentTool runs its own loop and bubbles child events up through
 * this. Adding sub-agents = registering a new Tool; the engine does not change.
 */

import type { Event, JSONSchema } from "./types.ts";

/** The schema a tool advertises to the model. Distinct from its executor. */
export interface ToolSpec {
  name: string;
  description: string;
  inputSchema: JSONSchema;
}

export interface ToolContext {
  /** Cancellation. Tools SHOULD honor this for long-running work. */
  readonly signal: AbortSignal;
  /**
   * Push an event into the parent engine's stream (Phase 7 sub-agent bubbling).
   * Ordering relative to the engine's own events is preserved (FIFO).
   */
  emit(event: Event): void;
}

export interface ToolResult {
  /** Text handed back to the model as the tool_result content. */
  content: string;
  /** When true, the model is told the tool failed (but the loop continues). */
  isError?: boolean;
}

export interface Tool {
  readonly spec: ToolSpec;
  /**
   * Execute the tool. Resolves with a result, or rejects on unexpected failure
   * (the engine converts rejections into an `isError` result so the loop never
   * crashes). Honor `ctx.signal` to support clean cancellation.
   */
  execute(input: unknown, ctx: ToolContext): Promise<ToolResult>;
}
