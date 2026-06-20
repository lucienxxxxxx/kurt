/** Split layout host: renders the primary pane full-width, or primary | secondary
 *  side-by-side with a draggable divider when split. Pane content is supplied by
 *  the caller via `renderPane` (so the session pane can stay inline in App with
 *  all its state). */

import { useRef, useState } from "react";
import type { ReactNode } from "react";
import type { Tab, TabsState } from "../../types.ts";

export function Workspace({ state, renderPane }: { state: TabsState; renderPane: (tab: Tab) => ReactNode }) {
  const primary = state.tabs.find((t) => t.id === state.primaryId) ?? state.tabs[0]!;
  const secondary = state.secondaryId ? state.tabs.find((t) => t.id === state.secondaryId) ?? null : null;
  const [ratio, setRatio] = useState(0.5);
  const hostRef = useRef<HTMLDivElement>(null);

  const startDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    const host = hostRef.current;
    if (!host) return;
    const onMove = (ev: MouseEvent) => {
      const rect = host.getBoundingClientRect();
      const r = (ev.clientX - rect.left) / rect.width;
      setRatio(Math.min(0.8, Math.max(0.2, r)));
    };
    const onUp = () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); document.body.classList.remove("dragging-col"); };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    document.body.classList.add("dragging-col");
  };

  if (!secondary) {
    return <div className="workspace-split" ref={hostRef}><div className="ws-pane">{renderPane(primary)}</div></div>;
  }
  return (
    <div className="workspace-split" ref={hostRef}>
      <div className="ws-pane" style={{ flex: `0 0 ${ratio * 100}%` }}>{renderPane(primary)}</div>
      <div className="ws-divider" onMouseDown={startDrag} />
      <div className="ws-pane" style={{ flex: "1 1 0" }}>{renderPane(secondary)}</div>
    </div>
  );
}
