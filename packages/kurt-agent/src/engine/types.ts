/**
 * Core domain types: the normalized, provider-agnostic conversation model
 * and the event stream the engine emits.
 *
 * 铁律 #2 (协议无关): nothing here references TUI / WebSocket / HTTP. Events are
 * pure data; a modal layer subscribes and serializes them however it likes.
 */

// ─────────────────────────────────────────────────────────────────────────────
// JSON Schema (minimal, dependency-free) — used to describe tool inputs.
// ─────────────────────────────────────────────────────────────────────────────

export interface JSONSchema {
  type?: "object" | "array" | "string" | "number" | "integer" | "boolean" | "null";
  description?: string;
  properties?: Record<string, JSONSchema>;
  items?: JSONSchema;
  required?: string[];
  enum?: unknown[];
  [key: string]: unknown;
}

// ─────────────────────────────────────────────────────────────────────────────
// Conversation model — normalized content blocks.
//
// This is the engine's INTERNAL representation. Each ModelProvider (Phase 4) is
// responsible for translating to/from its wire format (e.g. Anthropic puts
// tool_result blocks in a `user` message; OpenAI uses a `tool` role). The engine
// never sees provider-specific shapes.
// ─────────────────────────────────────────────────────────────────────────────

export type Role = "user" | "assistant" | "tool";

export interface TextBlock {
  type: "text";
  text: string;
}

/**
 * Reasoning/"thinking" produced before the answer. Kept as a normalized block so
 * providers that REQUIRE it echoed back (e.g. DeepSeek thinking mode with tool
 * calls — see `ModelCapabilities.thinking.replayReasoning`) can re-serialize it.
 * Providers that don't need it simply ignore the block. The engine never inspects
 * its contents.
 */
export interface ThinkingBlock {
  type: "thinking";
  text: string;
}

export interface ToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: unknown;
}

export interface ToolResultBlock {
  type: "tool_result";
  /** Must match the id of the ToolUseBlock it answers. */
  toolUseId: string;
  content: string;
  isError: boolean;
}

export type ContentBlock = TextBlock | ThinkingBlock | ToolUseBlock | ToolResultBlock;

export interface Message {
  role: Role;
  content: ContentBlock[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Event stream — the engine's only output channel.
//
// A run produces an ordered stream of these. The canonical ordering within a run:
//
//   turn_start
//     llm_delta*            (streamed assistant text)
//     (tool_call  tool_result)*   (each tool_call is ALWAYS paired with a result)
//   turn_end
//   ... repeat per loop iteration ...
//
// Terminal signals: the iterator simply completes on normal end. `aborted` or
// `error` precede an early completion.
// ─────────────────────────────────────────────────────────────────────────────

export type Event =
  | { type: "turn_start"; turn: number }
  | { type: "llm_delta"; text: string }
  // Reasoning/"thinking" tokens streamed separately from the answer (for display).
  // Also accumulated into a ThinkingBlock on the assistant message so providers
  // that require it can replay it (see ModelCapabilities.thinking.replayReasoning).
  | { type: "thinking"; text: string }
  | { type: "tool_call"; id: string; name: string; input: unknown }
  // Live output a running tool streams before its final tool_result (e.g. a shell
  // command's stdout/stderr). `id` matches the tool_call.
  | { type: "tool_output"; id: string; text: string }
  | { type: "tool_result"; id: string; content: string; isError: boolean }
  // Real token usage from the model API, forwarded for observability (status bars).
  | { type: "usage"; inputTokens: number; outputTokens: number; totalTokens: number }
  | { type: "turn_end"; turn: number; stopReason: string }
  | { type: "aborted"; reason: string }
  | { type: "error"; message: string; fatal: boolean }
  // Phase 3 seam — emitted when an injected CompactionPolicy rewrites history.
  | { type: "compaction"; reason: string; messagesBefore: number; messagesAfter: number };

export type EventType = Event["type"];
