/**
 * ShellTool — run a shell command line through an injected SandboxProvider.
 *
 * The description deliberately encourages chaining with pipes so the model does
 * more per call. The code layer enforces the hard limits the prompt cannot:
 * timeout and output truncation (防止挂死/刷屏). Which sandbox backs it
 * (Seatbelt / Direct / future docker) is the orchestration layer's choice — this
 * tool only knows the `SandboxProvider` interface.
 */

import type { Tool, ToolContext, ToolResult, ToolSpec } from "../engine/index.ts";
import type { SandboxProvider } from "../sandbox/index.ts";
import { classifyCommand } from "../permission/classify.ts";
import type { PermissionProvider } from "../permission/types.ts";
import { malformedArgsError } from "../tool-args.ts";

export interface ShellToolOptions {
  /** Working directory for commands. Default: process.cwd(). */
  cwd?: string;
  /** Dirs the command may write to. Default: none (read-only world). */
  writablePaths?: string[];
  /** Allow network access. Default: false. */
  /** Network access. A function is resolved at call time so a mid-session grant
   *  (request_access kind:"network") takes effect on the next command. */
  allowNetwork?: boolean | (() => boolean);
  /** Extra env vars for the command (e.g. WORKSPACE_DIR). */
  env?: Record<string, string>;
  /** Hard wall-clock cap (ms); a per-call `timeout` arg overrides it. */
  timeoutMs?: number;
  /** Idle cap (ms): killed if no output for this long. */
  idleTimeoutMs?: number;
  maxOutputBytes?: number;
  /** Absolute path to bash. Default: /bin/bash. */
  bashPath?: string;
  /** Gate sensitive commands (rm/sudo/…) for approval. If unset, no gating. */
  permission?: PermissionProvider;
  /** Override the tool name (default "shell"). Lets a second, host-shell instance coexist. */
  name?: string;
  /** Override the advertised description (default: the sandboxed-shell blurb). */
  description?: string;
  /**
   * Require approval for EVERY command (not just classified-risky ones). Use for an
   * unsandboxed "run on the host terminal" variant so each command is confirmed.
   * Without a `permission` provider the tool refuses to run.
   */
  requireApproval?: boolean;
}

const DEFAULT_SHELL_DESCRIPTION =
  "Run a bash command line and return its stdout, stderr, and exit code. " +
  "Prefer combining steps with pipes and && into a SINGLE call (e.g. " +
  "`grep -rl TODO src | head` or `cat a.txt | sort | uniq -c`) instead of " +
  "many calls. Commands run in a sandbox: writable only inside the workspace, " +
  "and network is disabled. To write outside the workspace, first call " +
  "request_write_access for that directory, then re-run.";

export class ShellTool implements Tool {
  readonly spec: ToolSpec;

  #sandbox: SandboxProvider;
  #opts: ShellToolOptions;

  constructor(sandbox: SandboxProvider, opts: ShellToolOptions = {}) {
    this.#sandbox = sandbox;
    this.#opts = opts;
    this.spec = {
      name: opts.name ?? "shell",
      description: opts.description ?? DEFAULT_SHELL_DESCRIPTION,
      inputSchema: {
        type: "object",
        properties: {
          command: { type: "string", description: "The bash command line to execute." },
          timeout: {
            type: "number",
            description: "Optional max seconds for a long command (e.g. installs/builds). Raises the hard cap.",
          },
        },
        required: ["command"],
      },
    };
  }

  async execute(input: unknown, ctx: ToolContext): Promise<ToolResult> {
    const badArgs = malformedArgsError(input);
    if (badArgs) return { content: badArgs, isError: true };
    const command = (input as { command?: unknown })?.command;
    if (typeof command !== "string" || command.trim().length === 0) {
      return { content: 'Invalid input: "command" must be a non-empty string.', isError: true };
    }

    // Approval. The unsandboxed "host" variant (requireApproval) confirms EVERY
    // command; the normal sandboxed shell only gates classified-risky ones.
    if (this.#opts.requireApproval) {
      if (!this.#opts.permission) {
        return { content: "No approver available — cannot run a command outside the sandbox.", isError: true };
      }
      const decision = await this.#opts.permission.request({
        key: `host_shell:${command}`,
        title: "run on host — OUTSIDE the sandbox",
        command,
        explanation: "Run this command directly on your machine with NO sandbox (full filesystem + network access).",
        risk: "Unrestricted: it can read/modify any file and reach the network. Approve only commands you trust.",
      });
      if (decision === "deny") {
        return { content: "Denied by user: command not run on the host.", isError: true };
      }
    } else {
      const risk = classifyCommand(command);
      if (risk && this.#opts.permission) {
        const decision = await this.#opts.permission.request({
          key: risk.key,
          title: risk.title,
          command,
          explanation: risk.explanation,
          risk: risk.risk,
        });
        if (decision === "deny") {
          return { content: `Denied by user: ${risk.title} — command not run.`, isError: true };
        }
      }
    }

    const timeoutSec = (input as { timeout?: unknown })?.timeout;
    const result = await this.#sandbox.exec(
      {
        cmd: [this.#opts.bashPath ?? "/bin/bash", "-c", command],
        cwd: this.#opts.cwd ?? process.cwd(),
        env: this.#opts.env,
        policy: {
          writablePaths: this.#opts.writablePaths ?? [],
          allowNetwork: typeof this.#opts.allowNetwork === "function" ? this.#opts.allowNetwork() : this.#opts.allowNetwork ?? false,
        },
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

    // When a command fails on a sandbox WRITE denial, the raw error ("Operation not
    // permitted" / "Read-only file system") doesn't tell the model what to do. Make
    // it actionable so it knows to request access rather than retry blindly.
    const writeDenied = result.exitCode !== 0 &&
      /operation not permitted|not permitted|read-only file system|permission denied|\bEPERM\b|\bEACCES\b|sandbox/i.test(result.stderr);
    if (writeDenied) {
      notes.push(
        "Note: the sandbox only allows writes inside the workspace (and the system temp dir). " +
        "If this failed because it wrote OUTSIDE the workspace, call request_write_access with that " +
        "directory, wait for approval, then retry.",
      );
    }

    const body = [
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
