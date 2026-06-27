import { describe, expect, test } from "bun:test";
import type { McpServerStatus, Tool } from "kurt-agent";
import { mcpServerInfos, parseMcpToolName } from "./mcp-info.ts";

function tool(name: string, description: string): Tool {
  return {
    spec: { name, description, inputSchema: { type: "object", properties: {} } },
    execute: async () => ({ content: "" }),
  };
}

describe("parseMcpToolName", () => {
  test("splits mcp__<server>__<tool>", () => {
    expect(parseMcpToolName("mcp__fs__read_file")).toEqual({ server: "fs", tool: "read_file" });
    expect(parseMcpToolName("mcp__web__search__deep")).toEqual({ server: "web", tool: "search__deep" });
  });
  test("non-namespaced → null", () => {
    expect(parseMcpToolName("read_file")).toBeNull();
  });
});

describe("mcpServerInfos", () => {
  test("joins statuses with grouped tools (prefix stripped)", () => {
    const statuses: McpServerStatus[] = [
      { name: "fs", ok: true, toolCount: 2 },
      { name: "web", ok: false, toolCount: 0, error: "spawn ENOENT" },
    ];
    const tools = [tool("mcp__fs__read_file", "read a file"), tool("mcp__fs__write_file", "write a file"), tool("native", "n/a")];
    const infos = mcpServerInfos(statuses, tools);
    expect(infos).toHaveLength(2);
    const fs = infos.find((i) => i.name === "fs")!;
    expect(fs.ok).toBe(true);
    expect(fs.tools.map((t) => t.name)).toEqual(["read_file", "write_file"]);
    expect(fs.tools[0]!.description).toBe("read a file");
    const web = infos.find((i) => i.name === "web")!;
    expect(web.ok).toBe(false);
    expect(web.error).toBe("spawn ENOENT");
    expect(web.tools).toEqual([]);
  });
});
