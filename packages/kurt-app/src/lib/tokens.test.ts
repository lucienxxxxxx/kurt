import { describe, expect, test } from "vitest";
import { estimateTokens } from "./tokens.ts";
import { modelContextWindow } from "./models.ts";

describe("estimateTokens", () => {
  test("empty → 0", () => {
    expect(estimateTokens("")).toBe(0);
  });
  test("latin text ≈ chars / 4", () => {
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("a".repeat(40))).toBe(10);
  });
  test("CJK ≈ 1 token per char", () => {
    expect(estimateTokens("你好世界")).toBe(4);
  });
  test("mixed", () => {
    expect(estimateTokens("你好abcd")).toBe(3); // 2 CJK + 4/4
  });
});

describe("modelContextWindow", () => {
  test("deepseek models", () => {
    expect(modelContextWindow("deepseek-v4-flash")).toBe(128_000);
  });
  test("unknown falls back to a default", () => {
    expect(modelContextWindow("gpt-4o")).toBeGreaterThan(0);
  });
});
