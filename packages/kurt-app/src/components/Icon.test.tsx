import { afterEach, describe, expect, test } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { Icon } from "./Icon.tsx";

afterEach(cleanup);

describe("Icon", () => {
  test("renders known app icon names through lucide-react", () => {
    const { container } = render(<Icon name="search" className="probe" />);
    const svg = container.querySelector("svg")!;
    expect(svg).toBeInTheDocument();
    expect(svg.classList.contains("lucide-search")).toBe(true);
    expect(svg.classList.contains("probe")).toBe(true);
  });

  test("renders a small fallback for unknown names", () => {
    const { container } = render(<Icon name="missing-icon" />);
    expect(container.querySelector("circle")).toBeInTheDocument();
  });
});
