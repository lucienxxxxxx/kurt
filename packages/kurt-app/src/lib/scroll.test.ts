import { describe, expect, test } from "vitest";
import { distanceFromBottom, isNearBottom } from "./scroll.ts";

describe("scroll bottom-follow", () => {
  test("exactly at the bottom is near", () => {
    expect(isNearBottom({ scrollHeight: 1000, scrollTop: 600, clientHeight: 400 })).toBe(true);
  });
  test("within the threshold is near (keep following)", () => {
    expect(isNearBottom({ scrollHeight: 1000, scrollTop: 560, clientHeight: 400 })).toBe(true); // 40px from bottom
  });
  test("scrolled up past the threshold is NOT near (stop following)", () => {
    expect(isNearBottom({ scrollHeight: 1000, scrollTop: 300, clientHeight: 400 })).toBe(false); // 300px up
  });
  test("threshold is configurable", () => {
    const m = { scrollHeight: 1000, scrollTop: 500, clientHeight: 400 }; // 100px from bottom
    expect(isNearBottom(m, 72)).toBe(false);
    expect(isNearBottom(m, 120)).toBe(true);
  });
  test("distanceFromBottom math", () => {
    expect(distanceFromBottom({ scrollHeight: 1000, scrollTop: 550, clientHeight: 400 })).toBe(50);
  });
});
