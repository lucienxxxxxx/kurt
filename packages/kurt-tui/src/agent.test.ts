import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SessionWorkspace, ToolHub, type Tool } from "kurt-agent";
import { maybeWorktree } from "./agent.ts";
import {
  autoCompactThreshold,
  makeSandbox,
  makeTools,
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
    // The escalation path is now the generalized request_access (write/network/open).
    expect(p).toContain("request_access");
    expect(p).toContain("kind='network'");
    expect(p).not.toContain("IMPORT_DIR");
    expect(p).not.toContain("EXPORT_DIR");
  });

  test("carries per-mode guidance", () => {
    expect(systemPrompt({ root: "/w" }, "chat")).toContain("MODE: chat");
    expect(systemPrompt({ root: "/w" }, "plan")).toContain("update_plan");
    expect(systemPrompt({ root: "/w" }, "agent")).toContain("MODE: agent");
  });
});

describe("makeTools capability escalation (aligned with the desktop app)", () => {
  const sandbox = makeSandbox();
  const codeTemp = new SessionWorkspace({ sessionId: "agent-test" });
  const perm = { request: async () => "allow" as const };

  test("with an approver, exposes request_access + the request_write_access alias + host_shell", () => {
    const names = makeTools(sandbox, codeTemp, { root: "/w" }, [], perm).map((t) => t.spec.name);
    expect(names).toContain("request_access");
    expect(names).toContain("request_write_access");
    expect(names).toContain("host_shell");
  });

  test("without an approver, no escalation tools", () => {
    const names = makeTools(sandbox, codeTemp, { root: "/w" }, []).map((t) => t.spec.name);
    expect(names).not.toContain("request_access");
    expect(names).not.toContain("request_write_access");
    expect(names).not.toContain("host_shell");
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
    expect(c.options.worktree).toBeUndefined();
  });

  test("--worktree is a boolean flag; default off", () => {
    expect(parseLaunchFlags(["--worktree"]).options.worktree).toBe(true);
    expect(parseLaunchFlags(["chat"]).options.worktree).toBeUndefined();
  });

  test("--no-mcp is a boolean flag; default off", () => {
    expect(parseLaunchFlags(["--no-mcp"]).options.noMcp).toBe(true);
    expect(parseLaunchFlags(["chat"]).options.noMcp).toBeUndefined();
  });
});

describe("autoCompactThreshold", () => {
  test("75% of the configured limit when it's within the model's window", () => {
    expect(autoCompactThreshold("deepseek-v4-flash", 128_000)).toBe(96_000); // 128k < 1M → honor config
  });

  test("clamps to the model's real max so it can't trigger past the real window", () => {
    // deepseek-v4-flash real window = 1,048,576; a 4M display limit must clamp.
    expect(autoCompactThreshold("deepseek-v4-flash", 4_000_000)).toBe(Math.round(1_048_576 * 0.75));
    // unknown model real window = 128k; a 1M display limit clamps to it.
    expect(autoCompactThreshold("some-unknown-model", 1_000_000)).toBe(96_000);
  });
});

describe("maybeWorktree", () => {
  const savedHome = process.env.KURT_HOME;
  let home: string;
  let repo: string;

  async function git(args: string[], cwd: string): Promise<void> {
    await Bun.spawn(["git", ...args], { cwd, stdout: "pipe", stderr: "pipe" }).exited;
  }

  afterEach(() => {
    if (savedHome === undefined) delete process.env.KURT_HOME;
    else process.env.KURT_HOME = savedHome;
    if (home) rmSync(home, { recursive: true, force: true });
    if (repo) rmSync(repo, { recursive: true, force: true });
  });

  test("returns null when --worktree is off", async () => {
    expect(await maybeWorktree({})).toBeNull();
  });

  test("rejects a non-git workspace", async () => {
    const plain = realpathSync(mkdtempSync(join(tmpdir(), "kurt-plain-")));
    try {
      await expect(maybeWorktree({ worktree: true, workspacePath: plain })).rejects.toThrow(/git repository/);
    } finally {
      rmSync(plain, { recursive: true, force: true });
    }
  });

  test("creates an isolated worktree under KURT_HOME and commits on finish", async () => {
    home = realpathSync(mkdtempSync(join(tmpdir(), "kurt-home-")));
    repo = realpathSync(mkdtempSync(join(tmpdir(), "kurt-repo-")));
    process.env.KURT_HOME = home;
    await git(["init", "-q", "-b", "main"], repo);
    await git(["config", "user.email", "t@local"], repo);
    await git(["config", "user.name", "t"], repo);
    writeFileSync(join(repo, "x.txt"), "hi");
    await git(["add", "-A"], repo);
    await git(["commit", "-qm", "init"], repo);

    const wt = await maybeWorktree({ worktree: true, workspacePath: repo });
    expect(wt).not.toBeNull();
    expect(wt!.root.startsWith(home)).toBe(true); // lives under ~/.kurt
    expect(wt!.branch).toMatch(/^kurt\//);
    expect(existsSync(join(wt!.root, "x.txt"))).toBe(true); // checked out from history

    writeFileSync(join(wt!.root, "agent-output.txt"), "made by the agent");
    const msg = await wt!.finish();
    expect(msg).toContain("committed");
    expect(existsSync(join(repo, "agent-output.txt"))).toBe(false); // main working dir untouched
  });
});
