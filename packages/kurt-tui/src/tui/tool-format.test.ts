import { describe, expect, test } from "bun:test";
import { clip, formatToolInput, labeled, toolLabel, toolSummary } from "./tool-format.ts";

describe("tool-format", () => {
  test("toolLabel maps known tools and passes through unknown ones", () => {
    expect(toolLabel("shell")).toBe("Bash");
    expect(toolLabel("read_file")).toBe("Read");
    expect(toolLabel("some_mcp_tool")).toBe("some_mcp_tool");
  });

  test("formatToolInput extracts the salient field per tool", () => {
    expect(formatToolInput("shell", { command: "ls -la" })).toBe("ls -la");
    expect(formatToolInput("read_file", { path: "src/x.ts" })).toBe("src/x.ts");
    expect(formatToolInput("web_search", { query: "bun ffi" })).toBe("bun ffi");
    expect(formatToolInput("run_code", { language: "python", code: "print(1)" })).toBe("python\nprint(1)");
    expect(formatToolInput("mystery", { a: 1 })).toBe('{"a":1}');
  });

  test("toolSummary gives a compact one-liner for the header", () => {
    expect(toolSummary("read_file", { path: "src/x.ts" })).toBe("src/x.ts");
    expect(toolSummary("run_code", { language: "python", code: "print(1)" })).toBe("python");
    expect(toolSummary("grep", { pattern: "TODO", path: "src" })).toBe("/TODO/ src");
    expect(toolSummary("memory", { action: "append", scope: "global" })).toBe("append global");
    // collapses newlines and clips long input to one line
    const long = toolSummary("shell", { command: "echo a\n".repeat(40) });
    expect(long).not.toContain("\n");
    expect(long.length).toBeLessThanOrEqual(60);
    expect(toolSummary("mystery", {})).toBe("");
  });

  test("clip truncates by lines and chars, flagging when cut", () => {
    expect(clip("a\nb\nc", 10, 100)).toEqual({ text: "a\nb\nc", clipped: false });
    expect(clip("a\nb\nc\nd", 2, 100)).toEqual({ text: "a\nb", clipped: true });
    const long = clip("x".repeat(50), 10, 10);
    expect(long.clipped).toBe(true);
    expect(long.text).toHaveLength(10);
  });

  test("labeled prefixes the first line and indents continuations", () => {
    expect(labeled("OUT:", "line1\nline2")).toBe("OUT: line1\n     line2");
  });
});
