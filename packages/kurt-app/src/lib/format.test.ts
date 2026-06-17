import { describe, expect, test } from "vitest";
import { fmtElapsed, fmtTokens } from "./format.ts";

describe("fmtElapsed", () => {
  test("seconds only under a minute", () => {
    expect(fmtElapsed(0)).toBe("0s");
    expect(fmtElapsed(44_000)).toBe("44s");
    expect(fmtElapsed(59_900)).toBe("59s");
  });
  test("minutes + seconds at/over a minute", () => {
    expect(fmtElapsed(60_000)).toBe("1m 0s");
    expect(fmtElapsed(164_000)).toBe("2m 44s");
  });
  test("never negative", () => {
    expect(fmtElapsed(-500)).toBe("0s");
  });
});

describe("fmtTokens", () => {
  test("plain under 1k", () => {
    expect(fmtTokens(0)).toBe("0");
    expect(fmtTokens(999)).toBe("999");
  });
  test("abbreviated at/over 1k", () => {
    expect(fmtTokens(1000)).toBe("1k");
    expect(fmtTokens(1500)).toBe("1.5k");
    expect(fmtTokens(12_000)).toBe("12k");
    expect(fmtTokens(120_000)).toBe("120k");
  });
});
