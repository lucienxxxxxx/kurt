import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { Sidebar } from "./Sidebar.tsx";
import type { SessionMeta } from "../types.ts";

afterEach(cleanup);

const recents: SessionMeta[] = [
  { id: "s1", title: { zh: "整理下载", en: "Organize downloads" }, icon: "folder" },
  { id: "s2", title: { zh: "ESLint 问题", en: "ESLint issue" }, icon: "chat" },
];

function renderSidebar(over: Partial<Parameters<typeof Sidebar>[0]> = {}) {
  const props = {
    recents, activeId: "s1", runningId: null,
    onPick: vi.fn(), onNewChat: vi.fn(), onOpenSettings: vi.fn(), lang: "en" as const,
    ...over,
  };
  render(<Sidebar {...props} />);
  return props;
}

describe("Sidebar", () => {
  test("renders new-chat, projects, skills, and the recents in the active language", () => {
    renderSidebar();
    expect(screen.getByText("New chat")).toBeInTheDocument();
    expect(screen.getByText("Projects")).toBeInTheDocument();
    expect(screen.getByText("Skills")).toBeInTheDocument();
    expect(screen.getByText("Organize downloads")).toBeInTheDocument();
    expect(screen.getByText("ESLint issue")).toBeInTheDocument();
  });

  test("switches recents text with lang", () => {
    renderSidebar({ lang: "zh" });
    expect(screen.getByText("整理下载")).toBeInTheDocument();
  });

  test("clicking a recent calls onPick with its id; new chat calls onNewChat", () => {
    const props = renderSidebar();
    fireEvent.click(screen.getByText("ESLint issue"));
    expect(props.onPick).toHaveBeenCalledWith("s2");
    fireEvent.click(screen.getByText("New chat"));
    expect(props.onNewChat).toHaveBeenCalled();
  });
});
