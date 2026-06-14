#!/usr/bin/env bun
/**
 * kurt — the CLI entry. Dispatches subcommands:
 *   kurt                 launch the TUI (default)
 *   kurt chat [prompt]   stdout REPL / one-shot
 *   kurt config          show settings + path; `set <key> <value>` to change
 *   kurt help            usage
 */

import { runTui } from "./run-tui.tsx";
import { runChat } from "./run-chat.ts";
import { configPath, loadConfig, saveConfig, type PersistedConfig } from "./config.ts";
import { parseLaunchFlags } from "./agent.ts";

const USAGE = `kurt — terminal agent

Usage:
  kurt                      Launch the interactive TUI (default)
  kurt chat [prompt]        Plain stdout chat (REPL, or one-shot with a prompt)
  kurt config               Show saved settings and the config file path
  kurt config set <k> <v>   Set a setting (model | baseURL | context | effort | thinking | mode)
  kurt config path          Print the config file path
  kurt help                 Show this help

Options (for kurt / kurt chat):
  --workspace <path>        Working dir for the agent (default: current dir). Alias: --workplace
  --allow-write <path>      Extra writable dir beyond the workspace (repeatable)
  --yes, -y                 Auto-approve sensitive commands (skip approval prompts)
  --worktree                Isolate this session in its own git worktree + branch
                            (requires a git repo; commits to kurt/<id> on exit, never main)

The agent's working dir (WORKSPACE_DIR) is fully writable; the sandbox blocks
writes elsewhere unless --allow-write opens them (or the agent requests access).
Sensitive commands (rm/sudo/…) still ask for approval — independent of file
writes; "always allow" is remembered in <workspace>/.kurt/allowlist.json.

Env: DEEPSEEK_API_KEY (required), DEEPSEEK_BASE_URL, DEEPSEEK_MODEL, DEEPSEEK_CONTEXT,
DEEPSEEK_MAX_TOKENS (raise for large outputs, e.g. writing big files).
Settings you change in the TUI (/model, /effort, /think, /mode) are remembered in
the config file below.`;

async function runConfig(args: string[]): Promise<void> {
  const [sub, key, ...rest] = args;
  if (sub === "path") {
    console.log(configPath());
    return;
  }
  if (sub === "set") {
    if (!key || rest.length === 0) {
      console.error("usage: kurt config set <key> <value>");
      process.exit(1);
    }
    const value = rest.join(" ");
    const patch = coerce(key, value);
    if (!patch) {
      console.error(`unknown key: ${key} (model | baseURL | context | effort | thinking | mode)`);
      process.exit(1);
    }
    await saveConfig(patch);
    console.log(`set ${key} = ${JSON.stringify((patch as Record<string, unknown>)[key])}`);
    return;
  }
  // default: show
  const cfg = await loadConfig();
  console.log(`config: ${configPath()}`);
  console.log(Object.keys(cfg).length ? JSON.stringify(cfg, null, 2) : "(empty — using defaults)");
}

function coerce(key: string, value: string): PersistedConfig | null {
  switch (key) {
    case "model":
    case "baseURL":
    case "effort":
      return { [key]: value };
    case "mode":
      return value === "chat" || value === "agent" || value === "plan" ? { mode: value } : null;
    case "context":
      return Number.isFinite(Number(value)) ? { context: Number(value) } : null;
    case "thinking":
      return { thinking: value === "on" || value === "true" || value === "1" };
    default:
      return null;
  }
}

const { options, positional } = parseLaunchFlags(process.argv.slice(2));
const [cmd, ...rest] = positional;
switch (cmd) {
  case undefined:
  case "tui":
    await runTui(options);
    break;
  case "chat":
    await runChat(rest, options);
    break;
  case "config":
    await runConfig(rest);
    break;
  case "help":
  case "-h":
  case "--help":
    console.log(USAGE);
    break;
  default:
    console.error(`unknown command: ${cmd}\n`);
    console.log(USAGE);
    process.exit(1);
}
