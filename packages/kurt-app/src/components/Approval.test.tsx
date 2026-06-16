import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { Approval } from "./Approval.tsx";
import type { ApprovalRequest } from "../lib/bridge.ts";

afterEach(cleanup);

const req: ApprovalRequest = {
  id: "a1", key: "rm", title: "rm — delete files",
  command: "rm -rf /tmp/x", explanation: "removes files", risk: "data loss",
};

describe("Approval panel", () => {
  test("shows the command, risk, and three actions", () => {
    render(<Approval req={req} lang="en" onDecide={vi.fn()} />);
    expect(screen.getByText("rm -rf /tmp/x")).toBeInTheDocument();
    expect(screen.getByText(/data loss/)).toBeInTheDocument();
    expect(screen.getByText("Allow once")).toBeInTheDocument();
    expect(screen.getByText("Always allow")).toBeInTheDocument();
    expect(screen.getByText("Deny")).toBeInTheDocument();
  });

  test("is an inline panel, not a modal overlay", () => {
    const { container } = render(<Approval req={req} lang="en" onDecide={vi.fn()} />);
    expect(container.querySelector(".approval-overlay")).toBeNull();
    expect(container.querySelector(".approval-inline")).toBeInTheDocument();
  });

  test("each button reports its decision", () => {
    const onDecide = vi.fn();
    render(<Approval req={req} lang="en" onDecide={onDecide} />);
    fireEvent.click(screen.getByText("Allow once"));
    fireEvent.click(screen.getByText("Always allow"));
    fireEvent.click(screen.getByText("Deny"));
    expect(onDecide.mock.calls.map((c) => c[0])).toEqual(["allow", "always", "deny"]);
  });
});
