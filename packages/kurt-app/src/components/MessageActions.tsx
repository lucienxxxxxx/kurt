/** Small message-footer atoms: a background-less Copy button (also reused for
 *  code blocks) and a message timestamp. Kept tiny and presentational. */

import { useState } from "react";
import type { Lang } from "../types.ts";
import { T, tr } from "../i18n/strings.ts";
import { Icon } from "./Icon.tsx";

export function CopyButton({ text, lang, compact, className }: {
  text: string;
  lang: Lang;
  /** Icon-only (no label) — for code blocks. */
  compact?: boolean;
  className?: string;
}) {
  const [done, setDone] = useState(false);
  const copy = (e: React.MouseEvent): void => {
    e.stopPropagation();
    void navigator.clipboard?.writeText(text).then(() => {
      setDone(true);
      setTimeout(() => setDone(false), 1200);
    }).catch(() => { /* clipboard unavailable */ });
  };
  const label = tr(done ? T.copied : T.copy, lang);
  return (
    <button
      className={"msg-btn" + (compact ? " compact" : "") + (done ? " done" : "") + (className ? " " + className : "")}
      onClick={copy}
      title={label}
      aria-label={label}
    >
      <Icon name={done ? "check" : "copy"} />
      {!compact && <span className="msg-btn-label">{label}</span>}
    </button>
  );
}

/** A short HH:MM timestamp; renders nothing when no time is known (e.g. reloaded). */
export function MessageTime({ ts }: { ts?: number }) {
  if (!ts) return null;
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return <span className="msg-time">{hh}:{mm}</span>;
}
