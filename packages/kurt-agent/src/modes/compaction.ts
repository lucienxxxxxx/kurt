/**
 * Manual context compaction (the orchestration-layer, /compact variant).
 *
 * The hard part is correctness: we must never split an assistant tool_use from
 * its tool_result. We sidestep that by only ever cutting at a *user* message
 * boundary — between user turns, every assistant/tool exchange is complete — so
 * the summarized slice and the kept slice are both self-consistent.
 *
 * This is the core of Phase 3's compaction; the engine's CompactionPolicy seam
 * (auto-trigger) can later reuse the same summarize step.
 */

import type { Message } from "../engine/index.ts";

/**
 * Index to split at: messages[0..i) get summarized, [i..] are kept verbatim.
 * Returns 0 (no-op) when there aren't enough user turns to bother.
 */
export function compactionSplit(messages: Message[], keepUserTurns: number): number {
  const userIndices = messages.map((m, i) => (m.role === "user" ? i : -1)).filter((i) => i >= 0);
  if (userIndices.length <= keepUserTurns) return 0;
  return userIndices[userIndices.length - keepUserTurns] ?? 0;
}

export interface CompactionResult {
  messages: Message[];
  summarizedCount: number;
}

/**
 * Replace older turns with a single summary message. `summarize` is injected by
 * the orchestration layer (it calls a model), keeping this dependency-free.
 */
export async function compactHistory(
  messages: Message[],
  summarize: (older: Message[]) => Promise<string>,
  keepUserTurns = 2,
): Promise<CompactionResult> {
  const split = compactionSplit(messages, keepUserTurns);
  if (split <= 0) return { messages, summarizedCount: 0 };

  const older = messages.slice(0, split);
  const kept = messages.slice(split);
  const summary = await summarize(older);

  const summaryMessage: Message = {
    role: "user",
    content: [{ type: "text", text: `[Summary of earlier conversation]\n${summary}` }],
  };
  return { messages: [summaryMessage, ...kept], summarizedCount: older.length };
}

/** Flatten messages into a plain transcript for a summarization prompt. */
export function serializeForSummary(messages: Message[]): string {
  const lines: string[] = [];
  for (const m of messages) {
    for (const block of m.content) {
      if (block.type === "text") lines.push(`${m.role}: ${block.text}`);
      else if (block.type === "tool_use") lines.push(`${m.role} → tool ${block.name}(${safe(block.input)})`);
      else if (block.type === "tool_result") lines.push(`tool result: ${block.content.slice(0, 500)}`);
    }
  }
  return lines.join("\n");
}

function safe(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
