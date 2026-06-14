/**
 * Public API of kurt-agent — the surface consumed by sibling packages (e.g.
 * kurt-tui) via the package name "kurt-agent". Internally everything still lives
 * in its own module; this is just the curated re-export.
 */

export * from "./engine/index.ts";
export * from "./providers/index.ts";
export * from "./tools/index.ts";
export * from "./sandbox/index.ts";
export * from "./session/index.ts";
export * from "./search/index.ts";
export * from "./permission/index.ts";
export * from "./ask/index.ts";
export * from "./agent/index.ts";
export * from "./worktree/index.ts";
export * from "./mcp/index.ts";

export { truncate, truncationNote, DEFAULT_MAX_LINES, DEFAULT_MAX_BYTES } from "./truncate.ts";
export type { TruncateOptions, Truncation } from "./truncate.ts";

export { messagesFromEvents } from "./modes/history.ts";
export { compactHistory, compactionSplit, serializeForSummary, autoCompaction } from "./modes/compaction.ts";
export type { CompactionResult, AutoCompactionOptions } from "./modes/compaction.ts";
export { runStdoutMode } from "./modes/stdout.ts";
export type { StdoutModeOptions } from "./modes/stdout.ts";
