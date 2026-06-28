/** Core UI types — mirror the kurt-bridge wire shapes (defined here, not imported
 *  from kurt-agent; the app talks to the bridge over HTTP). */

export type Lang = "zh" | "en";
export type Theme = "light" | "dark" | "system";
export type Effort = "low" | "med" | "high" | "max";
export type Mode = "chat" | "agent" | "plan";

/** A bilingual string (conversation content carries both; UI picks one via `tr`). */
export interface LocalizedString {
  zh: string;
  en: string;
}

/** A localizable field: bilingual fixtures use {zh,en}; live bridge steps use a
 *  plain string (single-language engine output). `tr()` handles both. */
export type Loc = LocalizedString | string;

/** One step in a thread. Discriminated union on `type`. `ts` is a client-side
 *  creation time (live runs only; not part of the bridge wire shape). */
export type Step = (
  | { _id: number; type: "user"; text: Loc }
  | { _id: number; type: "thinking"; sec?: number; text: Loc }
  | { _id: number; type: "text"; text: Loc }
  | { _id: number; type: "tool"; name: string; title: Loc; cmd: string; out: Loc; isError?: boolean }
  | { _id: number; type: "read"; file: string; lines: string }
  | { _id: number; type: "skill"; name: string; title: Loc; input?: Loc; output?: Loc; isError?: boolean }
) & { ts?: number };

/** A step before ids are assigned (mock fixtures / bridge payloads).
 *  Distributive Omit so each union member keeps its own fields (a plain
 *  Omit<Step,"_id"> would collapse to the common keys only). */
type WithoutId<T> = T extends unknown ? Omit<T, "_id"> : never;
export type RawStep = WithoutId<Step> & { _id?: number };

export interface SessionMeta {
  id: string;
  title: Loc;
  icon: string;
  /** Absolute workspace path for project grouping. */
  workspace?: string;
}

export interface Session extends SessionMeta {
  steps: RawStep[];
}

/** A detail side-panel (file preview or tool output). */
export interface Panel {
  id: string;
  type: "file" | "output";
  title: string;
  subtitle?: string;
  content: string;
  forceCode?: boolean;
}

/** Workspace tab kinds shown under the conversation title. `session` is the chat
 *  thread itself (always present, not closable). */
export type TabKind = "session" | "terminal" | "files" | "plan" | "preview";

/** How a preview tab renders its target. */
export type PreviewKind = "markdown" | "html" | "pdf" | "code" | "text" | "output";

/** One workspace tab. `meta` carries kind-specific payload. */
export interface Tab {
  id: string;
  kind: TabKind;
  title: string;
  closable: boolean;
  meta?: {
    /** preview: file path (also the read source) */
    file?: string;
    /** preview: how to render */
    previewKind?: PreviewKind;
    /** preview/output: inline content when not read from disk */
    content?: string;
    /** preview/output: secondary label */
    subtitle?: string;
    /** terminal/files: root directory (defaults to workspace) */
    cwd?: string;
  };
}

/** One pane's tab strip: its tabs + the active one. */
export interface TabGroup {
  tabs: Tab[];
  activeId: string;
}

/** Workspace tab layout: one or two editor groups (panes), each with its own tab
 *  strip; `focused` is the group new tabs land in. Two groups = a left/right split. */
export interface TabsState {
  groups: TabGroup[];
  focused: number;
}

/** A queued message (sent after the current run finishes). */
export interface QueuedMsg {
  id: number;
  text: string;
}
