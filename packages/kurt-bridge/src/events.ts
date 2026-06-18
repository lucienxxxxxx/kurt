/**
 * StepAccumulator — folds the engine's `Event` stream into the desktop's `Step`
 * shape (the analogue of kurt-tui's `entries.ts`, but producing the rich
 * thinking/text/tool/read/skill steps the desktop renders).
 *
 * Pure + synchronous: `apply(event)` returns the steps created or changed by that
 * event (to be SSE-upserted by _id on the client). No I/O — unit-testable.
 */

import type { Event, Message } from "kurt-agent";
import type { Step } from "./types.ts";

export class StepAccumulator {
  #steps: Step[] = [];
  #nextId = 1;
  // tool_call id → the index of its step in #steps (+ its subtype)
  #toolIndex = new Map<string, number>();
  // when the current thinking step started (to fill `sec` once it ends)
  #thinkingStartedAt: number | null = null;
  #thinkingIndex: number | null = null;

  constructor(private now: () => number = () => Date.now()) {}

  /** All steps so far (current snapshot). */
  steps(): Step[] {
    return this.#steps;
  }

  /**
   * Fold one engine event. Returns the steps it created/changed (possibly empty),
   * each a current full snapshot to upsert by `_id`.
   */
  apply(event: Event): Step[] {
    switch (event.type) {
      case "thinking":
        return this.#appendThinking(event.text);
      case "llm_delta":
        return this.#closeThinking(this.#appendText(event.text));
      case "tool_call":
        return this.#closeThinking(this.#startTool(event.id, event.name, event.input));
      case "tool_output":
        return this.#streamTool(event.id, event.text);
      case "tool_result":
        return this.#finishTool(event.id, event.content, event.isError);
      default:
        return []; // turn_start / turn_end / usage / aborted / error handled by the server
    }
  }

  #appendThinking(text: string): Step[] {
    const last = this.#steps[this.#steps.length - 1];
    if (last && last.type === "thinking") {
      last.text += text;
      return [last];
    }
    this.#thinkingStartedAt = this.now();
    this.#thinkingIndex = this.#steps.length;
    const step: Step = { _id: this.#nextId++, type: "thinking", text };
    this.#steps.push(step);
    return [step];
  }

  /** When a thinking block ends, stamp its elapsed seconds AND re-emit it, so the
   *  client upserts the final `sec` (otherwise it keeps the initial undefined → "0s"). */
  #closeThinking(passthrough: Step[]): Step[] {
    let closed: Step | undefined;
    if (this.#thinkingIndex !== null && this.#thinkingStartedAt !== null) {
      const t = this.#steps[this.#thinkingIndex];
      if (t && t.type === "thinking") {
        t.sec = Math.max(1, Math.round((this.now() - this.#thinkingStartedAt) / 1000));
        closed = t;
      }
    }
    this.#thinkingStartedAt = null;
    this.#thinkingIndex = null;
    return closed ? [closed, ...passthrough] : passthrough;
  }

  #appendText(text: string): Step[] {
    const last = this.#steps[this.#steps.length - 1];
    if (last && last.type === "text") {
      last.text += text;
      return [last];
    }
    const step: Step = { _id: this.#nextId++, type: "text", text };
    this.#steps.push(step);
    return [step];
  }

  #startTool(callId: string, name: string, input: unknown): Step[] {
    const step = newToolStep(this.#nextId++, name, input);
    this.#toolIndex.set(callId, this.#steps.length);
    this.#steps.push(step);
    return [step];
  }

  #streamTool(callId: string, text: string): Step[] {
    const step = this.#toolFor(callId);
    if (!step) return [];
    if (step.type === "tool") step.out += text;
    else if (step.type === "skill") step.output = (step.output ?? "") + text;
    return [step];
  }

  #finishTool(callId: string, content: string, isError: boolean): Step[] {
    const step = this.#toolFor(callId);
    if (!step) return [];
    if (step.type === "tool") { step.out = content; step.isError = isError; }
    else if (step.type === "skill") { step.output = stripSkillHeader(content); step.isError = isError; }
    // read steps show no output (the file opens in a panel); nothing to set.
    return [step];
  }

  #toolFor(callId: string): Step | undefined {
    const idx = this.#toolIndex.get(callId);
    return idx === undefined ? undefined : this.#steps[idx];
  }
}

/**
 * Reconstruct a saved conversation's `Message[]` into `Step[]` for reload — the
 * inverse of how the live loop builds steps from events. Shares the tool-subtype
 * mapping with StepAccumulator (one source of truth). Streamed thinking isn't
 * persisted as a separate block unless the provider replayed it, so reloaded
 * thinking may be absent; that's expected.
 */
export function messagesToSteps(messages: Message[]): Step[] {
  const steps: Step[] = [];
  const toolByUseId = new Map<string, Step>();
  let id = 0;
  const nextId = () => ++id;

  for (const msg of messages) {
    if (msg.role === "user") {
      const text = msg.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("");
      if (text) steps.push({ _id: nextId(), type: "user", text });
      continue;
    }
    if (msg.role === "assistant") {
      for (const b of msg.content) {
        if (b.type === "thinking" && b.text) steps.push({ _id: nextId(), type: "thinking", text: b.text });
        else if (b.type === "text" && b.text) steps.push({ _id: nextId(), type: "text", text: b.text });
        else if (b.type === "tool_use") {
          const step = newToolStep(nextId(), b.name, b.input);
          toolByUseId.set(b.id, step);
          steps.push(step);
        }
      }
      continue;
    }
    // role === "tool": attach each result to its matching tool/skill step.
    for (const b of msg.content) {
      if (b.type !== "tool_result") continue;
      const step = toolByUseId.get(b.toolUseId);
      if (!step) continue;
      if (step.type === "tool") { step.out = b.content; step.isError = b.isError; }
      else if (step.type === "skill") { step.output = stripSkillHeader(b.content); step.isError = b.isError; }
    }
  }
  return steps;
}

/** Map a tool_call to the right step subtype (read_file → read, skill → skill, else tool). */
function newToolStep(id: number, name: string, input: unknown): Step {
  const obj = isRecord(input) ? input : {};
  if (name === "read_file") {
    return { _id: id, type: "read", file: str(obj.path) || str(obj.file) || "(file)", lines: readRange(obj) };
  }
  if (name === "skill") {
    const skillName = str(obj.name) || "skill";
    return { _id: id, type: "skill", name: skillName, title: "", input: skillName };
  }
  return { _id: id, type: "tool", name, title: "", cmd: toolCmd(obj), out: "", isError: false };
}

function toolCmd(obj: Record<string, unknown>): string {
  return str(obj.command) || str(obj.code) || str(obj.cmd) || str(obj.query) || safeJson(obj);
}

function readRange(obj: Record<string, unknown>): string {
  const offset = Number(obj.offset);
  const limit = Number(obj.limit);
  if (Number.isFinite(offset) && Number.isFinite(limit)) return `${offset}-${offset + limit - 1}`;
  return str(obj.lines) || "";
}

/** The skill tool prefixes its body with "# Skill: <name>\n\n"; drop it for display. */
function stripSkillHeader(content: string): string {
  return content.replace(/^# Skill: .*\n\n?/, "");
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}
function safeJson(v: unknown): string {
  try { return JSON.stringify(v); } catch { return String(v); }
}
