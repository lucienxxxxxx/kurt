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
import { RequestWriteAccessTool } from "./request-write.ts";
import { RequestAccessTool, type AccessGrants } from "./request-access.ts";
import { resolve } from "node:path";
import { MALFORMED_ARGS } from "../tool-args.ts";

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

describe("ShellTool sandbox write-denial hint", () => {
  test("a permission-denied failure tells the model to request_write_access", async () => {
    const fake: SandboxProvider = {
      name: "fake",
      async exec() {
        return { stdout: "", stderr: "tee: /etc/hosts: Operation not permitted", exitCode: 1, timedOut: false, truncated: false };
      },
    };
    const res = await new ShellTool(fake).execute({ command: "echo x >> /etc/hosts" }, ctx());
    expect(res.isError).toBe(true);
    expect(res.content).toContain("request_write_access");
  });

  test("an ordinary non-zero exit does NOT add the request_write_access hint", async () => {
    const fake: SandboxProvider = {
      name: "fake",
      async exec() {
        return { stdout: "", stderr: "grep: no match", exitCode: 1, timedOut: false, truncated: false };
      },
    };
    const res = await new ShellTool(fake).execute({ command: "grep zzz f" }, ctx());
    expect(res.content).not.toContain("request_write_access");
  });
});

describe("RequestWriteAccessTool", () => {
  test("approved request adds the dir to the shared writable roots; WriteFileTool then allows it", async () => {
    const extra = mkdtempSync(join(tmpdir(), "kurt-grant-"));
    try {
      const writable: string[] = []; // shared, mutable
      const writeFile = new WriteFileTool({ roots: writable });
      // Before grant: writing into `extra` is refused (not in roots).
      const before = await writeFile.execute({ path: join(extra, "a.txt"), content: "x" }, ctx());
      expect(before.isError).toBe(true);
      expect(before.content).toContain("request_write_access");

      const allow = { request: async () => "allow" as const };
      const req = new RequestWriteAccessTool(writable, allow);
      const grant = await req.execute({ directory: extra, reason: "save output" }, ctx());
      expect(grant.isError).toBeFalsy();
      expect(writable).toContain(extra);

      // After grant: the same WriteFileTool now allows it (roots read live).
      const after = await writeFile.execute({ path: join(extra, "a.txt"), content: "x" }, ctx());
      expect(after.isError).toBeFalsy();
    } finally {
      rmSync(extra, { recursive: true, force: true });
    }
  });

  test("denied request does not grant access", async () => {
    const writable: string[] = [];
    const deny = { request: async () => "deny" as const };
    const res = await new RequestWriteAccessTool(writable, deny).execute({ directory: "/tmp/kurt-x" }, ctx());
    expect(res.isError).toBe(true);
    expect(writable).toHaveLength(0);
  });
});

describe("RequestAccessTool (generalized capability requests)", () => {
  const allow = { request: async () => "allow" as const };
  const deny = { request: async () => "deny" as const };
  const fresh = (): AccessGrants => ({ network: false, open: false, dirs: [] });

  test("kind=network flips the session network grant", async () => {
    const grants = fresh();
    const res = await new RequestAccessTool([], grants, { permission: allow }).execute({ kind: "network" }, ctx());
    expect(res.isError).toBeFalsy();
    expect(grants.network).toBe(true);
  });

  test("kind=write adds to the live writable roots AND the session dirs", async () => {
    const extra = mkdtempSync(join(tmpdir(), "kurt-acc-"));
    try {
      const writable: string[] = [];
      const grants = fresh();
      await new RequestAccessTool(writable, grants, { permission: allow }).execute({ kind: "write", target: extra }, ctx());
      expect(writable).toContain(resolve(extra));
      expect(grants.dirs).toContain(resolve(extra));
    } finally {
      rmSync(extra, { recursive: true, force: true });
    }
  });

  test("kind=open invokes the injected opener with the target", async () => {
    let opened = "";
    const res = await new RequestAccessTool([], fresh(), { permission: allow, opener: async (t) => { opened = t; } })
      .execute({ kind: "open", target: "https://example.com" }, ctx());
    expect(res.isError).toBeFalsy();
    expect(opened).toBe("https://example.com");
  });

  test("denied request grants nothing", async () => {
    const grants = fresh();
    const res = await new RequestAccessTool([], grants, { permission: deny }).execute({ kind: "network" }, ctx());
    expect(res.isError).toBe(true);
    expect(grants.network).toBe(false);
  });

  test("legacy {directory} (no kind) is treated as a write request", async () => {
    const extra = mkdtempSync(join(tmpdir(), "kurt-acc-"));
    try {
      const writable: string[] = [];
      await new RequestAccessTool(writable, fresh(), { permission: allow }).execute({ directory: extra }, ctx());
      expect(writable).toContain(resolve(extra));
    } finally {
      rmSync(extra, { recursive: true, force: true });
    }
  });
});

describe("malformed tool args", () => {
  test("write_file turns truncated args into a clear, actionable error", async () => {
    const res = await new WriteFileTool({ roots: ["/tmp"] }).execute(
      { [MALFORMED_ARGS]: true, truncated: true, raw: '{"path":"a","content":"<<' },
      ctx(),
    );
    expect(res.isError).toBe(true);
    expect(res.content).toContain("not valid JSON");
    expect(res.content.toLowerCase()).toContain("token");
  });
});

describe("ShellTool permission gating", () => {
  test("denied sensitive command is not run", async () => {
    const marker = join(tmpdir(), `kurt-deny-${Date.now()}.txt`);
    const deny = { request: async () => "deny" as const };
    const tool = new ShellTool(new DirectSandbox(), { permission: deny });
    const res = await tool.execute({ command: `rm -f /nope && touch ${marker}` }, ctx());
    expect(res.isError).toBe(true);
    expect(res.content).toContain("Denied by user");
    expect(existsSync(marker)).toBe(false); // command never executed
  });

  test("allowed sensitive command runs", async () => {
    let asked = 0;
    const allow = {
      request: async () => {
        asked++;
        return "allow" as const;
      },
    };
    const res = await new ShellTool(new DirectSandbox(), { permission: allow }).execute(
      { command: "rm -f /tmp/kurt-nonexistent-xyz && echo ok" },
      ctx(),
    );
    expect(asked).toBe(1);
    expect(res.content).toContain("ok");
  });

  test("non-sensitive command is not gated (provider untouched)", async () => {
    const provider = {
      request: async () => {
        throw new Error("should not be asked for a safe command");
      },
    };
    const res = await new ShellTool(new DirectSandbox(), { permission: provider }).execute(
      { command: "echo safe" },
      ctx(),
    );
    expect(res.content).toContain("safe");
  });
});

function ctx() {
  return { signal: new AbortController().signal, toolCallId: "test-call", emit: () => {} };
}
