/**
 * chat — a live test harness: talk to a real LLM (DeepSeek by default) with the
 * full set of sandboxed tools wired in.
 *
 * This is an orchestration-layer composition root (the engine knows none of it).
 *
 * Setup (you provide the key — it stays in your env, never in the engine):
 *   export DEEPSEEK_API_KEY=sk-...           # required
 *   export DEEPSEEK_BASE_URL=https://api.deepseek.com   # optional (default)
 *   export DEEPSEEK_MODEL=deepseek-v4-flash             # optional (default)
 *
 * Run:
 *   bun run chat                 # interactive REPL (type, watch it use tools)
 *   bun run chat "your prompt"   # one-shot
 */

import { runLoop } from "./engine/index.ts";
import type { Event, Message } from "./engine/index.ts";
import { OpenAICompatModel } from "./providers/index.ts";
import { runStdoutMode } from "./modes/stdout.ts";
import { messagesFromEvents } from "./modes/history.ts";
import { SeatbeltSandbox, DirectSandbox } from "./sandbox/index.ts";
import { SessionWorkspace } from "./session/index.ts";
import { ReadFileTool, WriteFileTool, ShellTool, CodeTool, WebSearchTool } from "./tools/index.ts";
import { DuckDuckGoSearch } from "./search/index.ts";

const apiKey = process.env.DEEPSEEK_API_KEY ?? process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.error(
    "Missing API key. Set it first, then re-run:\n\n" +
      "  export DEEPSEEK_API_KEY=sk-your-key\n" +
      "  bun run chat\n\n" +
      "Optional: DEEPSEEK_BASE_URL (default https://api.deepseek.com), " +
      "DEEPSEEK_MODEL (default deepseek-v4-flash).",
  );
  process.exit(1);
}

const baseURL = process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com";
const modelId = process.env.DEEPSEEK_MODEL ?? "deepseek-v4-flash";

const model = new OpenAICompatModel({ name: "deepseek", baseURL, model: modelId, apiKey });

const sandbox = process.platform === "darwin" ? new SeatbeltSandbox() : new DirectSandbox();
const workspace = new SessionWorkspace({ sessionId: "chat" });

const tools = [
  new ReadFileTool(),
  new WriteFileTool({ roots: [workspace.root] }),
  new ShellTool(sandbox, { cwd: process.cwd(), writablePaths: [workspace.root] }),
  new CodeTool(sandbox, workspace),
  new WebSearchTool(new DuckDuckGoSearch()),
];

const SYSTEM = [
  "You are kurt-agent, a concise coding assistant running locally.",
  "You have tools: read_file, write_file, shell, run_code, web_search.",
  "shell and run_code are sandboxed: the filesystem is read-only except a private",
  "temp workspace, and they have no network. web_search is the only networked tool.",
  "Prefer doing real work with the tools over guessing. Keep answers short.",
].join(" ");

const messages: Message[] = [];
let active: AbortController | null = null;

process.on("SIGINT", () => {
  if (active) {
    active.abort();
    active = null;
  } else {
    cleanup();
    process.exit(0);
  }
});

function cleanup(): void {
  workspace.dispose();
}

async function runTurn(userText: string): Promise<void> {
  messages.push({ role: "user", content: [{ type: "text", text: userText }] });

  active = new AbortController();
  const captured: Event[] = [];
  const tee = async function* (src: AsyncIterable<Event>): AsyncIterable<Event> {
    for await (const e of src) {
      captured.push(e);
      yield e;
    }
  };

  await runStdoutMode(tee(runLoop({ system: SYSTEM, messages, tools, model, signal: active.signal })));
  active = null;

  // Rebuild what the engine appended internally, from the event stream alone,
  // so multi-turn history continues without touching the engine.
  const appended = messagesFromEvents(captured);
  if (appended.length === 0) {
    messages.pop(); // the model never replied (error/abort) — drop the dangling user turn
  } else {
    messages.push(...appended);
  }
}

// ── Entry: one-shot if a prompt is passed, else interactive REPL. ──
const oneShot = process.argv.slice(2).join(" ").trim();

console.log(`kurt-agent · ${model.name}/${modelId} · ${sandbox.name} sandbox`);

try {
  if (oneShot.length > 0) {
    await runTurn(oneShot);
    console.log();
  } else {
    console.log('Type a message. "exit" or Ctrl-D to quit.\n');
    while (true) {
      const input = prompt("\x1b[1myou>\x1b[0m ");
      if (input === null) break; // Ctrl-D / EOF
      const text = input.trim();
      if (text.length === 0) continue;
      if (text === "exit" || text === "quit") break;
      await runTurn(text);
    }
  }
} finally {
  cleanup();
}
