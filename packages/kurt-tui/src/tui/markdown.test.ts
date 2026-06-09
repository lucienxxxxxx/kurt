import { describe, expect, test } from "bun:test";
import { renderMarkdown } from "./markdown.ts";

describe("renderMarkdown", () => {
  test("processes markdown (ANSI may be stripped in non-TTY tests)", () => {
    const out = renderMarkdown("# Title\n\nSome **bold** words, a list:\n\n- one\n- two\n\n`code`", 60);
    expect(out).toContain("Title");
    expect(out).toContain("bold");
    expect(out).toContain("one");
    expect(typeof out).toBe("string");
  });

  test("returns a string and trims trailing whitespace", () => {
    const out = renderMarkdown("hello\n\n\n", 40);
    expect(out.endsWith("\n")).toBe(false);
  });
});
