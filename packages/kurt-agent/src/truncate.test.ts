import { describe, expect, test } from "bun:test";
import { truncate, truncationNote } from "./truncate.ts";

describe("truncate", () => {
  test("passes short text through untouched", () => {
    const t = truncate("a\nb\nc");
    expect(t.truncated).toBe(false);
    expect(t.text).toBe("a\nb\nc");
    expect(truncationNote(t)).toBe("");
  });

  test("caps by line count", () => {
    const text = Array.from({ length: 50 }, (_, i) => `line ${i}`).join("\n");
    const t = truncate(text, { maxLines: 10, maxBytes: 1_000_000 });
    expect(t.truncated).toBe(true);
    expect(t.shownLines).toBe(10);
    expect(t.text.split("\n")).toHaveLength(10);
    expect(t.totalLines).toBe(50);
  });

  test("caps by bytes (whichever first) and keeps at least one line", () => {
    const text = Array.from({ length: 100 }, () => "x".repeat(100)).join("\n");
    const t = truncate(text, { maxLines: 1000, maxBytes: 250 });
    expect(t.truncated).toBe(true);
    expect(t.shownLines).toBeGreaterThanOrEqual(1);
    expect(new TextEncoder().encode(t.text).length).toBeLessThanOrEqual(250);
  });

  test("note describes the clip", () => {
    const t = truncate("a\nb\nc\nd", { maxLines: 2 });
    expect(truncationNote(t)).toContain("2 of 4 lines");
  });
});
