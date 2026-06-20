/** Split layout host: renders each editor group as [its own tab strip] + [the
 *  active tab's pane]. One group = full width; two groups = side-by-side with a
 *  draggable divider. Pane content is supplied by the caller via `renderPane` (so
 *  the session pane can stay inline in App with all its state). */

import { Fragment, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { Lang, Tab, TabKind, TabsState } from "../../types.ts";
import { activeTab } from "../../lib/tabs.ts";
import { WorkspaceTabsBar } from "./WorkspaceTabs.tsx";

export function Workspace({ state, renderPane, lang, onActivate, onClose, onSplit, onUnsplit, onAdd }: {
  state: TabsState;
  renderPane: (tab: Tab) => ReactNode;
  lang: Lang;
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
  onSplit: (id: string) => void;
  onUnsplit: () => void;
  onAdd: (kind: TabKind, group: number) => void;
}) {
  const [ratio, setRatio] = useState(0.5);
  const hostRef = useRef<HTMLDivElement>(null);
  const split = state.groups.length > 1;

  const startDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    const host = hostRef.current;
    if (!host) return;
    const onMove = (ev: MouseEvent) => {
      const rect = host.getBoundingClientRect();
      setRatio(Math.min(0.8, Math.max(0.2, (ev.clientX - rect.left) / rect.width)));
    };
    const onUp = () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); document.body.classList.remove("dragging-col"); };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    document.body.classList.add("dragging-col");
  };

  return (
    <div className="workspace-split" ref={hostRef}>
      {state.groups.map((group, gi) => {
        const tab = activeTab(group);
        const flex = split ? (gi === 0 ? `0 0 ${ratio * 100}%` : "1 1 0") : "1 1 0";
        return (
          <Fragment key={gi}>
            {split && gi === 1 && <div className="ws-divider" onMouseDown={startDrag} />}
            <div className="ws-group" style={{ flex }}>
              <WorkspaceTabsBar
                group={group}
                groupCount={state.groups.length}
                focused={state.focused === gi}
                lang={lang}
                onActivate={onActivate}
                onClose={onClose}
                onSplit={onSplit}
                onUnsplit={onUnsplit}
                onAdd={(kind) => onAdd(kind, gi)}
              />
              <div className="ws-pane">{tab ? renderPane(tab) : null}</div>
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}
