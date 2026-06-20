import { describe, expect, test } from "vitest";
import { initTabs, tabsReducer, activeTab, isVisible, SESSION_TAB_ID } from "./tabs.ts";
import type { Tab, TabsState } from "../types.ts";

const tab = (id: string, kind: Tab["kind"] = "files"): Tab => ({ id, kind, title: id, closable: true });
const ids = (s: TabsState, g: number) => s.groups[g]!.tabs.map((t) => t.id);

describe("tabsReducer (editor groups)", () => {
  test("init: one group with the non-closable session tab", () => {
    const s = initTabs("会话");
    expect(s.groups).toHaveLength(1);
    expect(ids(s, 0)).toEqual([SESSION_TAB_ID]);
    expect(s.groups[0]!.activeId).toBe(SESSION_TAB_ID);
    expect(s.focused).toBe(0);
  });

  test("add appends to the focused group and activates it", () => {
    const s = tabsReducer(initTabs("会话"), { type: "add", tab: tab("t1") });
    expect(ids(s, 0)).toEqual([SESSION_TAB_ID, "t1"]);
    expect(s.groups[0]!.activeId).toBe("t1");
  });

  test("add is idempotent on id — refocuses where it already lives", () => {
    let s = tabsReducer(initTabs("会话"), { type: "add", tab: tab("files") });
    s = tabsReducer(s, { type: "activate", id: SESSION_TAB_ID });
    s = tabsReducer(s, { type: "add", tab: tab("files") });
    expect(s.groups[0]!.tabs.filter((t) => t.id === "files")).toHaveLength(1);
    expect(s.groups[0]!.activeId).toBe("files");
  });

  test("split moves a tab into a new second group (its own strip)", () => {
    let s = tabsReducer(initTabs("会话"), { type: "add", tab: tab("t1") }); // group0: [session, t1]
    s = tabsReducer(s, { type: "split", id: "t1" });
    expect(s.groups).toHaveLength(2);
    expect(ids(s, 0)).toEqual([SESSION_TAB_ID]); // t1 left group 0
    expect(ids(s, 1)).toEqual(["t1"]);
    expect(s.focused).toBe(1);
    expect(isVisible(s, SESSION_TAB_ID)).toBe(true);
    expect(isVisible(s, "t1")).toBe(true);
  });

  test("split is refused for a lone tab (nothing to leave behind)", () => {
    const s = tabsReducer(initTabs("会话"), { type: "split", id: SESSION_TAB_ID });
    expect(s.groups).toHaveLength(1);
  });

  test("split on an already-split tab moves it to the other pane", () => {
    let s = tabsReducer(initTabs("会话"), { type: "add", tab: tab("t1") });
    s = tabsReducer(s, { type: "add", tab: tab("t2") });   // group0: [session, t1, t2]
    s = tabsReducer(s, { type: "split", id: "t2" });        // group1: [t2]
    s = tabsReducer(s, { type: "split", id: "t1" });        // move t1 → group1
    expect(ids(s, 0)).toEqual([SESSION_TAB_ID]);
    expect(ids(s, 1)).toEqual(["t2", "t1"]);
  });

  test("addSplit opens a tab beside (second group), creating it", () => {
    const s = tabsReducer(initTabs("会话"), { type: "addSplit", tab: tab("prev", "preview") });
    expect(s.groups).toHaveLength(2);
    expect(ids(s, 1)).toEqual(["prev"]);
    expect(s.focused).toBe(1);
  });

  test("addSplit into an existing second group appends there", () => {
    let s = tabsReducer(initTabs("会话"), { type: "addSplit", tab: tab("a", "preview") });
    s = tabsReducer(s, { type: "addSplit", tab: tab("b", "preview") });
    expect(ids(s, 1)).toEqual(["a", "b"]);
  });

  test("activate focuses the group that holds the tab", () => {
    let s = tabsReducer(initTabs("会话"), { type: "add", tab: tab("t1") });
    s = tabsReducer(s, { type: "split", id: "t1" }); // group1 focused
    s = tabsReducer(s, { type: "activate", id: SESSION_TAB_ID });
    expect(s.focused).toBe(0);
    expect(s.groups[0]!.activeId).toBe(SESSION_TAB_ID);
  });

  test("closing the last tab of a group collapses the split", () => {
    let s = tabsReducer(initTabs("会话"), { type: "add", tab: tab("t1") });
    s = tabsReducer(s, { type: "split", id: "t1" });  // group1: [t1]
    s = tabsReducer(s, { type: "close", id: "t1" });
    expect(s.groups).toHaveLength(1);
    expect(ids(s, 0)).toEqual([SESSION_TAB_ID]);
  });

  test("close falls back to the left neighbour within a group", () => {
    let s = tabsReducer(initTabs("会话"), { type: "add", tab: tab("t1") });
    s = tabsReducer(s, { type: "add", tab: tab("t2") }); // active t2
    s = tabsReducer(s, { type: "close", id: "t2" });
    expect(ids(s, 0)).toEqual([SESSION_TAB_ID, "t1"]);
    expect(s.groups[0]!.activeId).toBe("t1");
  });

  test("the session tab cannot be closed", () => {
    const s = tabsReducer(initTabs("会话"), { type: "close", id: SESSION_TAB_ID });
    expect(ids(s, 0)).toContain(SESSION_TAB_ID);
  });

  test("unsplit merges the second group back into the first", () => {
    let s = tabsReducer(initTabs("会话"), { type: "add", tab: tab("t1") });
    s = tabsReducer(s, { type: "split", id: "t1" });
    s = tabsReducer(s, { type: "unsplit" });
    expect(s.groups).toHaveLength(1);
    expect(ids(s, 0)).toEqual([SESSION_TAB_ID, "t1"]);
  });

  test("update patches a tab wherever it lives and merges meta", () => {
    let s = tabsReducer(initTabs("会话"), { type: "addSplit", tab: { id: "p", kind: "preview", title: "a", closable: true, meta: { file: "x" } } });
    s = tabsReducer(s, { type: "update", id: "p", patch: { title: "b", meta: { previewKind: "markdown" } } });
    const p = s.groups[1]!.tabs.find((t) => t.id === "p")!;
    expect(p.title).toBe("b");
    expect(p.meta).toEqual({ file: "x", previewKind: "markdown" });
  });

  test("activeTab returns the group's active tab", () => {
    const s = tabsReducer(initTabs("会话"), { type: "add", tab: tab("t1") });
    expect(activeTab(s.groups[0]!)!.id).toBe("t1");
  });
});
