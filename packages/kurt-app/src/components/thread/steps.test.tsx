import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { renderStep } from "./steps.tsx";
import type { Step } from "../../types.ts";

afterEach(cleanup);

const ctx = (over = {}) => ({
  lang: "en" as const,
  collapsed: new Set<number>(),
  liveId: null as number | null,
  onToggle: vi.fn(),
  onOpenFile: vi.fn(),
  onOpenOutput: vi.fn(),
  ...over,
});

describe("renderStep", () => {
  test("thinking step shows the 'Thought for' label and body when open", () => {
    const step: Step = { _id: 1, type: "thinking", sec: 4, text: { zh: "想", en: "reasoning here" } };
    render(<>{renderStep(step, ctx())}</>);
    expect(screen.getByText("Thought for 4s")).toBeInTheDocument();
    expect(screen.getByText("reasoning here")).toBeInTheDocument();
  });

  test("tool step shows name, IN and OUT", () => {
    const step: Step = { _id: 2, type: "tool", name: "Bash", title: { zh: "列目录", en: "list dir" }, cmd: "ls -la", out: { zh: "结果", en: "result" } };
    render(<>{renderStep(step, ctx())}</>);
    expect(screen.getByText("Bash")).toBeInTheDocument();
    expect(screen.getByText("IN")).toBeInTheDocument();
    expect(screen.getByText("OUT")).toBeInTheDocument();
    expect(screen.getByText("ls -la")).toBeInTheDocument();
  });

  test("clicking anywhere on the tool-line row toggles (not just the chevron)", () => {
    const onToggle = vi.fn();
    const step: Step = { _id: 2, type: "tool", name: "web_search", title: "", cmd: "q", out: "" };
    render(<>{renderStep(step, ctx({ onToggle }))}</>);
    fireEvent.click(screen.getByText("web_search").closest(".tool-line")!);
    expect(onToggle).toHaveBeenCalledWith(2);
  });

  test("clicking the chevron still toggles (bubbles to the row)", () => {
    const onToggle = vi.fn();
    const step: Step = { _id: 2, type: "tool", name: "web_search", title: "", cmd: "q", out: "" };
    const { container } = render(<>{renderStep(step, ctx({ onToggle }))}</>);
    fireEvent.click(container.querySelector(".tool-line .tool-toggle")!);
    expect(onToggle).toHaveBeenCalledWith(2);
  });

  test("clicking the skill-line row toggles", () => {
    const onToggle = vi.fn();
    const step: Step = { _id: 4, type: "skill", name: "web_search", title: "", input: "q", output: "o" };
    render(<>{renderStep(step, ctx({ onToggle }))}</>);
    fireEvent.click(screen.getByText("web_search").closest(".skill-line")!);
    expect(onToggle).toHaveBeenCalledWith(4);
  });

  test("read step renders the file link and calls onOpenFile", () => {
    const onOpenFile = vi.fn();
    const step: Step = { _id: 3, type: "read", file: ".eslintrc.js", lines: "1-18" };
    render(<>{renderStep(step, ctx({ onOpenFile }))}</>);
    const link = screen.getByText(".eslintrc.js");
    expect(link).toBeInTheDocument();
    fireEvent.click(link);
    expect(onOpenFile).toHaveBeenCalledWith(".eslintrc.js");
  });

  test("skill step shows name + INPUT/OUTPUT sections", () => {
    const step: Step = { _id: 4, type: "skill", name: "web_search", title: { zh: "搜", en: "search" }, input: { zh: "q", en: "query" }, output: { zh: "o", en: "out" } };
    render(<>{renderStep(step, ctx())}</>);
    expect(screen.getByText("web_search")).toBeInTheDocument();
    expect(screen.getByText("INPUT")).toBeInTheDocument();
    expect(screen.getByText("OUTPUT")).toBeInTheDocument();
  });
});
