import { describe, expect, test } from "bun:test";
import { render } from "ink-testing-library";
import { McpPicker } from "./mcp-picker.tsx";
import type { McpServerInfo } from "./mcp-info.ts";

const SERVERS: McpServerInfo[] = [
  { name: "fs", ok: true, toolCount: 2, tools: [{ name: "read_file", description: "read" }] },
  { name: "web", ok: false, toolCount: 0, error: "spawn ENOENT", tools: [] },
];

describe("McpPicker render", () => {
  test("lists each server with ok/fail badge, tool count, and error", () => {
    const { lastFrame, unmount } = render(<McpPicker servers={SERVERS} selected={0} />);
    const frame = lastFrame() ?? "";
    expect(frame).toContain("fs");
    expect(frame).toContain("[ok]");
    expect(frame).toContain("2 tools");
    expect(frame).toContain("web");
    expect(frame).toContain("[fail]");
    expect(frame).toContain("spawn ENOENT");
    unmount();
  });

  test("empty list shows a neutral hint", () => {
    const { lastFrame, unmount } = render(<McpPicker servers={[]} selected={0} />);
    expect(lastFrame() ?? "").toContain("No MCP servers configured");
    unmount();
  });
});
