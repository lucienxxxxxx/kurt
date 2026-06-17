import { afterEach, describe, expect, test } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { ModelLogo } from "./ModelLogo.tsx";

afterEach(cleanup);

describe("ModelLogo", () => {
  test("DeepSeek models render the filled DeepSeek logo (1024 viewBox)", () => {
    const { container } = render(<ModelLogo model="deepseek-v4-flash" />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("viewBox")).toBe("0 0 1024 1024");
    expect(svg?.getAttribute("fill")).toBe("currentColor");
  });

  test("match is case-insensitive and substring", () => {
    const { container } = render(<ModelLogo model="DeepSeek-Chat" />);
    expect(container.querySelector("svg")?.getAttribute("viewBox")).toBe("0 0 1024 1024");
  });

  test("unknown vendor falls back to the generic spark icon (stroke, 24 viewBox)", () => {
    const { container } = render(<ModelLogo model="gpt-4o" />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("viewBox")).toBe("0 0 24 24");
    expect(svg?.getAttribute("stroke")).toBe("currentColor");
  });
});
