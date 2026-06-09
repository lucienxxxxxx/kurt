/**
 * Phase 2 acceptance — real tools work end-to-end, and swapping a tool's
 * SandboxProvider (Seatbelt ↔ Direct) requires ZERO change to the engine/modes:
 * the same `runLoop` drives both. Also covers write-path confinement, code
 * execution + cleanup, and the mockable search backend.
 */

import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runLoop } from "../engine/index.ts";
import type { Event } from "../engine/index.ts";
import { MockModel } from "../providers/mock-model.ts";
import { DirectSandbox, SeatbeltSandbox } from "../sandbox/index.ts";
import type { SandboxProvider } from "../sandbox/index.ts";
import { SessionWorkspace } from "../session/index.ts";
import type { SearchProvider, SearchResult } from "../search/index.ts";
import { ShellTool } from "./shell.ts";
import { CodeTool } from "./code.ts";
import { WriteFileTool } from "./write-file.ts";
import { WebSearchTool } from "./web-search.ts";

const onDarwin = process.platform === "darwin" && existsSync("/usr/bin/sandbox-exec");

async function collect(events: AsyncIterable<Event>): Promise<Event[]> {
  const out: Event[] = [];
  for await (const e of events) out.push(e);
  return out;
}

function toolResultOf(events: Event[]): { content: string; isError: boolean } {
  const r = events.find((e) => e.type === "tool_result");
  if (!r || r.type !== "tool_result") throw new Error("no tool_result emitted");
  return { content: r.content, isError: r.isError };
}

describe("SessionWorkspace", () => {
  test("creates a private dir and removes it on dispose", () => {
    const ws = new SessionWorkspace();
    expect(existsSync(ws.root)).toBe(true);
    const sub = ws.dir("code");
    expect(existsSync(sub)).toBe(true);
    ws.dispose();
    expect(existsSync(ws.root)).toBe(false);
    expect(ws.disposed).toBe(true);
    ws.dispose(); // idempotent
  });
});

describe("WriteFileTool", () => {
  test("writes inside an allowed root", async () => {
    const root = mkdtempSync(join(tmpdir(), "kurt-wf-"));
    try {
      const tool = new WriteFileTool({ roots: [root] });
      const res = await tool.execute({ path: "sub/hello.txt", content: "hi" }, ctx());
      expect(res.isError).toBeFalsy();
      expect(existsSync(join(root, "sub/hello.txt"))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("refuses to write outside the allowed root", async () => {
    const root = mkdtempSync(join(tmpdir(), "kurt-wf-"));
    try {
      const tool = new WriteFileTool({ roots: [root] });
      const res = await tool.execute({ path: "../escape.txt", content: "x" }, ctx());
      expect(res.isError).toBe(true);
      expect(res.content).toContain("outside the allowed roots");
      expect(existsSync(join(root, "../escape.txt"))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("CodeTool", () => {
  test("runs a snippet and cleans up the script", async () => {
    const ws = new SessionWorkspace();
    try {
      const tool = new CodeTool(new DirectSandbox(), ws);
      const res = await tool.execute({ language: "bash", code: "echo from-code" }, ctx());
      expect(res.isError).toBeFalsy();
      expect(res.content).toContain("from-code");
      // The script file was deleted after running.
      expect(readdirSync(ws.dir("code"))).toHaveLength(0);
    } finally {
      ws.dispose();
    }
  });

  test("rejects an unsupported language", async () => {
    const ws = new SessionWorkspace();
    try {
      const res = await new CodeTool(new DirectSandbox(), ws).execute(
        { language: "brainfuck", code: "+" },
        ctx(),
      );
      expect(res.isError).toBe(true);
      expect(res.content).toContain("Unsupported language");
    } finally {
      ws.dispose();
    }
  });
});

describe("WebSearchTool", () => {
  test("formats results from an injected provider (mocked)", async () => {
    const mock: SearchProvider = {
      name: "mock",
      async search(): Promise<SearchResult[]> {
        return [{ title: "Bun", url: "https://bun.sh", snippet: "Fast JS runtime" }];
      },
    };
    const res = await new WebSearchTool(mock).execute({ query: "bun" }, ctx());
    expect(res.isError).toBeFalsy();
    expect(res.content).toContain("https://bun.sh");
    expect(res.content).toContain("via mock");
  });
});

// ── The headline criterion: same engine, swapped sandbox implementation. ──
function shellLoop(sandbox: SandboxProvider) {
  const model = new MockModel([
    { toolCalls: [{ name: "shell", input: { command: "echo loop-shell-ok | tr a-z A-Z" } }] },
    { text: "done" },
  ]);
  return runLoop({
    system: "s",
    messages: [{ role: "user", content: [{ type: "text", text: "run it" }] }],
    tools: [new ShellTool(sandbox)],
    model,
  });
}

describe("ShellTool through the engine — implementation swap is transparent", () => {
  test("works with DirectSandbox", async () => {
    const events = await collect(shellLoop(new DirectSandbox()));
    const res = toolResultOf(events);
    expect(res.isError).toBe(false);
    expect(res.content).toContain("LOOP-SHELL-OK");
    // pairing invariant still holds with real tools
    const calls = events.filter((e) => e.type === "tool_call").length;
    const results = events.filter((e) => e.type === "tool_result").length;
    expect(calls).toBe(results);
  });

  test.skipIf(!onDarwin)("works identically with SeatbeltSandbox", async () => {
    const events = await collect(shellLoop(new SeatbeltSandbox()));
    const res = toolResultOf(events);
    expect(res.isError).toBe(false);
    expect(res.content).toContain("LOOP-SHELL-OK");
  });
});

describe("ShellTool env option", () => {
  test("injects env vars into the command (e.g. WORKSPACE_DIR)", async () => {
    const tool = new ShellTool(new DirectSandbox(), { env: { WORKSPACE_DIR: "/tmp/ws-xyz" } });
    const res = await tool.execute({ command: "echo $WORKSPACE_DIR" }, ctx());
    expect(res.content).toContain("/tmp/ws-xyz");
  });
});

function ctx() {
  return { signal: new AbortController().signal, emit: () => {} };
}
