/**
 * Phase 1 happy-path demo: model → tool → model → end.
 *
 * Run: `bun run dev`
 *
 * Wiring is the only thing that happens here — the engine, a mock model, a real
 * tool, and the stdout mode are composed. This composition root is the
 * "orchestration layer"; everything it touches is an interface.
 */

import { runLoop } from "./engine/index.ts";
import { MockModel } from "./providers/mock-model.ts";
import { ReadFileTool } from "./tools/read-file.ts";
import { runStdoutMode } from "./modes/stdout.ts";

const model = new MockModel(
  [
    // Turn 1: a little preamble, then call the tool.
    {
      text: "Sure — let me read package.json to see what this project is.\n",
      toolCalls: [{ name: "read_file", input: { path: "package.json" } }],
    },
    // Turn 2: react to the tool result, then finish.
    { text: "\nGot it. This is kurt-agent v0.1.0 — the Phase 1 minimal loop. Done!" },
  ],
  { chunkDelayMs: 8 },
);

const events = runLoop({
  system: "You are kurt-agent, a helpful coding agent.",
  messages: [
    { role: "user", content: [{ type: "text", text: "What is this project? Read package.json." }] },
  ],
  tools: [new ReadFileTool()],
  model,
});

await runStdoutMode(events);
process.stdout.write("\n");
