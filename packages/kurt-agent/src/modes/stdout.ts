/**
 * The stdout mode — the reference `runMode(engine)` template (Phase 6 will clone
 * this shape for WebSocket / TUI / desktop / mobile).
 *
 * A mode does exactly two things (铁律 #2):
 *   1. Subscribe to engine events → serialize to an output protocol (here: stdout).
 *   2. (Phase 6) Listen for external input → translate to engine commands.
 *
 * It knows nothing about HOW the engine works — only the `Event` shape.
 */

import type { Event } from "../engine/index.ts";

const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const RESET = "\x1b[0m";

export interface StdoutModeOptions {
  /** Disable ANSI colors (e.g. when piping). Default: auto-detect TTY. */
  color?: boolean;
}

export async function runStdoutMode(
  events: AsyncIterable<Event>,
  opts: StdoutModeOptions = {},
): Promise<void> {
  const color = opts.color ?? process.stdout.isTTY === true;
  const c = (code: string, s: string) => (color ? `${code}${s}${RESET}` : s);
  const write = (s: string) => process.stdout.write(s);
  const line = (s: string) => process.stdout.write(s + "\n");

  for await (const event of events) {
    switch (event.type) {
      case "turn_start":
        line(c(DIM, `\n── turn ${event.turn} ────────────────────────────`));
        break;
      case "llm_delta":
        write(event.text);
        break;
      case "thinking":
        write(c(DIM, event.text));
        break;
      case "usage":
        line(c(DIM, `\n[usage] in=${event.inputTokens} out=${event.outputTokens} total=${event.totalTokens}`));
        break;
      case "tool_call":
        line(c(CYAN, `\n→ ${event.name}(${json(event.input)})`));
        break;
      case "tool_result":
        line(
          event.isError
            ? c(RED, `← error: ${preview(event.content)}`)
            : c(DIM, `← ${preview(event.content)}`),
        );
        break;
      case "turn_end":
        line(c(DIM, `── turn ${event.turn} end (stop: ${event.stopReason}) ──`));
        break;
      case "compaction":
        line(c(YELLOW, `⟳ compacted ${event.messagesBefore}→${event.messagesAfter} msgs (${event.reason})`));
        break;
      case "aborted":
        line(c(YELLOW, `\n⚠ aborted (${event.reason})`));
        break;
      case "error":
        line(c(BOLD + RED, `\n✗ error: ${event.message}`));
        break;
    }
  }
}

function json(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function preview(text: string, max = 120): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}
