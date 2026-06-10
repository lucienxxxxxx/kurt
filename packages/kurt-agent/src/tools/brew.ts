/**
 * BrewTool — run Homebrew (`brew …`) as a first-class tool instead of via bash.
 *
 * brew needs the network and writes to the Homebrew prefix, so it runs through an
 * UNCONFINED runner (a DirectSandbox), NOT the seatbelt sandbox. Because that
 * escapes isolation, every MUTATING subcommand (install/upgrade/uninstall/…) is
 * gated through the PermissionProvider; read-only subcommands (list/info/search/…)
 * run without prompting.
 */

import type { Tool, ToolContext, ToolResult, ToolSpec } from "../engine/index.ts";
import type { SandboxProvider } from "../sandbox/index.ts";
import type { PermissionProvider } from "../permission/types.ts";

/** Subcommands that only read state — safe to run without approval. */
const READONLY = new Set([
  "list", "ls", "info", "abv", "search", "outdated", "config", "home", "homepage",
  "deps", "uses", "leaves", "doctor", "dr", "desc", "tap-info", "which-formula",
  "--version", "-v", "--cache", "--prefix", "--repository", "--cellar", "commands", "help",
]);

export interface BrewToolOptions {
  cwd?: string;
  /** Gate mutating subcommands. If unset, they run ungated. */
  permission?: PermissionProvider;
  /** Absolute path to brew. Default: resolved from PATH. */
  brewPath?: string;
  timeoutMs?: number;
  idleTimeoutMs?: number;
  maxOutputBytes?: number;
}

export class BrewTool implements Tool {
  readonly spec: ToolSpec = {
    name: "brew",
    description:
      "Run a Homebrew command (macOS/Linux package manager), e.g. `list`, `info jq`, " +
      "`install ripgrep`. Runs OUTSIDE the sandbox (it needs network + system writes); " +
      "installing/upgrading/uninstalling asks the user for approval first. Read-only " +
      "subcommands (list/info/search/outdated/…) run directly.",
    inputSchema: {
      type: "object",
      properties: {
        args: { type: "string", description: 'Arguments after "brew", e.g. "install jq" or "list".' },
        timeout: { type: "number", description: "Optional max seconds (installs can be slow)." },
      },
      required: ["args"],
    },
  };

  #runner: SandboxProvider;
  #opts: BrewToolOptions;

  constructor(runner: SandboxProvider, opts: BrewToolOptions = {}) {
    this.#runner = runner;
    this.#opts = opts;
  }

  async execute(input: unknown, ctx: ToolContext): Promise<ToolResult> {
    const args = (input as { args?: unknown })?.args;
    if (typeof args !== "string" || args.trim().length === 0) {
      return { content: 'Invalid input: "args" must be a non-empty string (e.g. "install jq").', isError: true };
    }

    const brew = this.#opts.brewPath ?? Bun.which("brew");
    if (!brew) {
      return { content: "Homebrew (brew) not found on PATH. Install it from https://brew.sh first.", isError: true };
    }

    const argv = args.trim().split(/\s+/);
    const sub = (argv[0] ?? "").toLowerCase();
    const mutating = !READONLY.has(sub);

    if (mutating && this.#opts.permission) {
      const decision = await this.#opts.permission.request({
        key: "brew",
        title: `brew ${sub} — change installed software`,
        command: `brew ${args}`,
        explanation:
          "Installs/updates/removes software via Homebrew: downloads from the network, " +
          "runs formula scripts, and writes to the Homebrew prefix.",
        risk: "Changes system-wide software, outside the sandboxed workspace.",
      });
      if (decision === "deny") return { content: `Denied by user: brew ${sub} — not run.`, isError: true };
    }

    const timeoutSec = (input as { timeout?: unknown })?.timeout;
    const result = await this.#runner.exec(
      {
        cmd: [brew, ...argv],
        cwd: this.#opts.cwd ?? process.cwd(),
        policy: { writablePaths: [], allowNetwork: true }, // Direct runner ignores policy; brew needs both
        timeoutMs: typeof timeoutSec === "number" && timeoutSec > 0 ? timeoutSec * 1000 : this.#opts.timeoutMs,
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
      `$ brew ${args}`,
      `exit code: ${result.timedOut ? "timeout" : result.exitCode}`,
      result.stdout.length > 0 ? `--- stdout ---\n${result.stdout.trimEnd()}` : "--- stdout --- (empty)",
      result.stderr.length > 0 ? `--- stderr ---\n${result.stderr.trimEnd()}` : "",
      notes.join(" "),
    ]
      .filter((s) => s.length > 0)
      .join("\n");

    return { content: body, isError: result.timedOut || result.exitCode !== 0 };
  }
}
