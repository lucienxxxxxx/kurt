import { describe, expect, test } from "vitest";
import { T, tr } from "./strings.ts";

describe("tr", () => {
  test("picks the active language", () => {
    expect(tr(T.newChat, "zh")).toBe("新对话");
    expect(tr(T.newChat, "en")).toBe("New chat");
  });

  test("interpolates params", () => {
    expect(tr(T.thoughtFor, "en", { n: 5 })).toBe("Thought for 5s");
    expect(tr(T.linesLabel, "zh", { range: "1-18" })).toBe("行 1-18");
  });

  test("passes through a plain string", () => {
    expect(tr("literal", "zh")).toBe("literal");
  });

  test("empty for null/undefined", () => {
    expect(tr(null, "zh")).toBe("");
    expect(tr(undefined, "en")).toBe("");
  });
});
