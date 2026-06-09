import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseLaunchFlags, resolveWorkspace, systemPrompt, workspaceEnv } from "./agent.ts";

describe("resolveWorkspace", () => {
  const root = join(tmpdir(), `kurt-ws-${process.pid}`);
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  test("derives import/export under the working dir and creates them", () => {
    const ws = resolveWorkspace(root);
    expect(ws.root).toBe(root);
    expect(ws.importDir).toBe(join(root, "import"));
    expect(ws.exportDir).toBe(join(root, "export"));
    expect(existsSync(ws.importDir)).toBe(true);
    expect(existsSync(ws.exportDir)).toBe(true);
  });

  test("workspaceEnv exposes the three dirs", () => {
    const ws = resolveWorkspace(root);
    expect(workspaceEnv(ws)).toEqual({ WORKSPACE_DIR: ws.root, IMPORT_DIR: ws.importDir, EXPORT_DIR: ws.exportDir });
  });
});

describe("systemPrompt", () => {
  test("injects the working paths and the path-protocol rule", () => {
    const p = systemPrompt({ root: "/w", importDir: "/w/import", exportDir: "/w/export" });
    expect(p).toContain("WORKSPACE_DIR = /w");
    expect(p).toContain("IMPORT_DIR = /w/import");
    expect(p).toContain("EXPORT_DIR = /w/export");
    expect(p.toLowerCase()).toContain("path protocol");
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
