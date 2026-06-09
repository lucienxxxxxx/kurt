/**
 * runChat — a plain stdout REPL/one-shot against the same agent runtime as the
 * TUI (shares config + tools). `kurt chat` or `kurt chat "prompt"`.
 */

import {
  runLoop,
  runStdoutMode,
  messagesFromEvents,
  SessionWorkspace,
  type Event,
  type Message,
  type PermissionProvider,
} from "kurt-agent";
import { resolveConfig, makeSandbox, makeTools, modelFor, resolveWorkspace, systemPrompt, type LaunchOptions } from "./agent.ts";
import { Allowlist } from "./allowlist.ts";

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

  const ws = resolveWorkspace(opts.workspacePath);
  const permission = cliPermission(await Allowlist.load(ws.root), opts.yes ?? false);
  const sandbox = makeSandbox();
  const codeTemp = new SessionWorkspace({ sessionId: "chat" });
  const tools = makeTools(sandbox, codeTemp, ws, opts.allowWrite ?? [], permission);
  const model = modelFor(cfg.modelId, cfg.baseURL, cfg.apiKey);
  const system = systemPrompt(ws);
  const messages: Message[] = [];

  async function turn(text: string): Promise<void> {
    messages.push({ role: "user", content: [{ type: "text", text }] });
    const captured: Event[] = [];
    const tee = async function* (src: AsyncIterable<Event>): AsyncIterable<Event> {
      for await (const e of src) {
        captured.push(e);
        yield e;
      }
    };
    await runStdoutMode(tee(runLoop({ system, messages, tools, model })));
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
  }
}
