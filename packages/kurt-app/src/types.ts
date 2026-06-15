/** Core UI types — mirror the kurt-bridge wire shapes (defined here, not imported
 *  from kurt-agent; the app talks to the bridge over HTTP). */

export type Lang = "zh" | "en";
export type Theme = "light" | "dark";

/** A bilingual string (conversation content carries both; UI picks one via `tr`). */
export interface LocalizedString {
  zh: string;
  en: string;
}

/** One step in a thread. Discriminated union on `type`. */
export type Step =
  | { _id: number; type: "user"; text: LocalizedString }
  | { _id: number; type: "thinking"; sec?: number; text: LocalizedString }
  | { _id: number; type: "text"; text: LocalizedString }
  | { _id: number; type: "tool"; name: string; title: LocalizedString; cmd: string; out: LocalizedString }
  | { _id: number; type: "read"; file: string; lines: string }
  | { _id: number; type: "skill"; name: string; title: LocalizedString; input?: LocalizedString; output?: LocalizedString };

/** A step before ids are assigned (mock fixtures / bridge payloads).
 *  Distributive Omit so each union member keeps its own fields (a plain
 *  Omit<Step,"_id"> would collapse to the common keys only). */
type WithoutId<T> = T extends unknown ? Omit<T, "_id"> : never;
export type RawStep = WithoutId<Step> & { _id?: number };

export interface SessionMeta {
  id: string;
  title: LocalizedString;
  icon: string;
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

/** A queued message (sent after the current run finishes). */
export interface QueuedMsg {
  id: number;
  text: string;
}
