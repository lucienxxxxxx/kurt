import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { WorkspaceTabsBar } from "./WorkspaceTabs.tsx";
import type { TabGroup } from "../../types.ts";

afterEach(cleanup);

const group = (): TabGroup => ({
  tabs: [
    { id: "session", kind: "session", title: "会话", closable: false },
    { id: "files", kind: "files", title: "文件", closable: true },
  ],
  activeId: "session",
});

const handlers = () => ({ onActivate: vi.fn(), onClose: vi.fn(), onSplit: vi.fn(), onUnsplit: vi.fn(), onAdd: vi.fn() });

describe("WorkspaceTabsBar", () => {
  test("renders the group's tabs; clicking one activates it", () => {
    const h = handlers();
    render(<WorkspaceTabsBar group={group()} groupCount={1} focused lang="zh" {...h} />);
    fireEvent.click(screen.getByText("文件"));
    expect(h.onActivate).toHaveBeenCalledWith("files");
  });

  test("the + menu adds the chosen kind", () => {
    const h = handlers();
    render(<WorkspaceTabsBar group={group()} groupCount={1} focused lang="zh" {...h} />);
    fireEvent.click(screen.getByLabelText("新建标签"));
    fireEvent.click(screen.getByText("终端"));
    expect(h.onAdd).toHaveBeenCalledWith("terminal");
  });

  test("right-click → split (single group) calls onSplit", () => {
    const h = handlers();
    render(<WorkspaceTabsBar group={group()} groupCount={1} focused lang="zh" {...h} />);
    fireEvent.contextMenu(screen.getByText("文件"));
    fireEvent.click(screen.getByText("分屏"));
    expect(h.onSplit).toHaveBeenCalledWith("files");
  });

  test("when split, the menu offers Move-to-other + Unsplit", () => {
    const h = handlers();
    render(<WorkspaceTabsBar group={group()} groupCount={2} focused lang="zh" {...h} />);
    fireEvent.contextMenu(screen.getByText("文件"));
    expect(screen.getByText("移到另一侧")).toBeInTheDocument();
    fireEvent.click(screen.getByText("取消分屏"));
    expect(h.onUnsplit).toHaveBeenCalled();
  });

  test("the session tab has no close button (not closable)", () => {
    const h = handlers();
    render(<WorkspaceTabsBar group={group()} groupCount={1} focused lang="zh" {...h} />);
    expect(screen.getAllByLabelText("关闭")).toHaveLength(1); // only the files tab
  });
});
