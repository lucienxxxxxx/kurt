/** The workspace tab bar shown under the conversation title: tab chips + a `+`
 *  dropdown (terminal / files / plan / preview) + a right-click context menu
 *  (split / close). Pure presentational — all state transitions go up via
 *  callbacks to App's tabs reducer. */

import { useEffect, useRef, useState } from "react";
import type { Lang, Tab, TabKind, TabsState } from "../../types.ts";
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

export function WorkspaceTabs({ state, lang, onActivate, onClose, onSplit, onUnsplit, onAdd }: {
  state: TabsState;
  lang: Lang;
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
  onSplit: (id: string) => void;
  onUnsplit: () => void;
  onAdd: (kind: TabKind) => void;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [ctx, setCtx] = useState<{ id: string; x: number; y: number } | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  // Close the menus on any outside click / Escape.
  useEffect(() => {
    if (!addOpen && !ctx) return;
    const close = () => { setAddOpen(false); setCtx(null); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("mousedown", close); window.removeEventListener("keydown", onKey); };
  }, [addOpen, ctx]);

  return (
    <div className="ws-tabs" ref={barRef}>
      {state.tabs.map((t) => {
        const visible = state.primaryId === t.id || state.secondaryId === t.id;
        const isSecondary = state.secondaryId === t.id;
        return (
          <div
            key={t.id}
            className={"ws-tab" + (visible ? " active" : "") + (isSecondary ? " split" : "")}
            onClick={() => onActivate(t.id)}
            onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setCtx({ id: t.id, x: e.clientX, y: e.clientY }); setAddOpen(false); }}
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
        );
      })}

      <div className="ws-add-wrap">
        <button className="ws-add" onClick={(e) => { e.stopPropagation(); setAddOpen((v) => !v); setCtx(null); }} title={tr(T.tabAdd, lang)} aria-label={tr(T.tabAdd, lang)}>
          <Icon name="plus" />
        </button>
        {addOpen && (
          <div className="ws-menu" onMouseDown={(e) => e.stopPropagation()}>
            {ADDABLE.map((k) => (
              <button key={k} className="ws-menu-item" onClick={() => { onAdd(k); setAddOpen(false); }}>
                <Icon name={KIND_ICON[k]} /> {tr(T[KIND_LABEL[k]], lang)}
              </button>
            ))}
          </div>
        )}
      </div>

      {ctx && (
        <div className="ws-menu ws-ctx" style={{ left: ctx.x, top: ctx.y }} onMouseDown={(e) => e.stopPropagation()}>
          {state.secondaryId === ctx.id ? (
            <button className="ws-menu-item" onClick={() => { onUnsplit(); setCtx(null); }}>
              <Icon name="split" /> {tr(T.tabUnsplit, lang)}
            </button>
          ) : (
            <button className="ws-menu-item" onClick={() => { onSplit(ctx.id); setCtx(null); }} disabled={state.tabs.length < 2}>
              <Icon name="split" /> {tr(T.tabSplit, lang)}
            </button>
          )}
          {(() => {
            const t = state.tabs.find((x) => x.id === ctx.id);
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

/** Label for a freshly created tab of a given kind. */
export function defaultTabTitle(kind: TabKind, lang: Lang): string {
  return tr(T[KIND_LABEL[kind]], lang);
}

export type { Tab };
