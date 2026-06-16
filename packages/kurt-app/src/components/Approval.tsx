/** Approval panel — shown when the bridge requests permission for a sensitive
 *  command. NOT a modal: it renders inline, directly above the composer (same
 *  width / rounded corners), like a panel rising up from behind the input box.
 *  The decision is POSTed back via the bridge's /approve; the run blocks until then. */

import type { Lang } from "../types.ts";
import type { ApprovalRequest, ApprovalDecision } from "../lib/bridge.ts";
import { T, tr } from "../i18n/strings.ts";
import { Icon } from "./Icon.tsx";

export function Approval({ req, lang, onDecide }: {
  req: ApprovalRequest;
  lang: Lang;
  onDecide: (decision: ApprovalDecision) => void;
}) {
  return (
    <div className="approval approval-inline" role="dialog" aria-label={tr(T.apprNeeded, lang)}>
      <div className="approval-head">
        <span className="approval-badge"><Icon name="sliders" /></span>
        <span className="approval-title">{tr(T.apprNeeded, lang)}</span>
      </div>
      <div className="approval-subtitle">{req.title}</div>
      <pre className="approval-cmd">{req.command}</pre>
      {req.explanation && <div className="approval-explain">{req.explanation}</div>}
      <div className="approval-risk">⚠ {tr(T.apprRisk, lang)}: {req.risk}</div>
      <div className="approval-actions">
        <button className="pill-btn" onClick={() => onDecide("deny")}>{tr(T.apprDeny, lang)}</button>
        <div className="bar-spacer" />
        <button className="pill-btn" onClick={() => onDecide("always")}>{tr(T.apprAlways, lang)}</button>
        <button className="pill-btn approval-allow" onClick={() => onDecide("allow")}>
          <Icon name="check" />{tr(T.apprAllow, lang)}
        </button>
      </div>
    </div>
  );
}
