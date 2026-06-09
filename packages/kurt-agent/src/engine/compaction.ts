/**
 * The CompactionPolicy contract (Phase 3 seam — defined now, implemented later).
 *
 * Division of labor (per the plan):
 *   - The engine decides WHEN to compact: it compares live token usage against
 *     `thresholdTokens` each turn. This is the only judgement the engine makes.
 *   - The policy decides HOW to compact: `compact()` is injected orchestration
 *     logic that may call a (possibly different) model to summarize. The engine
 *     never writes Memory.md and never picks a summarization strategy.
 *
 * Critical correctness rule for any real implementation: `compact()` MUST keep
 * the most recent tool_result(s) and any not-yet-answered tool_use blocks intact.
 * Breaking tool_use/tool_result pairing makes the LLM error out.
 */

import type { Message } from "./types.ts";

export interface CompactionPolicy {
  /** Engine triggers compaction when estimated tokens reach this threshold. */
  readonly thresholdTokens: number;

  /**
   * Rewrite history into a shorter form. Returns the new message list. Must
   * preserve tool_use/tool_result pairing. Honor `signal`.
   */
  compact(messages: Message[], signal: AbortSignal): Promise<Message[]>;
}
