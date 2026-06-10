import { describe, expect, test } from "bun:test";
import { capabilitiesFor, mapEffort, unknownModel } from "./capabilities.ts";

describe("capabilitiesFor", () => {
  test("describes the DeepSeek V4 models (thinking, tools, 1M/384K)", () => {
    for (const id of ["deepseek-v4-flash", "deepseek-v4-pro"]) {
      const c = capabilitiesFor(id);
      expect(c.id).toBe(id);
      expect(c.tools).toBe(true);
      expect(c.thinking.supported).toBe(true);
      expect(c.thinking.effortLevels).toEqual(["high", "max"]);
      expect(c.thinking.unsupportedParams).toContain("temperature");
      expect(c.thinking.replayReasoning).toBe(true); // DeepSeek needs reasoning echoed back
      expect(c.maxContextTokens).toBeGreaterThanOrEqual(1_000_000);
      expect(c.maxOutputTokens).toBeGreaterThanOrEqual(384_000);
    }
  });

  test("falls back to a safe no-thinking descriptor for unknown ids", () => {
    const c = capabilitiesFor("some-random-model");
    expect(c.thinking.supported).toBe(false);
    expect(c.thinking.replayReasoning).toBe(false); // never replay for unknown models
    expect(c.tools).toBe(true);
    expect(c).toEqual(unknownModel("some-random-model"));
  });
});

describe("mapEffort", () => {
  const cap = capabilitiesFor("deepseek-v4-pro").thinking;

  test("collapses the low/medium/high knob onto 'high'", () => {
    expect(mapEffort("low", cap)).toBe("high");
    expect(mapEffort("medium", cap)).toBe("high");
    expect(mapEffort("high", cap)).toBe("high");
  });

  test("maps xhigh→max and passes max through", () => {
    expect(mapEffort("xhigh", cap)).toBe("max");
    expect(mapEffort("max", cap)).toBe("max");
  });

  test("is case-insensitive and falls back to the default effort", () => {
    expect(mapEffort("MAX", cap)).toBe("max");
    expect(mapEffort(undefined, cap)).toBe("high");
    expect(mapEffort("nonsense", cap)).toBe("high");
  });
});
