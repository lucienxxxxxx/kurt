/**
 * runTui — launch the Ink TUI. Natural-flow display (no alt-screen). Resolves
 * settings from persisted config + env, the working dir from launch options,
 * wires the engine + sandboxed tools, and persists in-app settings changes.
 */

import { render } from "ink";
import { runLoop, SessionWorkspace, type Event, type Message } from "kurt-agent";
import { compactHistory, serializeForSummary } from "kurt-agent";
import { App, bannerString, type Compactor, type EngineRunner, type SessionState } from "./tui/index.ts";
import { resolveConfig, makeSandbox, makeTools, modelFor, resolveWorkspace, systemPrompt, type LaunchOptions } from "./agent.ts";
import { saveConfig } from "./config.ts";
import { Allowlist } from "./allowlist.ts";
import { PermissionBridge } from "./tui/permission.ts";

export async function runTui(opts: LaunchOptions = {}): Promise<void> {
  if (!process.stdin.isTTY) {
    console.error("The TUI needs an interactive terminal. Run `kurt` directly, or use `kurt chat`.");
    process.exit(1);
  }

  const cfg = await resolveConfig();
  if (!cfg.apiKey) {
    console.error("Missing API key. Set it, then run `kurt`:\n\n  export DEEPSEEK_API_KEY=sk-your-key");
    process.exit(1);
  }

  const ws = resolveWorkspace(opts.workspacePath);
  const allowWrite = opts.allowWrite ?? [];
  const permission = new PermissionBridge(await Allowlist.load(ws.root));
  const sandbox = makeSandbox();
  let codeTemp = new SessionWorkspace({ sessionId: "tui" });
  let tools = makeTools(sandbox, codeTemp, ws, allowWrite, permission);
  const newSession = (): void => {
    codeTemp.dispose();
    codeTemp = new SessionWorkspace({ sessionId: "tui" });
    tools = makeTools(sandbox, codeTemp, ws, allowWrite, permission);
  };

  const system = systemPrompt(ws);
  const run: EngineRunner = (messages: Message[], signal: AbortSignal, session: SessionState): AsyncIterable<Event> =>
    runLoop({ system, messages, tools, model: modelFor(session.modelId, cfg.baseURL, cfg.apiKey!, cfg.maxTokens), signal });

  const compact: Compactor = async (messages, signal) => {
    const model = modelFor(cfg.modelId, cfg.baseURL, cfg.apiKey!, cfg.maxTokens);
    const summarize = async (older: Message[]): Promise<string> => {
      const prompt =
        "Summarize the following conversation transcript concisely. Preserve key facts, " +
        "decisions, file paths, code identifiers, and open tasks. No preamble.\n\n" +
        serializeForSummary(older);
      let text = "";
      for await (const ev of model.stream(
        { system: "You compress conversations faithfully.", messages: [{ role: "user", content: [{ type: "text", text: prompt }] }], tools: [] },
        signal,
      )) {
        if (ev.type === "text_delta") text += ev.text;
      }
      return text.trim() || "(summary unavailable)";
    };
    return compactHistory(messages, summarize, 2);
  };

  // Natural-flow: no alternate screen → native scrollback + mouse wheel work.
  process.stdout.write("\n" + bannerString(process.stdout.columns || 80) + "\n");
  process.stdout.write(`\x1b[2m  workspace: ${ws.root}${allowWrite.length ? `  (+write: ${allowWrite.join(", ")})` : ""}\x1b[0m\n`);

  const app = render(
    <App
      run={run}
      compact={compact}
      models={cfg.models}
      onNewSession={newSession}
      onConfigChange={(patch) => void saveConfig(patch)}
      permission={permission}
      config={{ model: cfg.modelId, contextLimit: cfg.contextLimit, effort: cfg.effort, thinking: cfg.thinking, mode: cfg.mode }}
    />,
  );

  try {
    await app.waitUntilExit();
  } finally {
    codeTemp.dispose();
  }
}
