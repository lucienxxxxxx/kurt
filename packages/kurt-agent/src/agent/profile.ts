/**
 * AgentProfile / AgentRuntime — a higher-level composition object over Agent.
 *
 * The engine remains the load-bearing loop; this layer names the agent persona,
 * allowed tools, memory context, and policies as one reusable profile.
 */

import { Agent } from "./agent.ts";
import type { ToolHub } from "./tool-hub.ts";
import type { CompactionPolicy, Event, Message, ModelProvider, Tool } from "../engine/index.ts";

export interface AgentMemoryBlock {
  /** Display/source label, e.g. "global memory" or "project memory". */
  title: string;
  /** Markdown/plain text memory content. Empty blocks are ignored. */
  content: string;
}

export interface AgentProfile {
  id?: string;
  name?: string;
  system: string;
  /** "all" or a named subset from ToolHub. If omitted, all supplied tools are used. */
  tools?: readonly string[] | "all";
  memory?: readonly AgentMemoryBlock[];
  compaction?: CompactionPolicy;
  maxTurns?: number;
  contextLimit?: number;
}

export interface AgentRuntimeOptions {
  model: ModelProvider;
  profile: AgentProfile;
  /** Use either a ToolHub plus profile.tools, or a concrete tool list. */
  hub?: ToolHub;
  tools?: readonly Tool[];
}

export class AgentRuntime {
  readonly model: ModelProvider;
  readonly profile: AgentProfile;
  #hub: ToolHub | undefined;
  #tools: readonly Tool[] | undefined;

  constructor(opts: AgentRuntimeOptions) {
    this.model = opts.model;
    this.profile = opts.profile;
    this.#hub = opts.hub;
    this.#tools = opts.tools;
  }

  agent(): Agent {
    return new Agent({
      model: this.model,
      system: renderProfileSystem(this.profile),
      tools: this.#resolveTools(),
      compaction: this.profile.compaction,
      maxTurns: this.profile.maxTurns,
      contextLimit: this.profile.contextLimit,
    });
  }

  run(messages: Message[], signal?: AbortSignal): AsyncIterable<Event> {
    return this.agent().run(messages, signal);
  }

  withProfile(profile: AgentProfile): AgentRuntime {
    return new AgentRuntime({ model: this.model, profile, hub: this.#hub, tools: this.#tools });
  }

  #resolveTools(): Tool[] {
    if (this.#hub) {
      const names = this.profile.tools;
      return !names || names === "all" ? this.#hub.all() : this.#hub.get(names);
    }
    if (!this.#tools) return [];
    if (!this.profile.tools || this.profile.tools === "all") return [...this.#tools];
    const byName = new Map(this.#tools.map((t) => [t.spec.name, t]));
    return this.profile.tools.flatMap((name) => {
      const tool = byName.get(name);
      return tool ? [tool] : [];
    });
  }
}

export function renderProfileSystem(profile: AgentProfile): string {
  const system = profile.system.trimEnd();
  const memory = (profile.memory ?? [])
    .map((m) => ({ title: m.title.trim(), content: m.content.trim() }))
    .filter((m) => m.content.length > 0);
  if (memory.length === 0) return system;
  const blocks = memory.map((m) => `## ${m.title || "memory"}\n${m.content}`).join("\n\n");
  return `${system}\n\n# Memory\n${blocks}`;
}
