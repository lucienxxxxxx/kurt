import { describe, expect, test } from "bun:test";
import { McpTool, flattenContent, namespacedName, type McpToolOptions } from "./mcp-tool.ts";
import type { McpCall } from "./types.ts";
import type { PermissionProvider } from "../permission/index.ts";

const ctx = () => ({ signal: new AbortController().signal, toolCallId: "t", emit: () => {} });

function makeTool(opts: Partial<McpToolOptions> & { call: McpCall }): McpTool {
  return new McpTool({
    name: "mcp__srv__do",
    remoteName: "do",
    serverName: "srv",
    description: "does a thing",
    inputSchema: { type: "object" },
    readOnly: false,
    ...opts,
  });
}

describe("namespacedName", () => {
  test("prefixes and sanitizes", () => {
    expect(namespacedName("github", "create_issue")).toBe("mcp__github__create_issue");
    expect(namespacedName("my server!", "weird/name")).toBe("mcp__my_server__weird_name");
  });

  test("caps at 64 chars", () => {
    const n = namespacedName("a".repeat(50), "b".repeat(50));
    expect(n.length).toBe(64);
  });
});

describe("flattenContent", () => {
  test("joins text blocks", () => {
    expect(flattenContent([{ type: "text", text: "hello" }, { type: "text", text: "world" }])).toBe("hello\nworld");
  });

  test("summarizes binary blocks", () => {
    expect(flattenContent([{ type: "image", data: "AAAA", mimeType: "image/png" }])).toBe("[image: image/png, 4 base64 chars]");
  });

  test("renders resource uri + text", () => {
    expect(flattenContent([{ type: "resource", resource: { uri: "file://x", text: "body" } }])).toBe("[resource file://x]\nbody");
  });
});

describe("McpTool.execute", () => {
  test("calls through and returns flattened content", async () => {
    let gotArgs: Record<string, unknown> | undefined;
    const tool = makeTool({
      readOnly: true,
      call: async (args) => {
        gotArgs = args;
        return { content: [{ type: "text", text: "ok" }] };
      },
    });
    const res = await tool.execute({ x: 1 }, ctx());
    expect(gotArgs).toEqual({ x: 1 });
    expect(res.content).toBe("ok");
    expect(res.isError).toBe(false);
  });

  test("maps isError through", async () => {
    const tool = makeTool({ readOnly: true, call: async () => ({ content: [{ type: "text", text: "bad" }], isError: true }) });
    const res = await tool.execute({}, ctx());
    expect(res.isError).toBe(true);
    expect(res.content).toBe("bad");
  });

  test("non-read-only tool asks permission; deny blocks the call", async () => {
    let called = false;
    const deny: PermissionProvider = { request: async () => "deny" };
    const tool = makeTool({ readOnly: false, permission: deny, call: async () => ((called = true), { content: [] }) });
    const res = await tool.execute({}, ctx());
    expect(called).toBe(false);
    expect(res.isError).toBe(true);
    expect(res.content).toContain("Denied");
  });

  test("read-only tool never asks permission", async () => {
    let asked = false;
    const perm: PermissionProvider = { request: async () => ((asked = true), "allow") };
    const tool = makeTool({ readOnly: true, permission: perm, call: async () => ({ content: [{ type: "text", text: "r" }] }) });
    await tool.execute({}, ctx());
    expect(asked).toBe(false);
  });

  test("allow lets a side-effecting call proceed", async () => {
    const allow: PermissionProvider = { request: async () => "allow" };
    const tool = makeTool({ readOnly: false, permission: allow, call: async () => ({ content: [{ type: "text", text: "did it" }] }) });
    const res = await tool.execute({}, ctx());
    expect(res.content).toBe("did it");
  });

  test("a thrown call becomes an error result (loop survives)", async () => {
    const tool = makeTool({ readOnly: true, call: async () => { throw new Error("nope"); } });
    const res = await tool.execute({}, ctx());
    expect(res.isError).toBe(true);
    expect(res.content).toContain("nope");
  });

  test("abort propagates (not swallowed)", async () => {
    const tool = makeTool({
      readOnly: true,
      call: async () => { const e = new Error("aborted"); e.name = "AbortError"; throw e; },
    });
    await expect(tool.execute({}, ctx())).rejects.toThrow("aborted");
  });
});
