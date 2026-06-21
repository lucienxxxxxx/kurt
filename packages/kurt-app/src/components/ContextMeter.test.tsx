import { afterEach, describe, expect, test } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { ContextMeter } from "./ContextMeter.tsx";
import type { Step } from "../types.ts";

afterEach(cleanup);

const steps: Step[] = [
  { _id: 1, type: "user", text: "hello there" },
  { _id: 2, type: "thinking", text: "let me think about it" },
  { _id: 3, type: "tool", name: "shell", title: "", cmd: "ls -la", out: "a\nb\nc" },
  { _id: 4, type: "text", text: "Here is the answer." },
];

describe("ContextMeter", () => {
  test("renders a percentage in the ring", () => {
    const { container } = render(<ContextMeter steps={steps} model="deepseek-v4-flash" lang="en" />);
    expect(container.querySelector(".ctx-ring-text")?.textContent).toMatch(/^\d+%$/);
    expect(container.querySelector(".ctx-card")).toBeNull(); // closed by default
  });

  test("clicking the ring opens the breakdown card with each category", () => {
    render(<ContextMeter steps={steps} model="deepseek-v4-flash" lang="en" />);
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText("Your messages")).toBeInTheDocument();
    expect(screen.getByText("Thinking")).toBeInTheDocument();
    expect(screen.getByText("Tools")).toBeInTheDocument();
    expect(screen.getByText("Replies")).toBeInTheDocument();
    expect(screen.getByText("System prompt")).toBeInTheDocument();
  });

  test("shows real API usage line when provided", () => {
    render(<ContextMeter steps={steps} model="deepseek-v4-flash" lang="en" apiTokens={1500} />);
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText(/1\.5k/)).toBeInTheDocument();
  });

  test("ring % uses the API context size, not the text estimate", () => {
    // app's deepseek context window = 128,000; 64,000 = 50% (the text estimate would be ~0%).
    const { container } = render(
      <ContextMeter steps={steps} model="deepseek-v4-flash" lang="en" contextTokens={64_000} />,
    );
    expect(container.querySelector(".ctx-ring-text")?.textContent).toBe("50%");
  });
});
