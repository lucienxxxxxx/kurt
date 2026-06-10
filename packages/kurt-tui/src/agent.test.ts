import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseLaunchFlags, resolveWorkspace, systemPrompt, workspaceEnv } from "./agent.ts";

describe("resolveWorkspace", () => {
  const root = join(tmpdir(), `kurt-ws-${process.pid}`);
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  test("resolves the working dir (creating it) and makes NO import/export subdirs", () => {
    const ws = resolveWorkspace(root);
    expect(ws.root).toBe(root);
    expect(existsSync(root)).toBe(true);
    expect(existsSync(join(root, "import"))).toBe(false);
    expect(existsSync(join(root, "export"))).toBe(false);
  });

  test("workspaceEnv exposes only WORKSPACE_DIR", () => {
    const ws = resolveWorkspace(root);
    expect(workspaceEnv(ws)).toEqual({ WORKSPACE_DIR: ws.root });
  });
});

describe("systemPrompt", () => {
  test("injects the writable working dir and the escalation rule", () => {
    const p = systemPrompt({ root: "/w" });
    expect(p).toContain("WORKSPACE_DIR = /w");
    expect(p).toContain("fully writable");
    expect(p).toContain("request_write_access");
    expect(p).not.toContain("IMPORT_DIR");
    expect(p).not.toContain("EXPORT_DIR");
  });
});

describe("parseLaunchFlags", () => {
  test("extracts --workspace / --workplace and --allow-write; leaves positionals", () => {
    const a = parseLaunchFlags(["chat", "hello", "--workspace", "/proj", "--allow-write", "/data"]);
    expect(a.options.workspacePath).toBe("/proj");
    expect(a.options.allowWrite).toEqual(["/data"]);
    expect(a.positional).toEqual(["chat", "hello"]);

    const b = parseLaunchFlags(["--workplace=/p", "--allow-write=/a", "--allow-write=/b"]);
    expect(b.options.workspacePath).toBe("/p");
    expect(b.options.allowWrite).toEqual(["/a", "/b"]);
    expect(b.positional).toEqual([]);

    const c = parseLaunchFlags(["tui"]);
    expect(c.options.workspacePath).toBeUndefined();
    expect(c.options.allowWrite).toBeUndefined();
  });
});
