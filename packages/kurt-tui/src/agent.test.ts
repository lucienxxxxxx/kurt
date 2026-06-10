import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ToolHub, type Tool } from "kurt-agent";
import {
  normalizeMode,
  parseLaunchFlags,
  resolveWorkspace,
  systemPrompt,
  toolsForMode,
  TOOLS_BY_MODE,
  workspaceEnv,
} from "./agent.ts";

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

  test("carries per-mode guidance", () => {
    expect(systemPrompt({ root: "/w" }, "chat")).toContain("MODE: chat");
    expect(systemPrompt({ root: "/w" }, "plan")).toContain("update_plan");
    expect(systemPrompt({ root: "/w" }, "agent")).toContain("MODE: agent");
  });
});

describe("modes", () => {
  test("normalizeMode migrates legacy 'ask' → 'chat' and defaults to agent", () => {
    expect(normalizeMode("ask")).toBe("chat");
    expect(normalizeMode("chat")).toBe("chat");
    expect(normalizeMode("plan")).toBe("plan");
    expect(normalizeMode(undefined)).toBe("agent");
    expect(normalizeMode("garbage")).toBe("agent");
  });

  test("tool profiles: chat read-only, plan adds update_plan, agent gets all", () => {
    expect(TOOLS_BY_MODE.chat).not.toContain("write_file");
    expect(TOOLS_BY_MODE.chat).not.toContain("shell");
    expect(TOOLS_BY_MODE.chat).toContain("ask_user");
    expect(TOOLS_BY_MODE.plan).toContain("update_plan");
    expect(TOOLS_BY_MODE.plan).not.toContain("write_file");
    expect(TOOLS_BY_MODE.agent).toBe("all");
  });

  test("toolsForMode selects the right subset from the hub", () => {
    const fake = (name: string): Tool => ({
      spec: { name, description: name, inputSchema: { type: "object", properties: {} } },
      async execute() {
        return { content: "" };
      },
    });
    const hub = new ToolHub(["read_file", "write_file", "shell", "ask_user", "update_plan", "memory", "ls", "grep", "web_search"].map(fake));
    expect(toolsForMode(hub, "chat").map((t) => t.spec.name).sort()).toEqual(
      ["ask_user", "grep", "ls", "memory", "read_file", "web_search"].sort(),
    );
    expect(toolsForMode(hub, "agent")).toHaveLength(hub.all().length); // everything
    expect(toolsForMode(hub, "plan").map((t) => t.spec.name)).toContain("update_plan");
    expect(toolsForMode(hub, "plan").map((t) => t.spec.name)).not.toContain("write_file");
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
