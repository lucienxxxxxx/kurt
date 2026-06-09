/**
 * The engine package's public surface. This is the entire contract every other
 * layer (providers, tools, modes, future sub-agents) depends on. If adding a new
 * capability requires changing anything in here, re-read 铁律 #3 (加壳不改核).
 */

export type {
  JSONSchema,
  Role,
  TextBlock,
  ToolUseBlock,
  ToolResultBlock,
  ContentBlock,
  Message,
  Event,
  EventType,
} from "./types.ts";

export type { ToolSpec, ToolContext, ToolResult, Tool } from "./tool.ts";
export type { ModelProvider, ModelRequest, ModelStreamEvent } from "./model.ts";
export type { CompactionPolicy } from "./compaction.ts";

export { runLoop } from "./loop.ts";
export type { RunLoopOptions } from "./loop.ts";

export { AsyncEventQueue } from "./async-queue.ts";
