/**
 * Abort demo: kick off a slow streamed turn, then abort() mid-stream.
 *
 * Run: `bun run demo:abort`
 *
 * Expected: text streams partway, then a clean `⚠ aborted` with no dangling
 * tool_call and no crash.
 */

import { runLoop } from "../engine/index.ts";
import { MockModel } from "../providers/mock-model.ts";
import { ReadFileTool } from "../tools/read-file.ts";
import { runStdoutMode } from "../modes/stdout.ts";

const model = new MockModel(
  [
    {
      text: "I will keep talking for a while so you can see the abort land mid-stream… ".repeat(6),
      toolCalls: [{ name: "read_file", input: { path: "package.json" } }],
    },
    { text: "This text should never appear because we abort first." },
  ],
  { chunkDelayMs: 30 },
);

const controller = new AbortController();
setTimeout(() => controller.abort(), 250);

const events = runLoop({
  system: "You are kurt-agent.",
  messages: [{ role: "user", content: [{ type: "text", text: "Say a lot." }] }],
  tools: [new ReadFileTool()],
  model,
  signal: controller.signal,
});

await runStdoutMode(events);
process.stdout.write("\n");
