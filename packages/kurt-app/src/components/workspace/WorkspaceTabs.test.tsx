import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { WorkspaceTabs } from "./WorkspaceTabs.tsx";
import { initTabs } from "../../lib/tabs.ts";
import type { TabsState } from "../../types.ts";

afterEach(cleanup);

const base = (): TabsState => ({
  ...initTabs("会话"),
  tabs: [
    { id: "session", kind: "session", title: "会话", closable: false },
    { id: "files", kind: "files", title: "文件", closable: true },
  ],
});

const handlers = () => ({ onActivate: vi.fn(), onClose: vi.fn(), onSplit: vi.fn(), onUnsplit: vi.fn(), onAdd: vi.fn() });

describe("WorkspaceTabs", () => {
  test("renders every tab; clicking one activates it", () => {
    const h = handlers();
    render(<WorkspaceTabs state={base()} lang="zh" {...h} />);
    fireEvent.click(screen.getByText("文件"));
    expect(h.onActivate).toHaveBeenCalledWith("files");
  });

  test("the + menu offers terminal/files/plan/preview and adds the chosen kind", () => {
    const h = handlers();
    render(<WorkspaceTabs state={base()} lang="zh" {...h} />);
    fireEvent.click(screen.getByLabelText("新建标签"));
    fireEvent.click(screen.getByText("终端"));
    expect(h.onAdd).toHaveBeenCalledWith("terminal");
  });

  test("right-click → split calls onSplit", () => {
    const h = handlers();
    render(<WorkspaceTabs state={base()} lang="zh" {...h} />);
    fireEvent.contextMenu(screen.getByText("文件"));
    fireEvent.click(screen.getByText("分屏"));
    expect(h.onSplit).toHaveBeenCalledWith("files");
  });

  test("right-clicking the split tab offers Unsplit", () => {
    const h = handlers();
    const state = { ...base(), secondaryId: "files" };
    render(<WorkspaceTabs state={state} lang="zh" {...h} />);
    fireEvent.contextMenu(screen.getByText("文件"));
    fireEvent.click(screen.getByText("取消分屏"));
    expect(h.onUnsplit).toHaveBeenCalled();
  });

  test("the session tab has no close button (not closable)", () => {
    const h = handlers();
    render(<WorkspaceTabs state={base()} lang="zh" {...h} />);
    // only the files tab is closable → exactly one close button
    expect(screen.getAllByLabelText("关闭")).toHaveLength(1);
  });
});
