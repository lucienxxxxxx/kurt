/** Workspace tab state — a pure reducer driving an editor-group split: one or two
 *  panes, EACH with its own tab strip and active tab. A tab id is unique across
 *  groups (it lives in exactly one group), so most actions take just the id.
 *  Kept side-effect-free so it can be unit-tested directly. */

import type { Tab, TabGroup, TabsState } from "../types.ts";

/** The always-present chat tab. */
export const SESSION_TAB_ID = "session";

export function sessionTab(title: string): Tab {
  return { id: SESSION_TAB_ID, kind: "session", title, closable: false };
}

/** Fresh state: one group holding just the session tab. */
export function initTabs(sessionTitle: string): TabsState {
  return { groups: [{ tabs: [sessionTab(sessionTitle)], activeId: SESSION_TAB_ID }], focused: 0 };
}

export type TabsAction =
  | { type: "add"; tab: Tab; group?: number }   // add to a group (default: focused) + focus it
  | { type: "addSplit"; tab: Tab }              // open beside — in the second group (create it)
  | { type: "close"; id: string }              // remove (session tab is never removed)
  | { type: "activate"; id: string }           // make active in its group + focus that group
  | { type: "split"; id: string }              // move to the other pane (create a 2nd group)
  | { type: "unsplit" }                        // merge back to one group
  | { type: "update"; id: string; patch: Partial<Tab> };

/** Which group holds `id` (or -1). */
function groupOf(state: TabsState, id: string): number {
  return state.groups.findIndex((g) => g.tabs.some((t) => t.id === id));
}

/** Remove `id` from a group, fixing its active tab; returns the new group (or null
 *  if it became empty). */
function removeFrom(g: TabGroup, id: string): TabGroup | null {
  const idx = g.tabs.findIndex((t) => t.id === id);
  if (idx < 0) return g;
  const tabs = g.tabs.filter((t) => t.id !== id);
  if (tabs.length === 0) return null;
  const activeId = g.activeId === id ? (tabs[idx - 1] ?? tabs[0]!).id : g.activeId;
  return { tabs, activeId };
}

export function tabsReducer(state: TabsState, action: TabsAction): TabsState {
  switch (action.type) {
    case "add": {
      const at = groupOf(state, action.tab.id);
      if (at >= 0) {
        // Already open somewhere → refocus + replace its object.
        const groups = state.groups.map((g, i) =>
          i === at ? { tabs: g.tabs.map((t) => (t.id === action.tab.id ? action.tab : t)), activeId: action.tab.id } : g);
        return { groups, focused: at };
      }
      const target = action.group != null && action.group < state.groups.length ? action.group : state.focused;
      const groups = state.groups.map((g, i) => (i === target ? { tabs: [...g.tabs, action.tab], activeId: action.tab.id } : g));
      return { groups, focused: target };
    }

    case "addSplit": {
      const at = groupOf(state, action.tab.id);
      if (at >= 0) { // already open → just focus it where it lives
        const groups = state.groups.map((g, i) =>
          i === at ? { tabs: g.tabs.map((t) => (t.id === action.tab.id ? action.tab : t)), activeId: action.tab.id } : g);
        return { groups, focused: at };
      }
      if (state.groups.length === 1) {
        return { groups: [state.groups[0]!, { tabs: [action.tab], activeId: action.tab.id }], focused: 1 };
      }
      const groups = state.groups.map((g, i) => (i === 1 ? { tabs: [...g.tabs, action.tab], activeId: action.tab.id } : g));
      return { groups, focused: 1 };
    }

    case "activate": {
      const gi = groupOf(state, action.id);
      if (gi < 0) return state;
      const groups = state.groups.map((g, i) => (i === gi ? { ...g, activeId: action.id } : g));
      return { groups, focused: gi };
    }

    case "close": {
      if (action.id === SESSION_TAB_ID) return state; // session tab is permanent
      const gi = groupOf(state, action.id);
      if (gi < 0) return state;
      const next = removeFrom(state.groups[gi]!, action.id);
      if (next === null) {
        // group emptied → drop it (collapse the split)
        const groups = state.groups.filter((_, i) => i !== gi);
        return { groups, focused: 0 };
      }
      const groups = state.groups.map((g, i) => (i === gi ? next : g));
      return { ...state, groups };
    }

    case "split": {
      const gi = groupOf(state, action.id);
      if (gi < 0) return state;
      const tab = state.groups[gi]!.tabs.find((t) => t.id === action.id)!;
      if (state.groups.length === 1) {
        if (state.groups[0]!.tabs.length < 2) return state; // can't split a lone tab
        const left = removeFrom(state.groups[0]!, action.id)!;
        return { groups: [left, { tabs: [tab], activeId: tab.id }], focused: 1 };
      }
      // already split → move to the other pane
      const other = gi === 0 ? 1 : 0;
      const src = removeFrom(state.groups[gi]!, action.id);
      const dstTabs = [...state.groups[other]!.tabs, tab];
      const dst: TabGroup = { tabs: dstTabs, activeId: tab.id };
      if (src === null) return { groups: [dst], focused: 0 }; // source emptied → single group
      const groups = gi === 0 ? [src, dst] : [dst, src];
      return { groups, focused: groups.indexOf(dst) };
    }

    case "unsplit": {
      if (state.groups.length < 2) return state;
      const seen = new Set<string>();
      const tabs: Tab[] = [];
      for (const g of state.groups) for (const t of g.tabs) if (!seen.has(t.id)) { seen.add(t.id); tabs.push(t); }
      return { groups: [{ tabs, activeId: state.groups[0]!.activeId }], focused: 0 };
    }

    case "update": {
      const groups = state.groups.map((g) => ({
        ...g,
        tabs: g.tabs.map((t) => (t.id === action.id ? { ...t, ...action.patch, meta: action.patch.meta ? { ...t.meta, ...action.patch.meta } : t.meta } : t)),
      }));
      return { ...state, groups };
    }

    default:
      return state;
  }
}

/** The active tab of a group. */
export function activeTab(group: TabGroup): Tab | undefined {
  return group.tabs.find((t) => t.id === group.activeId);
}

/** Is this tab the active tab of any group (i.e. currently visible)? */
export function isVisible(state: TabsState, id: string): boolean {
  return state.groups.some((g) => g.activeId === id);
}
