/**
 * Tool-error demo: the model reads a missing file, gets an error result, then
 * recovers and finishes.
 *
 * Run: `bun run demo:error`
 *
 * Expected: a red `← error:` tool_result, and the loop continues to a normal
 * end_turn — proving a failing tool never crashes the engine.
 */

import { runLoop } from "../engine/index.ts";
import { MockModel } from "../providers/mock-model.ts";
import { ReadFileTool } from "../tools/read-file.ts";
import { runStdoutMode } from "../modes/stdout.ts";

const model = new MockModel([
  {
    text: "Let me open that file.\n",
    toolCalls: [{ name: "read_file", input: { path: "does-not-exist.txt" } }],
  },
  { text: "\nThat file doesn't exist, so I can't read it — but I recovered fine. Done." },
]);

const events = runLoop({
  system: "You are kurt-agent.",
  messages: [{ role: "user", content: [{ type: "text", text: "Read does-not-exist.txt" }] }],
  tools: [new ReadFileTool()],
  model,
});

await runStdoutMode(events);
process.stdout.write("\n");
