/**
 * SkillTool — the on-demand half of progressive disclosure. The catalog (name +
 * description of every skill) is preloaded in the system prompt; when the model
 * decides a skill applies, it calls `skill({ name })` and this tool returns that
 * skill's full instructions as the tool result (context injection).
 *
 * It's a thin retrieval tool, not a side-effecting capability — read-only, no
 * approval. Backed by an injected SkillProvider (the front-end reads the files).
 */

import type { Tool, ToolContext, ToolResult, ToolSpec } from "../engine/index.ts";
import type { SkillProvider } from "../skills/index.ts";

export class SkillTool implements Tool {
  readonly spec: ToolSpec;
  #provider: SkillProvider;

  constructor(provider: SkillProvider) {
    this.#provider = provider;
    const names = provider.list().map((m) => m.name);
    this.spec = {
      name: "skill",
      description:
        "Load the full instructions for a named skill listed in the Skills catalog of your " +
        "system prompt, then follow them. Use when a task matches a skill's description.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "The skill name to load.", enum: names },
        },
        required: ["name"],
      },
    };
  }

  async execute(input: unknown, _ctx: ToolContext): Promise<ToolResult> {
    const name = (input as { name?: unknown })?.name;
    if (typeof name !== "string" || name.trim().length === 0) {
      return { content: 'Invalid input: "name" must be a non-empty string.', isError: true };
    }
    const body = await this.#provider.load(name.trim());
    if (body == null) {
      const avail = this.#provider.list().map((m) => m.name).join(", ") || "(none)";
      return { content: `Unknown skill "${name}". Available skills: ${avail}.`, isError: true };
    }
    return { content: `# Skill: ${name}\n\n${body}` };
  }
}
