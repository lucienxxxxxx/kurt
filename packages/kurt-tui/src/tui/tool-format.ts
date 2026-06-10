/**
 * Pretty formatting for tool calls in the TUI: a friendly label, a concise IN,
 * and an OUT that is clipped when it's too long. Pure → unit-tested.
 */

import { safeJson } from "./entries.ts";

const TOOL_LABELS: Record<string, string> = {
  shell: "Bash",
  run_code: "Code",
  read_file: "Read",
  write_file: "Write",
  web_search: "Search",
};

/** Friendly display name (falls back to the raw tool name, e.g. MCP/skill tools). */
export function toolLabel(name: string): string {
  return TOOL_LABELS[name] ?? name;
}

/** A compact one-line brief for the tool-card header (or "" when not useful). */
export function toolSummary(name: string, input: unknown): string {
  const o = (input ?? {}) as Record<string, unknown>;
  let s: string;
  switch (name) {
    case "shell":
      s = String(o.command ?? "");
      break;
    case "read_file":
    case "write_file":
      s = String(o.path ?? "");
      break;
    case "ls":
      s = String(o.path ?? ".");
      break;
    case "grep":
      s = `/${String(o.pattern ?? "")}/${o.path ? " " + String(o.path) : ""}`;
      break;
    case "web_search":
      s = String(o.query ?? "");
      break;
    case "run_code":
      s = String(o.language ?? "code");
      break;
    case "brew":
      s = String(o.args ?? "");
      break;
    case "memory":
      s = [o.action, o.scope].filter(Boolean).join(" ");
      break;
    default:
      s = "";
  }
  return oneLine(s, 60);
}

/** Collapse whitespace to a single line and clip to `max` chars. */
function oneLine(s: string, max: number): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > max ? t.slice(0, max - 1) + "…" : t;
}

/** The most useful one-or-few-line view of a tool's input. */
export function formatToolInput(name: string, input: unknown): string {
  const o = (input ?? {}) as Record<string, unknown>;
  switch (name) {
    case "shell":
      return String(o.command ?? "");
    case "read_file":
    case "write_file":
      return String(o.path ?? "");
    case "web_search":
      return String(o.query ?? "");
    case "run_code":
      return `${String(o.language ?? "code")}\n${String(o.code ?? "")}`;
    default:
      return safeJson(input);
  }
}

export interface Clipped {
  text: string;
  clipped: boolean;
}

/** Clip text to at most `maxLines` lines / `maxChars` chars, flagging if cut. */
export function clip(text: string, maxLines: number, maxChars: number): Clipped {
  let clipped = false;
  let t = text;
  if (t.length > maxChars) {
    t = t.slice(0, maxChars);
    clipped = true;
  }
  const lines = t.split("\n");
  if (lines.length > maxLines) {
    t = lines.slice(0, maxLines).join("\n");
    clipped = true;
  }
  return { text: t, clipped };
}

/** Prefix the first line with `label`, aligning continuation lines under it. */
export function labeled(label: string, text: string): string {
  const indent = " ".repeat(label.length + 1);
  return text
    .split("\n")
    .map((line, i) => (i === 0 ? `${label} ${line}` : `${indent}${line}`))
    .join("\n");
}
