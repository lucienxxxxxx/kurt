import { describe, expect, test } from "vitest";
import { initTabs, tabsReducer, isVisible, SESSION_TAB_ID } from "./tabs.ts";
import type { Tab } from "../types.ts";

const tab = (id: string, kind: Tab["kind"] = "files"): Tab => ({ id, kind, title: id, closable: true });

describe("tabsReducer", () => {
  test("init has one non-closable session tab, primary=session, no split", () => {
    const s = initTabs("会话");
    expect(s.tabs).toHaveLength(1);
    expect(s.tabs[0]).toMatchObject({ id: SESSION_TAB_ID, kind: "session", closable: false });
    expect(s.primaryId).toBe(SESSION_TAB_ID);
    expect(s.secondaryId).toBeNull();
  });

  test("add appends and focuses the new tab in the primary pane", () => {
    const s = tabsReducer(initTabs("会话"), { type: "add", tab: tab("t1") });
    expect(s.tabs.map((t) => t.id)).toEqual([SESSION_TAB_ID, "t1"]);
    expect(s.primaryId).toBe("t1");
  });

  test("add is idempotent on id — re-focuses instead of duplicating", () => {
    let s = tabsReducer(initTabs("会话"), { type: "add", tab: tab("files") });
    s = tabsReducer(s, { type: "activate", id: SESSION_TAB_ID });
    s = tabsReducer(s, { type: "add", tab: tab("files") });
    expect(s.tabs.filter((t) => t.id === "files")).toHaveLength(1);
    expect(s.primaryId).toBe("files");
  });

  test("activate changes the primary pane", () => {
    let s = tabsReducer(initTabs("会话"), { type: "add", tab: tab("t1") });
    s = tabsReducer(s, { type: "activate", id: SESSION_TAB_ID });
    expect(s.primaryId).toBe(SESSION_TAB_ID);
  });

  test("split shows a second tab in the right pane (two distinct panes)", () => {
    let s = tabsReducer(initTabs("会话"), { type: "add", tab: tab("t1") }); // primary=t1
    s = tabsReducer(s, { type: "split", id: SESSION_TAB_ID });
    expect(s.primaryId).toBe("t1");
    expect(s.secondaryId).toBe(SESSION_TAB_ID);
    expect(isVisible(s, "t1")).toBe(true);
    expect(isVisible(s, SESSION_TAB_ID)).toBe(true);
  });

  test("split cannot split a single tab against itself", () => {
    const s = tabsReducer(initTabs("会话"), { type: "split", id: SESSION_TAB_ID });
    expect(s.secondaryId).toBeNull();
  });

  test("splitting the current primary moves primary to a neighbour", () => {
    let s = tabsReducer(initTabs("会话"), { type: "add", tab: tab("t1") }); // primary=t1
    s = tabsReducer(s, { type: "split", id: "t1" }); // split the primary itself
    expect(s.secondaryId).toBe("t1");
    expect(s.primaryId).not.toBe("t1");
  });

  test("activating the split tab collapses the split", () => {
    let s = tabsReducer(initTabs("会话"), { type: "add", tab: tab("t1") });
    s = tabsReducer(s, { type: "split", id: SESSION_TAB_ID }); // secondary=session
    s = tabsReducer(s, { type: "activate", id: SESSION_TAB_ID });
    expect(s.primaryId).toBe(SESSION_TAB_ID);
    expect(s.secondaryId).toBeNull();
  });

  test("unsplit collapses to a single pane", () => {
    let s = tabsReducer(initTabs("会话"), { type: "add", tab: tab("t1") });
    s = tabsReducer(s, { type: "split", id: SESSION_TAB_ID });
    s = tabsReducer(s, { type: "unsplit" });
    expect(s.secondaryId).toBeNull();
  });

  test("close removes a tab and falls back to the left neighbour", () => {
    let s = tabsReducer(initTabs("会话"), { type: "add", tab: tab("t1") });
    s = tabsReducer(s, { type: "add", tab: tab("t2") }); // [session, t1, t2], primary=t2
    s = tabsReducer(s, { type: "close", id: "t2" });
    expect(s.tabs.map((t) => t.id)).toEqual([SESSION_TAB_ID, "t1"]);
    expect(s.primaryId).toBe("t1");
  });

  test("closing the split tab clears the split", () => {
    let s = tabsReducer(initTabs("会话"), { type: "add", tab: tab("t1") });
    s = tabsReducer(s, { type: "split", id: SESSION_TAB_ID }); // secondary=session... can't close session
    s = tabsReducer(s, { type: "activate", id: SESSION_TAB_ID }); // reset
    s = tabsReducer(s, { type: "add", tab: tab("t2") });
    s = tabsReducer(s, { type: "split", id: "t1" }); // secondary=t1
    s = tabsReducer(s, { type: "close", id: "t1" });
    expect(s.secondaryId).toBeNull();
  });

  test("the session tab cannot be closed", () => {
    const s = tabsReducer(initTabs("会话"), { type: "close", id: SESSION_TAB_ID });
    expect(s.tabs.some((t) => t.id === SESSION_TAB_ID)).toBe(true);
  });

  test("update patches title and merges meta", () => {
    let s = tabsReducer(initTabs("会话"), { type: "add", tab: { id: "p", kind: "preview", title: "a", closable: true, meta: { file: "x" } } });
    s = tabsReducer(s, { type: "update", id: "p", patch: { title: "b", meta: { previewKind: "markdown" } } });
    const p = s.tabs.find((t) => t.id === "p")!;
    expect(p.title).toBe("b");
    expect(p.meta).toEqual({ file: "x", previewKind: "markdown" });
  });
});
