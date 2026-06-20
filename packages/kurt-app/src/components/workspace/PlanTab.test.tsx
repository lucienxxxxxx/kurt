import { afterEach, describe, expect, test } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { PlanTab } from "./PlanTab.tsx";
import type { PlanStep } from "../../lib/bridge.ts";

afterEach(cleanup);

describe("PlanTab", () => {
  test("empty plan shows the empty state", () => {
    render(<PlanTab steps={undefined} lang="en" />);
    expect(screen.getByText(/No plan yet/)).toBeInTheDocument();
  });

  test("renders steps with progress and strikes done items", () => {
    const steps: PlanStep[] = [
      { title: "Design", status: "done" },
      { title: "Build", status: "in_progress" },
      { title: "Ship", status: "pending" },
    ];
    const { container } = render(<PlanTab steps={steps} lang="en" />);
    expect(screen.getByText("1/3 done")).toBeInTheDocument();
    expect(screen.getByText("Design").closest(".plan-item")).toHaveClass("done");
    expect(screen.getByText("Build").closest(".plan-item")).toHaveClass("active");
    expect(container.querySelectorAll(".plan-item")).toHaveLength(3);
  });
});
