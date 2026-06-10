/**
 * AskUserTool — lets the agent proactively ask the user a clarifying question
 * (a multiple-choice ABCD prompt, or free-form). Routes through an injected
 * AskProvider; the front-end renders the prompt and returns the answer.
 */

import type { Tool, ToolContext, ToolResult, ToolSpec } from "../engine/index.ts";
import type { AskProvider } from "../ask/index.ts";

export class AskUserTool implements Tool {
  readonly spec: ToolSpec = {
    name: "ask_user",
    description:
      "Ask the user a clarifying question when the request is ambiguous or a choice " +
      "is genuinely theirs to make. Provide concise `options` for a multiple-choice " +
      "question (the user picks one), or omit them for a free-form answer. The user " +
      "may always type a free-form answer instead of picking. Returns their answer. " +
      "Use sparingly — only when you can't reasonably proceed without it.",
    inputSchema: {
      type: "object",
      properties: {
        question: { type: "string", description: "The question to put to the user." },
        options: {
          type: "array",
          items: { type: "string" },
          description: "Optional choices, shown as A/B/C/…",
        },
      },
      required: ["question"],
    },
  };

  #provider: AskProvider | undefined;

  constructor(provider?: AskProvider) {
    this.#provider = provider;
  }

  async execute(input: unknown, ctx: ToolContext): Promise<ToolResult> {
    const { question, options } = (input ?? {}) as { question?: unknown; options?: unknown };
    if (typeof question !== "string" || question.trim().length === 0) {
      return { content: 'Invalid input: "question" must be a non-empty string.', isError: true };
    }
    if (!this.#provider) {
      return { content: "No interactive user available to answer right now.", isError: true };
    }
    const opts = Array.isArray(options)
      ? options.filter((o): o is string => typeof o === "string" && o.length > 0)
      : undefined;

    const answer = (await this.#provider.ask({ question, options: opts }, ctx.signal)).trim();
    return { content: answer.length > 0 ? `User answered: ${answer}` : "User did not answer (skipped)." };
  }
}
