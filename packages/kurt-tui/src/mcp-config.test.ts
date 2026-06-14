import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseMcpConfig, loadMcpServers } from "./mcp-config.ts";

describe("parseMcpConfig", () => {
  test("reads stdio + http entries", () => {
    const out = parseMcpConfig({
      mcpServers: {
        fs: { command: "npx", args: ["-y", "server-fs", "/data"], env: { TOKEN: "x" } },
        api: { type: "http", url: "https://mcp.example.com", headers: { Authorization: "Bearer y" } },
      },
    });
    expect(out.fs).toEqual({ type: "stdio", command: "npx", args: ["-y", "server-fs", "/data"], env: { TOKEN: "x" }, cwd: undefined });
    expect(out.api).toEqual({ type: "http", url: "https://mcp.example.com", headers: { Authorization: "Bearer y" } });
  });

  test("drops malformed entries (no command / no url / wrong shape)", () => {
    const out = parseMcpConfig({
      mcpServers: { a: { args: ["x"] }, b: { type: "http" }, c: "nope", d: { command: "ok" } },
    });
    expect(Object.keys(out)).toEqual(["d"]);
  });

  test("missing mcpServers → empty", () => {
    expect(parseMcpConfig({})).toEqual({});
    expect(parseMcpConfig(null)).toEqual({});
    expect(parseMcpConfig("garbage")).toEqual({});
  });
});

describe("loadMcpServers (global + project merge)", () => {
  const saved = process.env.KURT_HOME;
  let home = "";
  let ws = "";
  afterEach(() => {
    if (saved === undefined) delete process.env.KURT_HOME;
    else process.env.KURT_HOME = saved;
    if (home) rmSync(home, { recursive: true, force: true });
    if (ws) rmSync(ws, { recursive: true, force: true });
  });

  test("project entries override global by name; others union", async () => {
    home = realpathSync(mkdtempSync(join(tmpdir(), "kurt-home-")));
    ws = realpathSync(mkdtempSync(join(tmpdir(), "kurt-ws-")));
    process.env.KURT_HOME = home;
    writeFileSync(
      join(home, "mcp.json"),
      JSON.stringify({ mcpServers: { shared: { command: "global-cmd" }, onlyGlobal: { command: "g" } } }),
    );
    mkdirSync(join(ws, ".kurt"), { recursive: true });
    writeFileSync(
      join(ws, ".kurt", "mcp.json"),
      JSON.stringify({ mcpServers: { shared: { command: "project-cmd" }, onlyProject: { command: "p" } } }),
    );

    const servers = await loadMcpServers(ws);
    expect(Object.keys(servers).sort()).toEqual(["onlyGlobal", "onlyProject", "shared"]);
    expect((servers.shared as { command: string }).command).toBe("project-cmd"); // project wins
  });

  test("no config files → empty (never throws)", async () => {
    home = realpathSync(mkdtempSync(join(tmpdir(), "kurt-home-")));
    ws = realpathSync(mkdtempSync(join(tmpdir(), "kurt-ws-")));
    process.env.KURT_HOME = home;
    expect(await loadMcpServers(ws)).toEqual({});
  });
});
