/**
 * Agent — a configured unit of {model + system + tools (+ compaction)} with a
 * `run()` that drives the engine loop. A thin composition shell around `runLoop`
 * (铁律 #3: the engine is untouched; this just bundles construction params).
 *
 * Different Agents = different capabilities: the chat/agent/plan modes are three
 * Agents over a shared ToolHub, and Phase-7 sub-agents will be more of the same.
 */

import { runLoop } from "../engine/index.ts";
import type { CompactionPolicy, Event, Message, ModelProvider, Tool } from "../engine/index.ts";

export interface AgentOptions {
  model: ModelProvider;
  system: string;
  tools: Tool[];
  compaction?: CompactionPolicy;
  maxTurns?: number;
  /** Informational: the model's context window (for the orchestration layer/UI). */
  contextLimit?: number;
}

export class Agent {
  readonly model: ModelProvider;
  readonly system: string;
  readonly tools: Tool[];
  readonly contextLimit: number | undefined;
  #compaction: CompactionPolicy | undefined;
  #maxTurns: number | undefined;

  constructor(opts: AgentOptions) {
    this.model = opts.model;
    this.system = opts.system;
    this.tools = opts.tools;
    this.contextLimit = opts.contextLimit;
    this.#compaction = opts.compaction;
    this.#maxTurns = opts.maxTurns;
  }

  /** Drive one run to completion as an event stream (delegates to runLoop). */
  run(messages: Message[], signal?: AbortSignal): AsyncIterable<Event> {
    return runLoop({
      system: this.system,
      messages,
      tools: this.tools,
      model: this.model,
      compaction: this.#compaction,
      signal,
      maxTurns: this.#maxTurns,
    });
  }

  /** Derive a variant with a different toolset/system/model (e.g. per mode). */
  with(overrides: Partial<Pick<AgentOptions, "tools" | "system" | "model">>): Agent {
    return new Agent({
      model: overrides.model ?? this.model,
      system: overrides.system ?? this.system,
      tools: overrides.tools ?? this.tools,
      compaction: this.#compaction,
      maxTurns: this.#maxTurns,
      contextLimit: this.contextLimit,
    });
  }
}
