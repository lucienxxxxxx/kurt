/** Detail side-panel (ported from prototype/ui.jsx): multi-tab file/output
 *  preview that slides in on the right. */

import type { Lang, Panel } from "../types.ts";
import { T, tr } from "../i18n/strings.ts";
import { Icon } from "./Icon.tsx";
import { MdBlock } from "./Markdown.tsx";

export function DetailPanel({ panels, activePanelId, onSetActive, onClose, lang }: {
  panels: Panel[];
  activePanelId: string | null;
  onSetActive: (id: string) => void;
  onClose: (id: string) => void;
  lang: Lang;
}) {
  if (!panels.length) return null;
  const active = panels.find((p) => p.id === activePanelId) ?? panels[0]!;
  const showTabs = panels.length > 1;
  const isCode = active.forceCode ?? false;

  return (
    <div className="detail-panel">
      {showTabs && (
        <div className="dp-tabs">
          {panels.map((p) => (
            <button key={p.id} className={"dp-tab" + (p.id === active.id ? " active" : "")} onClick={() => onSetActive(p.id)}>
              <span>{p.title}</span>
              <span className="dp-tab-close" onClick={(e) => { e.stopPropagation(); onClose(p.id); }}><Icon name="x" /></span>
            </button>
          ))}
        </div>
      )}
      <div className="dp-head">
        <span className="dp-title">{active.title}</span>
        {active.subtitle && <span className="dp-subtitle">{active.subtitle}</span>}
        <button className="icon-btn" style={{ marginLeft: "auto" }} onClick={() => onClose(active.id)} title={tr(T.close, lang)}>
          <Icon name="x" />
        </button>
      </div>
      <div className="dp-body">
        {isCode ? (
          <pre className="fp-code"><code>{active.content || "// (empty)"}</code></pre>
        ) : (
          <div className="fp-md"><MdBlock text={active.content || "(empty)"} lang={lang} /></div>
        )}
      </div>
    </div>
  );
}
