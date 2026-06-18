/** Ask panel — shown when the agent calls `ask_user`. Like the approval panel, it
 *  renders inline above the composer; the run blocks until the user answers (a
 *  chosen option, free-form text, or skip → ""). Posted back via the bridge /answer. */

import { useState } from "react";
import type { Lang } from "../types.ts";
import type { AskRequest } from "../lib/bridge.ts";
import { T, tr } from "../i18n/strings.ts";
import { Icon } from "./Icon.tsx";

const LETTERS = "ABCDEFGHIJ";

export function Ask({ req, lang, onAnswer }: {
  req: AskRequest;
  lang: Lang;
  onAnswer: (text: string) => void;
}) {
  const [text, setText] = useState("");
  const options = req.options ?? [];
  return (
    <div className="approval approval-inline ask-inline" role="dialog" aria-label={tr(T.askTitle, lang)}>
      <div className="approval-head">
        <span className="approval-badge"><Icon name="chat" /></span>
        <span className="approval-title">{tr(T.askTitle, lang)}</span>
      </div>
      <div className="ask-question">{req.question}</div>
      {options.length > 0 && (
        <div className="ask-options">
          {options.map((o, i) => (
            <button key={i} className="ask-option" onClick={() => onAnswer(o)}>
              <span className="ask-letter">{LETTERS[i] ?? "•"}</span>{o}
            </button>
          ))}
        </div>
      )}
      <div className="ask-form">
        <input
          className="ask-input" value={text} autoFocus spellCheck={false}
          placeholder={tr(T.askPlaceholder, lang)}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && text.trim()) onAnswer(text.trim()); }}
        />
        <button className="pill-btn ask-skip" onClick={() => onAnswer("")}>{tr(T.askSkip, lang)}</button>
        <button className="send-btn" disabled={!text.trim()} onClick={() => onAnswer(text.trim())} title={tr(T.send, lang)}>
          <Icon name="arrowUp" />
        </button>
      </div>
    </div>
  );
}
