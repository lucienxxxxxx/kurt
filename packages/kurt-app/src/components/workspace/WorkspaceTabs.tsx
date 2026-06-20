/** One pane's tab strip: its tabs + a `+` dropdown (terminal/files/plan/preview)
 *  + a right-click context menu (split / move to other pane / unsplit / close).
 *  One of these renders above each editor group. Pure presentational. */

import { useEffect, useState } from "react";
import type { Lang, TabGroup, TabKind } from "../../types.ts";
import { T, tr } from "../../i18n/strings.ts";
import { Icon } from "../Icon.tsx";

const KIND_ICON: Record<TabKind, string> = {
  session: "chat",
  terminal: "terminal",
  files: "folder",
  plan: "list",
  preview: "eye",
};

/** Kinds offered by the `+` menu (session is permanent, not creatable). */
const ADDABLE: TabKind[] = ["terminal", "files", "plan", "preview"];
const KIND_LABEL: Record<TabKind, keyof typeof T> = {
  session: "tabSession",
  terminal: "tabTerminal",
  files: "tabFiles",
  plan: "tabPlan",
  preview: "tabPreview",
};

export function WorkspaceTabsBar({ group, groupCount, focused, lang, onActivate, onClose, onSplit, onUnsplit, onAdd }: {
  group: TabGroup;
  groupCount: number;
  focused: boolean;
  lang: Lang;
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
  onSplit: (id: string) => void;
  onUnsplit: () => void;
  onAdd: (kind: TabKind) => void;
}) {
  const [addPos, setAddPos] = useState<{ x: number; y: number } | null>(null);
  const [ctx, setCtx] = useState<{ id: string; x: number; y: number } | null>(null);

  useEffect(() => {
    if (!addPos && !ctx) return;
    const close = () => { setAddPos(null); setCtx(null); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("mousedown", close); window.removeEventListener("keydown", onKey); };
  }, [addPos, ctx]);

  const canSplit = groupCount > 1 || group.tabs.length > 1; // need something to leave behind

  return (
    <div className={"ws-tabs" + (focused ? " focused" : "")}>
      {group.tabs.map((t) => (
        <div
          key={t.id}
          className={"ws-tab" + (group.activeId === t.id ? " active" : "")}
          onClick={() => onActivate(t.id)}
          onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setCtx({ id: t.id, x: e.clientX, y: e.clientY }); setAddPos(null); }}
          title={t.title}
        >
          <Icon name={KIND_ICON[t.kind]} className="ws-tab-icon" />
          <span className="ws-tab-label">{t.title}</span>
          {t.closable && (
            <button className="ws-tab-close" onClick={(e) => { e.stopPropagation(); onClose(t.id); }} aria-label={tr(T.close, lang)}>
              <Icon name="x" />
            </button>
          )}
        </div>
      ))}

      <div className="ws-add-wrap">
        <button className="ws-add" onClick={(e) => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); setAddPos(addPos ? null : { x: r.left, y: r.bottom + 4 }); setCtx(null); }} title={tr(T.tabAdd, lang)} aria-label={tr(T.tabAdd, lang)}>
          <Icon name="plus" />
        </button>
        {addPos && (
          <div className="ws-menu ws-ctx" style={{ left: addPos.x, top: addPos.y }} onMouseDown={(e) => e.stopPropagation()}>
            {ADDABLE.map((k) => (
              <button key={k} className="ws-menu-item" onClick={() => { onAdd(k); setAddPos(null); }}>
                <Icon name={KIND_ICON[k]} /> {tr(T[KIND_LABEL[k]], lang)}
              </button>
            ))}
          </div>
        )}
      </div>

      {ctx && (
        <div className="ws-menu ws-ctx" style={{ left: ctx.x, top: ctx.y }} onMouseDown={(e) => e.stopPropagation()}>
          <button className="ws-menu-item" onClick={() => { onSplit(ctx.id); setCtx(null); }} disabled={!canSplit}>
            <Icon name="split" /> {tr(groupCount > 1 ? T.tabMoveOther : T.tabSplit, lang)}
          </button>
          {groupCount > 1 && (
            <button className="ws-menu-item" onClick={() => { onUnsplit(); setCtx(null); }}>
              <Icon name="split" /> {tr(T.tabUnsplit, lang)}
            </button>
          )}
          {(() => {
            const t = group.tabs.find((x) => x.id === ctx.id);
            return t && t.closable ? (
              <button className="ws-menu-item" onClick={() => { onClose(ctx.id); setCtx(null); }}>
                <Icon name="x" /> {tr(T.close, lang)}
              </button>
            ) : null;
          })()}
        </div>
      )}
    </div>
  );
}
