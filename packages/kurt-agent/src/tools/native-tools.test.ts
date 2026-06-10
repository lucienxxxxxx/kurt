/**
 * Offline tests for the pure-fs native tools (read/ls/grep) + brew gating +
 * the serialized write queue. No network, no real brew.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PermissionDecision, PermissionRequest } from "../permission/types.ts";
import type { SandboxExecOptions, SandboxProvider, SandboxResult } from "../sandbox/types.ts";
import { ReadFileTool } from "./read-file.ts";
import { WriteFileTool } from "./write-file.ts";
import { LsTool } from "./ls.ts";
import { GrepTool } from "./grep.ts";
import { BrewTool } from "./brew.ts";

let ws: string;
beforeEach(() => {
  ws = mkdtempSync(join(tmpdir(), "kurt-tools-"));
});
afterEach(() => rmSync(ws, { recursive: true, force: true }));

function ctx() {
  return { signal: new AbortController().signal, toolCallId: "t", emit: () => {} };
}

describe("ReadFileTool (confined + ranges)", () => {
  test("reads a file inside the workspace; offset/limit page through it", async () => {
    writeFileSync(join(ws, "f.txt"), "l1\nl2\nl3\nl4\nl5");
    const tool = new ReadFileTool({ roots: [ws] });
    expect((await tool.execute({ path: "f.txt" }, ctx())).content).toContain("l1");
    const ranged = await tool.execute({ path: "f.txt", offset: 2, limit: 2 }, ctx());
    expect(ranged.content).toContain("l2\nl3");
    expect(ranged.content).not.toContain("l5");
    expect(ranged.content).toContain("lines 2-3 of 5");
  });

  test("refuses paths outside the workspace", async () => {
    const tool = new ReadFileTool({ roots: [ws] });
    const res = await tool.execute({ path: "/etc/hosts" }, ctx());
    expect(res.isError).toBe(true);
    expect(res.content).toContain("outside the workspace");
  });
});

describe("LsTool", () => {
  test("lists entries (dirs first), hides dotfiles unless all:true", async () => {
    mkdirSync(join(ws, "sub"));
    writeFileSync(join(ws, "a.txt"), "hi");
    writeFileSync(join(ws, ".secret"), "x");
    const tool = new LsTool({ roots: [ws] });
    const plain = await tool.execute({ path: "." }, ctx());
    expect(plain.content).toContain("sub/");
    expect(plain.content).toContain("a.txt");
    expect(plain.content).not.toContain(".secret");
    expect((await tool.execute({ path: ".", all: true }, ctx())).content).toContain(".secret");
  });

  test("refuses listing outside the workspace", async () => {
    const res = await new LsTool({ roots: [ws] }).execute({ path: "/" }, ctx());
    expect(res.isError).toBe(true);
  });
});

describe("GrepTool", () => {
  test("finds matching lines and skips node_modules", async () => {
    writeFileSync(join(ws, "code.ts"), "const TODO = 1;\nconst ok = 2;\n");
    mkdirSync(join(ws, "node_modules"));
    writeFileSync(join(ws, "node_modules", "dep.ts"), "TODO in dep");
    const res = await new GrepTool({ roots: [ws] }).execute({ pattern: "TODO" }, ctx());
    expect(res.content).toContain("code.ts:1:");
    expect(res.content).not.toContain("dep.ts");
  });

  test("reports no matches cleanly and confines the path", async () => {
    writeFileSync(join(ws, "x.txt"), "nothing here");
    expect((await new GrepTool({ roots: [ws] }).execute({ pattern: "zzz" }, ctx())).content).toContain("No matches");
    const outside = await new GrepTool({ roots: [ws] }).execute({ pattern: "x", path: "/etc" }, ctx());
    expect(outside.isError).toBe(true);
  });
});

describe("BrewTool gating", () => {
  // A fake unconfined runner that records the argv instead of running brew.
  function fakeRunner(): { runner: SandboxProvider; calls: string[][] } {
    const calls: string[][] = [];
    const runner: SandboxProvider = {
      name: "fake",
      async exec(opts: SandboxExecOptions): Promise<SandboxResult> {
        calls.push(opts.cmd);
        return { stdout: "ok", stderr: "", exitCode: 0, timedOut: false, truncated: false };
      },
    };
    return { runner, calls };
  }
  const denier = { async request(_r: PermissionRequest): Promise<PermissionDecision> { return "deny"; } };
  const allower = { async request(_r: PermissionRequest): Promise<PermissionDecision> { return "allow"; } };

  test("mutating subcommand is gated — deny means it never runs", async () => {
    const { runner, calls } = fakeRunner();
    const tool = new BrewTool(runner, { permission: denier, brewPath: "/opt/brew" });
    const res = await tool.execute({ args: "install jq" }, ctx());
    expect(res.isError).toBe(true);
    expect(res.content).toContain("Denied");
    expect(calls).toHaveLength(0);
  });

  test("read-only subcommand runs without asking", async () => {
    const { runner, calls } = fakeRunner();
    const tool = new BrewTool(runner, { permission: denier, brewPath: "/opt/brew" });
    const res = await tool.execute({ args: "list" }, ctx());
    expect(res.isError).toBe(false);
    expect(calls[0]).toEqual(["/opt/brew", "list"]);
  });

  test("mutating subcommand runs when approved", async () => {
    const { runner, calls } = fakeRunner();
    const tool = new BrewTool(runner, { permission: allower, brewPath: "/opt/brew" });
    await tool.execute({ args: "install ripgrep" }, ctx());
    expect(calls[0]).toEqual(["/opt/brew", "install", "ripgrep"]);
  });

  test("reports a clear error when brew is missing", async () => {
    const { runner } = fakeRunner();
    const tool = new BrewTool(runner, { brewPath: "" });
    const res = await tool.execute({ args: "list" }, ctx());
    expect(res.isError).toBe(true);
    expect(res.content).toContain("not found");
  });
});

describe("WriteFileTool serialized queue", () => {
  test("concurrent writes all land with correct content", async () => {
    const tool = new WriteFileTool({ roots: [ws] });
    await Promise.all(
      Array.from({ length: 8 }, (_, i) => tool.execute({ path: `f${i}.txt`, content: `body ${i}` }, ctx())),
    );
    for (let i = 0; i < 8; i++) {
      expect(await Bun.file(join(ws, `f${i}.txt`)).text()).toBe(`body ${i}`);
    }
  });
});
