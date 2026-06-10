/**
 * CodeTool — write a snippet to a file in the session workspace and run it
 * through the sandbox, then delete the script.
 *
 * Per the plan: temp scripts go to the session-private temp dir (which the
 * sandbox profile opens for writing), and are cleaned up — both per-run here and
 * wholesale when the SessionWorkspace is disposed at session end.
 */

import { rmSync } from "node:fs";
import { join } from "node:path";
import type { Tool, ToolContext, ToolResult, ToolSpec } from "../engine/index.ts";
import type { SandboxProvider } from "../sandbox/index.ts";
import type { SessionWorkspace } from "../session/index.ts";
import { malformedArgsError } from "../tool-args.ts";

interface LanguageSpec {
  /** File extension for the script. */
  ext: string;
  /** Build argv given the absolute interpreter path and script path. */
  argv: (interpreter: string, script: string) => string[];
  /** Interpreter names to resolve via PATH, first match wins. */
  candidates: string[];
}

const LANGUAGES: Record<string, LanguageSpec> = {
  python: { ext: "py", candidates: ["python3", "python"], argv: (i, s) => [i, s] },
  javascript: { ext: "js", candidates: ["node", "bun"], argv: (i, s) => [i, s] },
  typescript: { ext: "ts", candidates: ["bun"], argv: (i, s) => [i, "run", s] },
  bash: { ext: "sh", candidates: ["bash"], argv: (i, s) => [i, s] },
};

const ALIASES: Record<string, string> = {
  py: "python",
  python3: "python",
  js: "javascript",
  node: "javascript",
  ts: "typescript",
  sh: "bash",
  shell: "bash",
};

export interface CodeToolOptions {
  allowNetwork?: boolean;
  /** Extra writable dirs beyond the script temp (e.g. the agent's WORKSPACE_DIR). */
  writablePaths?: string[];
  /** Extra env vars for the script (e.g. WORKSPACE_DIR). */
  env?: Record<string, string>;
  timeoutMs?: number;
  idleTimeoutMs?: number;
  maxOutputBytes?: number;
}

export class CodeTool implements Tool {
  readonly spec: ToolSpec = {
    name: "run_code",
    description:
      "Execute a short program and return its output. Supported languages: " +
      `${Object.keys(LANGUAGES).join(", ")}. The script runs sandboxed in a ` +
      "private temp directory + the workspace (writable); the rest is read-only and " +
      "network is disabled. To write outside the workspace, first call request_write_access.",
    inputSchema: {
      type: "object",
      properties: {
        language: { type: "string", description: "One of: python, javascript, typescript, bash." },
        code: { type: "string", description: "The source code to run." },
      },
      required: ["language", "code"],
    },
  };

  #sandbox: SandboxProvider;
  #workspace: SessionWorkspace;
  #opts: CodeToolOptions;

  constructor(sandbox: SandboxProvider, workspace: SessionWorkspace, opts: CodeToolOptions = {}) {
    this.#sandbox = sandbox;
    this.#workspace = workspace;
    this.#opts = opts;
  }

  async execute(input: unknown, ctx: ToolContext): Promise<ToolResult> {
    const badArgs = malformedArgsError(input);
    if (badArgs) return { content: badArgs, isError: true };
    const { language, code } = (input ?? {}) as { language?: unknown; code?: unknown };
    if (typeof language !== "string") return { content: 'Invalid input: "language" required.', isError: true };
    if (typeof code !== "string" || code.length === 0) {
      return { content: 'Invalid input: "code" must be a non-empty string.', isError: true };
    }

    const key = ALIASES[language.toLowerCase()] ?? language.toLowerCase();
    const lang = LANGUAGES[key];
    if (!lang) {
      return { content: `Unsupported language: ${language}. Supported: ${Object.keys(LANGUAGES).join(", ")}.`, isError: true };
    }

    const interpreter = resolveInterpreter(lang.candidates);
    if (!interpreter) {
      return { content: `No interpreter found for ${key} (tried: ${lang.candidates.join(", ")}).`, isError: true };
    }

    const codeDir = this.#workspace.dir("code");
    const script = join(codeDir, `snippet-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${lang.ext}`);
    await Bun.write(script, code);

    try {
      const result = await this.#sandbox.exec(
        {
          cmd: lang.argv(interpreter, script),
          cwd: codeDir,
          env: this.#opts.env,
          policy: {
            writablePaths: [this.#workspace.root, ...(this.#opts.writablePaths ?? [])],
            allowNetwork: this.#opts.allowNetwork ?? false,
          },
          timeoutMs: this.#opts.timeoutMs,
          idleTimeoutMs: this.#opts.idleTimeoutMs,
          maxOutputBytes: this.#opts.maxOutputBytes,
          onOutput: (text) => ctx.emit({ type: "tool_output", id: ctx.toolCallId, text }),
        },
        ctx.signal,
      );

      const notes: string[] = [];
      if (result.timedOut)
        notes.push(result.timeoutReason === "idle" ? "(killed: no output — idle timeout)" : "(killed: max time exceeded)");
      if (result.truncated) notes.push("(output truncated)");

      const body = [
        `exit code: ${result.timedOut ? "timeout" : result.exitCode}`,
        result.stdout.length > 0 ? `--- stdout ---\n${result.stdout.trimEnd()}` : "--- stdout --- (empty)",
        result.stderr.length > 0 ? `--- stderr ---\n${result.stderr.trimEnd()}` : "",
        notes.join(" "),
      ]
        .filter((s) => s.length > 0)
        .join("\n");

      return { content: body, isError: result.timedOut || result.exitCode !== 0 };
    } finally {
      rmSync(script, { force: true });
    }
  }
}

function resolveInterpreter(candidates: string[]): string | null {
  for (const name of candidates) {
    const path = Bun.which(name);
    if (path) return path;
  }
  return null;
}
