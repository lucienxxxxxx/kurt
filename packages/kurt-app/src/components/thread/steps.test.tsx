import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { renderStep } from "./steps.tsx";
import type { Step } from "../../types.ts";

afterEach(cleanup);

const ctx = (over = {}) => ({
  lang: "en" as const,
  collapsed: new Set<number>(),
  collapseDetails: false,
  liveId: null as number | null,
  lastTextId: null as number | null,
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

  test("collapseDetails hides a thinking step's body by default (still shows the header)", () => {
    const step: Step = { _id: 1, type: "thinking", sec: 4, text: { zh: "想", en: "reasoning here" } };
    render(<>{renderStep(step, ctx({ collapseDetails: true }))}</>);
    expect(screen.getByText("Thought for 4s")).toBeInTheDocument(); // header still there
    expect(screen.queryByText("reasoning here")).toBeNull(); // body collapsed
  });

  test("collapseDetails + an explicit toggle expands that one step", () => {
    const step: Step = { _id: 1, type: "thinking", sec: 4, text: { zh: "想", en: "reasoning here" } };
    render(<>{renderStep(step, ctx({ collapseDetails: true, collapsed: new Set([1]) }))}</>);
    expect(screen.getByText("reasoning here")).toBeInTheDocument(); // toggled → expanded
  });

  test("tool step shows name, IN and OUT", () => {
    const step: Step = { _id: 2, type: "tool", name: "Bash", title: { zh: "列目录", en: "list dir" }, cmd: "ls -la", out: { zh: "结果", en: "result" } };
    render(<>{renderStep(step, ctx())}</>);
    expect(screen.getByText("Bash")).toBeInTheDocument();
    expect(screen.getByText("IN")).toBeInTheDocument();
    expect(screen.getByText("OUT")).toBeInTheDocument();
    expect(screen.getByText("ls -la")).toBeInTheDocument();
  });

  test("a file tool shows only the basename and opens the side preview on click", () => {
    const onOpenFile = vi.fn();
    const step: Step = { _id: 2, type: "tool", name: "write_file", title: "src/lib/foo.ts", cmd: "{}", out: "" };
    render(<>{renderStep(step, ctx({ onOpenFile }))}</>);
    const link = screen.getByText("foo.ts"); // basename only, not the full path
    expect(screen.queryByText("src/lib/foo.ts")).toBeNull();
    fireEvent.click(link);
    expect(onOpenFile).toHaveBeenCalledWith("src/lib/foo.ts"); // opens with the full path
  });

  test("a long tool IN clips to 5 lines and opens the full content on click", () => {
    const onOpenOutput = vi.fn();
    const cmd = ["l1", "l2", "l3", "l4", "l5", "l6", "l7"].join("\n");
    const step: Step = { _id: 2, type: "tool", name: "write_file", title: "", cmd, out: "" };
    const { container } = render(<>{renderStep(step, ctx({ onOpenOutput }))}</>);
    expect(screen.getByText(/l5/)).toBeInTheDocument();
    expect(screen.queryByText(/l6/)).toBeNull(); // clipped past MAX_LINES
    fireEvent.click(container.querySelector(".tool-row.clickable")!);
    expect(onOpenOutput).toHaveBeenCalledWith(expect.objectContaining({ content: cmd }));
  });

  test("the in-flight tool step (liveId) shows a running spinner; a finished one doesn't", () => {
    const step: Step = { _id: 2, type: "tool", name: "web_search", title: "", cmd: "q", out: "" };
    const live = render(<>{renderStep(step, ctx({ liveId: 2 }))}</>);
    expect(live.container.querySelector(".step-head-spin")).toBeInTheDocument();
    cleanup();
    const idle = render(<>{renderStep(step, ctx({ liveId: 9 }))}</>);
    expect(idle.container.querySelector(".step-head-spin")).toBeNull();
  });

  test("clicking anywhere on the tool header row toggles (not just the chevron)", () => {
    const onToggle = vi.fn();
    const step: Step = { _id: 2, type: "tool", name: "web_search", title: "", cmd: "q", out: "" };
    render(<>{renderStep(step, ctx({ onToggle }))}</>);
    fireEvent.click(screen.getByText("web_search").closest(".step-head")!);
    expect(onToggle).toHaveBeenCalledWith(2);
  });

  test("clicking the chevron still toggles (bubbles to the row)", () => {
    const onToggle = vi.fn();
    const step: Step = { _id: 2, type: "tool", name: "web_search", title: "", cmd: "q", out: "" };
    const { container } = render(<>{renderStep(step, ctx({ onToggle }))}</>);
    fireEvent.click(container.querySelector(".step-head .step-head-chev")!);
    expect(onToggle).toHaveBeenCalledWith(2);
  });

  test("clicking the skill header row toggles", () => {
    const onToggle = vi.fn();
    const step: Step = { _id: 4, type: "skill", name: "web_search", title: "", input: "q", output: "o" };
    render(<>{renderStep(step, ctx({ onToggle }))}</>);
    fireEvent.click(screen.getByText("web_search").closest(".step-head")!);
    expect(onToggle).toHaveBeenCalledWith(4);
  });

  test("text step shows the copy footer only when it's the run's last text", () => {
    const step: Step = { _id: 7, type: "text", text: "Final answer." };
    const { container: shown } = render(<>{renderStep(step, ctx({ lastTextId: 7 }))}</>);
    expect(shown.querySelector(".msg-actions")).toBeInTheDocument();
    cleanup();
    const { container: hidden } = render(<>{renderStep(step, ctx({ lastTextId: 9 }))}</>);
    expect(hidden.querySelector(".msg-actions")).toBeNull(); // intermediate text → no footer
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

  test("read step shows only the basename, opens with the full path", () => {
    const onOpenFile = vi.fn();
    const step: Step = { _id: 3, type: "read", file: "src/lib/foo.ts", lines: "1-18" };
    render(<>{renderStep(step, ctx({ onOpenFile }))}</>);
    expect(screen.getByText("foo.ts")).toBeInTheDocument();
    expect(screen.queryByText("src/lib/foo.ts")).toBeNull();
    fireEvent.click(screen.getByText("foo.ts"));
    expect(onOpenFile).toHaveBeenCalledWith("src/lib/foo.ts");
  });

  test("skill step shows name + IN/OUT sections", () => {
    const step: Step = { _id: 4, type: "skill", name: "web_search", title: { zh: "搜", en: "search" }, input: { zh: "q", en: "query" }, output: { zh: "o", en: "out" } };
    render(<>{renderStep(step, ctx())}</>);
    expect(screen.getByText("web_search")).toBeInTheDocument();
    expect(screen.getByText("IN")).toBeInTheDocument();
    expect(screen.getByText("OUT")).toBeInTheDocument();
  });
});
