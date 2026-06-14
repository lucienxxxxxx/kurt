/**
 * runChat — a plain stdout REPL/one-shot against the same agent runtime as the
 * TUI (shares config + tools). `kurt chat` or `kurt chat "prompt"`.
 */

import {
  runLoop,
  runStdoutMode,
  messagesFromEvents,
  autoCompaction,
  serializeForSummary,
  SessionWorkspace,
  ToolHub,
  type AskProvider,
  type Event,
  type Message,
  type PermissionProvider,
} from "kurt-agent";
import { resolveConfig, makeSandbox, makeTools, maybeWorktree, modelFor, resolveWorkspace, systemPrompt, toolsForMode, type LaunchOptions } from "./agent.ts";
import { loadContextPrelude } from "./context-files.ts";
import { Allowlist } from "./allowlist.ts";

/** stdin-prompt for the agent's ask_user tool (pick a letter or type an answer). */
function cliAsk(): AskProvider {
  return {
    async ask(req) {
      process.stdout.write(`\n❓ ${req.question}\n`);
      req.options?.forEach((o, i) => process.stdout.write(`  ${String.fromCharCode(65 + i)}. ${o}\n`));
      const raw = (prompt(req.options?.length ? "  pick a letter or type an answer: " : "  your answer: ") ?? "").trim();
      if (!raw) return "";
      if (req.options?.length && raw.length === 1) {
        const idx = raw.toUpperCase().charCodeAt(0) - 65;
        if (idx >= 0 && idx < req.options.length) return req.options[idx]!;
      }
      return raw;
    },
  };
}

/** stdin-prompt approval for the stdout chat; --yes auto-allows. */
function cliPermission(allowlist: Allowlist, yes: boolean): PermissionProvider {
  return {
    async request(req) {
      if (yes || allowlist.has(req.key)) return "allow";
      process.stdout.write(
        `\n⚠ Permission needed — ${req.title}\n  $ ${req.command}\n  ${req.explanation}\n  risk: ${req.risk}\n`,
      );
      const ans = (prompt("  allow? [y]es / [a]lways / [N]o:") ?? "").trim().toLowerCase();
      if (ans === "a") {
        await allowlist.add(req.key);
        return "allow";
      }
      return ans === "y" ? "allow" : "deny";
    },
  };
}

export async function runChat(args: string[], opts: LaunchOptions = {}): Promise<void> {
  const cfg = await resolveConfig();
  if (!cfg.apiKey) {
    console.error("Missing API key. Set DEEPSEEK_API_KEY, then run `kurt chat`.");
    process.exit(1);
  }

  const worktree = await maybeWorktree(opts); // --worktree: isolate in a git worktree (throws if not a repo)
  const ws = resolveWorkspace(worktree ? worktree.root : opts.workspacePath);
  if (worktree) console.log(`(worktree: isolated on branch ${worktree.branch})`);
  const permission = cliPermission(await Allowlist.load(ws.root), opts.yes ?? false);
  const sandbox = makeSandbox();
  const codeTemp = new SessionWorkspace({ sessionId: "chat" });
  const hub = new ToolHub(makeTools(sandbox, codeTemp, ws, opts.allowWrite ?? [], permission, cliAsk()));
  const tools = toolsForMode(hub, cfg.mode); // chat/agent/plan tool subset
  const model = modelFor(cfg.modelId, cfg.baseURL, cfg.apiKey, cfg.maxTokens, {
    thinking: cfg.thinking,
    effort: cfg.effort,
  });
  const system = systemPrompt(ws, cfg.mode) + (await loadContextPrelude(ws.root));
  const messages: Message[] = [];

  // Auto-compaction at ~75% of the context limit (same as the TUI).
  const compaction = autoCompaction({
    thresholdTokens: Math.round(cfg.contextLimit * 0.75),
    summarize: async (older, signal) => {
      let text = "";
      for await (const ev of model.stream(
        {
          system: "You compress conversations faithfully.",
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: "Summarize this transcript concisely, preserving key facts, decisions, paths, and open tasks:\n\n" + serializeForSummary(older),
                },
              ],
            },
          ],
          tools: [],
        },
        signal,
      )) {
        if (ev.type === "text_delta") text += ev.text;
      }
      return text.trim() || "(summary unavailable)";
    },
  });

  async function turn(text: string): Promise<void> {
    messages.push({ role: "user", content: [{ type: "text", text }] });
    const captured: Event[] = [];
    const tee = async function* (src: AsyncIterable<Event>): AsyncIterable<Event> {
      for await (const e of src) {
        captured.push(e);
        yield e;
      }
    };
    await runStdoutMode(tee(runLoop({ system, messages, tools, model, compaction })));
    const appended = messagesFromEvents(captured);
    if (appended.length > 0) messages.push(...appended);
    else messages.pop();
  }

  console.log(`kurt · ${model.name}/${cfg.modelId} · ws ${ws.root}`);
  const oneShot = args.join(" ").trim();
  try {
    if (oneShot.length > 0) {
      await turn(oneShot);
      console.log();
    } else {
      console.log('Type a message. "exit" or Ctrl-D to quit.\n');
      while (true) {
        const input = prompt("\x1b[1myou>\x1b[0m ");
        if (input === null) break;
        const text = input.trim();
        if (text.length === 0) continue;
        if (text === "exit" || text === "quit") break;
        await turn(text);
      }
    }
  } finally {
    codeTemp.dispose();
    if (worktree) console.log(`\n${await worktree.finish()}`);
  }
}
