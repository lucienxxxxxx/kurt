/**
 * runTui — launch the Ink TUI. Natural-flow display (no alt-screen). Resolves
 * settings from persisted config + env, wires the engine + sandboxed tools, and
 * persists any in-app settings change back to ~/.kurt/config.json.
 */

import { render } from "ink";
import { runLoop, SessionWorkspace, type Event, type Message } from "kurt-agent";
import { compactHistory, serializeForSummary } from "kurt-agent";
import { App, bannerString, type Compactor, type EngineRunner, type SessionState } from "./tui/index.ts";
import { resolveConfig, makeSandbox, makeTools, modelFor, SYSTEM } from "./agent.ts";
import { saveConfig } from "./config.ts";

export async function runTui(): Promise<void> {
  if (!process.stdin.isTTY) {
    console.error("The TUI needs an interactive terminal. Run `kurt` directly, or use `kurt chat`.");
    process.exit(1);
  }

  const cfg = await resolveConfig();
  if (!cfg.apiKey) {
    console.error("Missing API key. Set it, then run `kurt`:\n\n  export DEEPSEEK_API_KEY=sk-your-key");
    process.exit(1);
  }

  const sandbox = makeSandbox();
  let workspace = new SessionWorkspace({ sessionId: "tui" });
  let tools = makeTools(sandbox, workspace);
  const newSession = (): void => {
    workspace.dispose();
    workspace = new SessionWorkspace({ sessionId: "tui" });
    tools = makeTools(sandbox, workspace);
  };

  const run: EngineRunner = (messages: Message[], signal: AbortSignal, session: SessionState): AsyncIterable<Event> =>
    runLoop({ system: SYSTEM, messages, tools, model: modelFor(session.modelId, cfg.baseURL, cfg.apiKey!), signal });

  const compact: Compactor = async (messages, signal) => {
    const model = modelFor(cfg.modelId, cfg.baseURL, cfg.apiKey!);
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

  const app = render(
    <App
      run={run}
      compact={compact}
      models={cfg.models}
      onNewSession={newSession}
      onConfigChange={(patch) => void saveConfig(patch)}
      config={{ model: cfg.modelId, contextLimit: cfg.contextLimit, effort: cfg.effort, thinking: cfg.thinking, mode: cfg.mode }}
    />,
  );

  try {
    await app.waitUntilExit();
  } finally {
    workspace.dispose();
  }
}
