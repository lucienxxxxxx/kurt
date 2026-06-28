import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { Sidebar } from "./Sidebar.tsx";
import type { SessionMeta } from "../types.ts";

afterEach(cleanup);

const recents: SessionMeta[] = [
  { id: "s1", title: { zh: "整理下载", en: "Organize downloads" }, icon: "folder", workspace: "/Users/me/komorebi" },
  { id: "s2", title: { zh: "ESLint 问题", en: "ESLint issue" }, icon: "chat", workspace: "/Users/me/komorebi" },
];

function renderSidebar(over: Partial<Parameters<typeof Sidebar>[0]> = {}) {
  const props = {
    recents, projects: [], activeId: "s1", runningIds: new Set<string>(), unread: new Set<string>(),
    onPick: vi.fn(), onDelete: vi.fn(), onNewChat: vi.fn(), onOpenSkills: vi.fn(), onOpenSettings: vi.fn(), lang: "en" as const,
    ...over,
  };
  render(<Sidebar {...props} />);
  return props;
}

/** The status dot lives just before the .r-label of a recent item. */
function statusDot(label: string): Element | null | undefined {
  return screen.getByText(label).closest(".recent-item")?.querySelector(".r-status");
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

  test("clicking skills opens the skills page", () => {
    const props = renderSidebar();
    fireEvent.click(screen.getByText("Skills"));
    expect(props.onOpenSkills).toHaveBeenCalled();
  });

  test("renders project groups as session submenus", () => {
    const projectSessions = [
      ...recents,
      { id: "s3", title: "Third task", icon: "chat", workspace: "/Users/me/komorebi" },
    ];
    const props = renderSidebar({
      recents: projectSessions,
      projects: [{ workspace: "/Users/me/komorebi", label: "komorebi", sessions: projectSessions }],
    });
    expect(screen.getByText("komorebi")).toBeInTheDocument();
    fireEvent.click(screen.getAllByText("Third task")[0]!);
    expect(props.onPick).toHaveBeenCalledWith("s3");
  });

  test("running session shows a pulsing status dot; a session with no status has no dot element", () => {
    renderSidebar({ runningIds: new Set(["s1"]) });
    expect(statusDot("Organize downloads")?.className).toContain("running");
    expect(statusDot("ESLint issue")).toBeNull(); // no status → not rendered (takes no space)
  });

  test("empty title renders the localized 'New chat' placeholder", () => {
    renderSidebar({ recents: [{ id: "s9", title: "", icon: "chat" }] });
    expect(document.querySelector(".recent-item .r-label")?.textContent).toBe("New chat");
  });

  test("unread session shows a solid status dot; running takes precedence", () => {
    renderSidebar({ runningIds: new Set(["s1"]), unread: new Set(["s1", "s2"]) });
    // s2 is only unread → unread dot
    expect(statusDot("ESLint issue")?.className).toContain("unread");
    // s1 is both running and unread → running wins
    expect(statusDot("Organize downloads")?.className).toContain("running");
    expect(statusDot("Organize downloads")?.className).not.toContain("unread");
  });

  test("delete menu: first click arms, second click calls onDelete with the id", () => {
    const props = renderSidebar();
    const item = screen.getByText("ESLint issue").closest(".recent-item")!;
    fireEvent.click(item.querySelector(".r-more")!); // open the … menu
    fireEvent.click(screen.getByText("Delete")); // arm
    expect(props.onDelete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Confirm delete")); // confirm
    expect(props.onDelete).toHaveBeenCalledWith("s2");
  });
});
