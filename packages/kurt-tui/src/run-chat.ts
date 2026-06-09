/**
 * runChat — a plain stdout REPL/one-shot against the same agent runtime as the
 * TUI (shares config + tools). `kurt chat` or `kurt chat "prompt"`.
 */

import { runLoop, runStdoutMode, messagesFromEvents, SessionWorkspace, type Event, type Message } from "kurt-agent";
import { resolveConfig, makeSandbox, makeTools, modelFor, SYSTEM } from "./agent.ts";

export async function runChat(args: string[]): Promise<void> {
  const cfg = await resolveConfig();
  if (!cfg.apiKey) {
    console.error("Missing API key. Set DEEPSEEK_API_KEY, then run `kurt chat`.");
    process.exit(1);
  }

  const sandbox = makeSandbox();
  const workspace = new SessionWorkspace({ sessionId: "chat" });
  const tools = makeTools(sandbox, workspace);
  const model = modelFor(cfg.modelId, cfg.baseURL, cfg.apiKey);
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
    await runStdoutMode(tee(runLoop({ system: SYSTEM, messages, tools, model })));
    const appended = messagesFromEvents(captured);
    if (appended.length > 0) messages.push(...appended);
    else messages.pop();
  }

  console.log(`kurt · ${model.name}/${cfg.modelId}`);
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
    workspace.dispose();
  }
}
