/**
 * Integration test: connect to a REAL local MCP server (the stdio fixture spawned
 * as a bun subprocess) and round-trip tools/list + tools/call through the McpTool
 * adapter. Hermetic — no network, just a local subprocess.
 */

import { describe, expect, test } from "bun:test";
import { connectMcpServers, summarizeStatuses } from "./runtime.ts";
import type { McpServers } from "./types.ts";
import type { PermissionProvider } from "../permission/index.ts";
import type { Tool } from "../engine/index.ts";
import { startHttpEchoServer } from "./_fixtures/echo-http-server.ts";

const FIXTURE = new URL("./_fixtures/echo-server.ts", import.meta.url).pathname;

function echoConfig(name = "echo"): McpServers {
  return { [name]: { command: process.execPath, args: ["run", FIXTURE] } };
}

const ctx = () => ({ signal: new AbortController().signal, toolCallId: "t", emit: () => {} });
const byName = (tools: Tool[], n: string): Tool => {
  const t = tools.find((x) => x.spec.name === n);
  if (!t) throw new Error(`no tool ${n} in [${tools.map((x) => x.spec.name).join(", ")}]`);
  return t;
};

describe("connectMcpServers (real stdio server)", () => {
  test("lists and namespaces the server's tools", async () => {
    const rt = await connectMcpServers(echoConfig());
    try {
      expect(rt.statuses).toEqual([{ name: "echo", ok: true, toolCount: 3, error: undefined }]);
      const names = rt.tools.map((t) => t.spec.name).sort();
      expect(names).toEqual(["mcp__echo__boom", "mcp__echo__echo", "mcp__echo__touch"]);
    } finally {
      await rt.close();
    }
  }, 20_000);

  test("round-trips a tools/call through the adapter", async () => {
    const rt = await connectMcpServers(echoConfig());
    try {
      const res = await byName(rt.tools, "mcp__echo__echo").execute({ message: "hi" }, ctx());
      expect(res.content).toBe("echo: hi");
      expect(res.isError).toBe(false);
    } finally {
      await rt.close();
    }
  }, 20_000);

  test("propagates an error result from the server", async () => {
    const rt = await connectMcpServers(echoConfig());
    try {
      const res = await byName(rt.tools, "mcp__echo__boom").execute({}, ctx());
      expect(res.isError).toBe(true);
      expect(res.content).toBe("kaboom");
    } finally {
      await rt.close();
    }
  }, 20_000);

  test("gates a side-effecting tool through permission (deny blocks)", async () => {
    const deny: PermissionProvider = { request: async () => "deny" };
    const rt = await connectMcpServers(echoConfig(), { permission: deny });
    try {
      const res = await byName(rt.tools, "mcp__echo__touch").execute({ path: "/tmp/x" }, ctx());
      expect(res.isError).toBe(true);
      expect(res.content).toContain("Denied");
    } finally {
      await rt.close();
    }
  }, 20_000);

  test("allow lets the side-effecting tool run", async () => {
    const allow: PermissionProvider = { request: async () => "allow" };
    const rt = await connectMcpServers(echoConfig(), { permission: allow });
    try {
      const res = await byName(rt.tools, "mcp__echo__touch").execute({ path: "/tmp/x" }, ctx());
      expect(res.content).toBe("touched /tmp/x");
    } finally {
      await rt.close();
    }
  }, 20_000);
});

describe("connectMcpServers (real Streamable HTTP server)", () => {
  test("lists and round-trips tools over HTTP transport", async () => {
    const http = await startHttpEchoServer();
    const rt = await connectMcpServers({ web: { type: "http", url: http.url } });
    try {
      expect(rt.statuses).toEqual([{ name: "web", ok: true, toolCount: 3, error: undefined }]);
      expect(rt.tools.map((t) => t.spec.name).sort()).toEqual(["mcp__web__boom", "mcp__web__echo", "mcp__web__touch"]);
      const res = await byName(rt.tools, "mcp__web__echo").execute({ message: "over http" }, ctx());
      expect(res.content).toBe("echo: over http");
      expect(res.isError).toBe(false);
    } finally {
      await rt.close();
      await http.close();
    }
  }, 20_000);

  test("propagates an error result over HTTP", async () => {
    const http = await startHttpEchoServer();
    const rt = await connectMcpServers({ web: { type: "http", url: http.url } });
    try {
      const res = await byName(rt.tools, "mcp__web__boom").execute({}, ctx());
      expect(res.isError).toBe(true);
      expect(res.content).toBe("kaboom");
    } finally {
      await rt.close();
      await http.close();
    }
  }, 20_000);
});

describe("graceful failure", () => {
  test("a server that can't be spawned degrades to zero tools, doesn't throw", async () => {
    const rt = await connectMcpServers({ broken: { command: "kurt-nonexistent-binary-xyz", args: [] } }, { timeoutMs: 4000 });
    try {
      expect(rt.tools).toEqual([]);
      expect(rt.statuses[0]?.ok).toBe(false);
      expect(rt.statuses[0]?.error).toBeTruthy();
    } finally {
      await rt.close();
    }
  }, 20_000);

  test("summarizeStatuses renders ok and failed servers", () => {
    expect(summarizeStatuses([{ name: "a", ok: true, toolCount: 2 }, { name: "b", ok: false, toolCount: 0, error: "spawn ENOENT" }])).toBe(
      "a ✓ (2), b ✗ (spawn ENOENT)",
    );
  });
});
