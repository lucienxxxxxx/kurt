/** Workspace tab state — a pure reducer driving the tab bar + left/right split.
 *  Kept side-effect-free so it can be unit-tested directly (callers supply tab
 *  ids, so transitions are deterministic). */

import type { Tab, TabsState } from "../types.ts";

/** The always-present chat tab. */
export const SESSION_TAB_ID = "session";

export function sessionTab(title: string): Tab {
  return { id: SESSION_TAB_ID, kind: "session", title, closable: false };
}

/** Fresh state: just the session tab, no split. */
export function initTabs(sessionTitle: string): TabsState {
  return { tabs: [sessionTab(sessionTitle)], primaryId: SESSION_TAB_ID, secondaryId: null };
}

export type TabsAction =
  | { type: "add"; tab: Tab }              // append + focus in the primary pane
  | { type: "close"; id: string }          // remove (session tab is never removed)
  | { type: "activate"; id: string }       // show in the primary pane
  | { type: "split"; id: string }          // show in the right (secondary) pane
  | { type: "unsplit" }                    // collapse back to a single pane
  | { type: "update"; id: string; patch: Partial<Tab> }; // patch title/meta

export function tabsReducer(state: TabsState, action: TabsAction): TabsState {
  switch (action.type) {
    case "add": {
      // Re-focus an existing tab with the same id instead of duplicating it.
      const exists = state.tabs.some((t) => t.id === action.tab.id);
      const tabs = exists ? state.tabs.map((t) => (t.id === action.tab.id ? action.tab : t)) : [...state.tabs, action.tab];
      return { ...state, tabs, primaryId: action.tab.id, secondaryId: state.secondaryId === action.tab.id ? null : state.secondaryId };
    }

    case "activate": {
      if (!state.tabs.some((t) => t.id === action.id)) return state;
      // Activating the split tab brings it back to the single main pane.
      return { ...state, primaryId: action.id, secondaryId: state.secondaryId === action.id ? null : state.secondaryId };
    }

    case "split": {
      if (!state.tabs.some((t) => t.id === action.id)) return state;
      if (state.tabs.length < 2) return state; // nothing to split against
      if (action.id === state.primaryId) {
        // Split a tab that's already the main pane: move primary to a neighbour.
        const other = state.tabs.find((t) => t.id !== action.id);
        return other ? { ...state, primaryId: other.id, secondaryId: action.id } : state;
      }
      return { ...state, secondaryId: action.id };
    }

    case "unsplit":
      return state.secondaryId === null ? state : { ...state, secondaryId: null };

    case "close": {
      if (action.id === SESSION_TAB_ID) return state; // session tab is permanent
      if (!state.tabs.some((t) => t.id === action.id)) return state;
      const idx = state.tabs.findIndex((t) => t.id === action.id);
      const tabs = state.tabs.filter((t) => t.id !== action.id);
      let primaryId = state.primaryId;
      if (primaryId === action.id) {
        // Fall back to the neighbour to the left (or the new first tab).
        primaryId = (tabs[idx - 1] ?? tabs[0]!).id;
      }
      const secondaryId = state.secondaryId === action.id ? null : state.secondaryId;
      return { tabs, primaryId, secondaryId };
    }

    case "update": {
      const tabs = state.tabs.map((t) => (t.id === action.id ? { ...t, ...action.patch, meta: action.patch.meta ? { ...t.meta, ...action.patch.meta } : t.meta } : t));
      return { ...state, tabs };
    }

    default:
      return state;
  }
}

/** Is this tab currently visible (in either pane)? */
export function isVisible(state: TabsState, id: string): boolean {
  return state.primaryId === id || state.secondaryId === id;
}
