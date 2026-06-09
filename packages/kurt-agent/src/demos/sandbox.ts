/**
 * Phase 2 demo: real tools through the Seatbelt sandbox.
 *
 * Run: `bun run demo:sandbox`
 *
 * Shows the composition root wiring a SessionWorkspace + SeatbeltSandbox into the
 * shell/code/write tools, then a scripted agent: run a pipeline, run code, write
 * a file (allowed), then attempt a blocked write (sandbox denies it). The session
 * temp dir is cleaned up at the end.
 */

import { runLoop } from "../engine/index.ts";
import { MockModel } from "../providers/mock-model.ts";
import { runStdoutMode } from "../modes/stdout.ts";
import { SeatbeltSandbox, DirectSandbox } from "../sandbox/index.ts";
import type { SandboxProvider } from "../sandbox/index.ts";
import { SessionWorkspace } from "../session/index.ts";
import { ShellTool, CodeTool, WriteFileTool } from "../tools/index.ts";

// Pick the sandbox by platform — note the rest of the file does not care which.
const sandbox: SandboxProvider =
  process.platform === "darwin" ? new SeatbeltSandbox() : new DirectSandbox();
console.log(`(using ${sandbox.name} sandbox)\n`);

const workspace = new SessionWorkspace({ sessionId: "demo" });

const tools = [
  // Shell can read the project, but may only write into the session workspace.
  new ShellTool(sandbox, { cwd: process.cwd(), writablePaths: [workspace.root] }),
  new CodeTool(sandbox, workspace),
  new WriteFileTool({ roots: [workspace.root] }),
];

const model = new MockModel(
  [
    { text: "First, a shell pipeline:\n", toolCalls: [{ name: "shell", input: { command: "ls src | sort | head -3" } }] },
    { text: "\nNow some Python:\n", toolCalls: [{ name: "run_code", input: { language: "python", code: "print(sum(range(10)))" } }] },
    { text: "\nWrite a file into the workspace:\n", toolCalls: [{ name: "write_file", input: { path: "note.txt", content: "hello from kurt-agent" } }] },
    { text: "\nTry to escape the sandbox (should be denied):\n", toolCalls: [{ name: "shell", input: { command: "echo pwned > /tmp/kurt_pwned.txt" } }] },
    { text: "\nAll done — note the blocked write above. The session temp dir will be cleaned up." },
  ],
  { chunkDelayMs: 4 },
);

try {
  const events = runLoop({
    system: "You are kurt-agent with real, sandboxed tools.",
    messages: [{ role: "user", content: [{ type: "text", text: "Demonstrate the sandboxed tools." }] }],
    tools,
    model,
  });
  await runStdoutMode(events);
} finally {
  workspace.dispose();
  console.log(`\n(workspace cleaned up: ${workspace.disposed})`);
}
