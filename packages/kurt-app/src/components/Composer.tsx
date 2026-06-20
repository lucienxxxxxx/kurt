/** Composer + its menus (ported from prototype/ui.jsx): textarea, +/model/effort
 *  dropdowns, voice, send/stop, and the queued-message timeline. Menu values are
 *  local for 6.1; wired to real config in 6.3. */

import { useEffect, useRef, useState } from "react";
import type { Effort, Lang, Mode, QueuedMsg } from "../types.ts";
import { T, tr } from "../i18n/strings.ts";
import { Icon } from "./Icon.tsx";
import { ModelLogo } from "./ModelLogo.tsx";

/** A dropdown that opens UPWARD from its trigger. Rendered position:fixed (anchored
 *  to the button) so it escapes the workspace panes' `overflow:hidden` clipping;
 *  horizontally clamped to stay on-screen. */
function MenuPopover({ open, title, anchorRef, children }: { open: boolean; title?: string; anchorRef: React.RefObject<HTMLButtonElement | null>; children: React.ReactNode }) {
  if (!open) return null;
  const r = anchorRef.current?.getBoundingClientRect();
  const style: React.CSSProperties = r
    ? { position: "fixed", bottom: window.innerHeight - r.top + 6, left: Math.min(r.left, window.innerWidth - 250) }
    : { position: "absolute", bottom: 40, left: 0 };
  return (
    <div className="menu" style={style}>
      {title && <div className="menu-title">{title}</div>}
      {children}
    </div>
  );
}

function PlusMenu({ lang, open, onToggle }: { lang: Lang; open: boolean; onToggle: () => void }) {
  const btnRef = useRef<HTMLButtonElement>(null);
  return (
    <div style={{ position: "relative" }} onClick={(e) => e.stopPropagation()}>
      <button ref={btnRef} className="pill-btn ghost" onClick={onToggle}><Icon name="plus" /></button>
      <MenuPopover open={open} anchorRef={btnRef} title={tr(T.menuAdd, lang)}>
        <div className="menu-item" onClick={onToggle}><Icon name="paperclip" />{tr(T.addAttach, lang)}</div>
        <div className="menu-item" onClick={onToggle}><Icon name="folder" />{tr(T.chooseFolder, lang)}</div>
        <div className="menu-item" onClick={onToggle}><Icon name="globe" />{tr(T.pasteUrl, lang)}</div>
      </MenuPopover>
    </div>
  );
}

function ModelMenu({ value, options, onChange, open, onToggle, thinking, onThinkingToggle, lang }: {
  value: string; options: string[]; onChange: (v: string) => void; open: boolean; onToggle: () => void;
  thinking: boolean; onThinkingToggle: () => void; lang: Lang;
}) {
  const opts = options.length ? options : [value];
  const btnRef = useRef<HTMLButtonElement>(null);
  return (
    <div style={{ position: "relative" }} onClick={(e) => e.stopPropagation()}>
      <button ref={btnRef} className="pill-btn" onClick={onToggle}>
        <ModelLogo model={value} />{value}<Icon name="chevD" className="chev" />
      </button>
      <MenuPopover open={open} anchorRef={btnRef} title={tr(T.menuModel, lang)}>
        {opts.map((m) => (
          <div key={m} className={"menu-item" + (m === value ? " sel" : "")} onClick={() => { onChange(m); onToggle(); }}>
            <ModelLogo model={m} />{m}
            {m === value && <span style={{ marginLeft: "auto" }}><Icon name="check" /></span>}
          </div>
        ))}
        <div className="menu-sep" />
        {/* thinking-mode toggle — stays open on click so the switch flips in place */}
        <div className="menu-item switch-row" role="switch" aria-checked={thinking} onClick={() => onThinkingToggle()}>
          <Icon name="spark" />{tr(T.thinkingLabel, lang)}
          <span className={"switch" + (thinking ? " on" : "")}><span className="switch-knob" /></span>
        </div>
      </MenuPopover>
    </div>
  );
}

function EffortMenu({ value, onChange, lang, open, onToggle }: { value: Effort; onChange: (v: Effort) => void; lang: Lang; open: boolean; onToggle: () => void }) {
  const label = (k: Effort) => ({ low: tr(T.effortLow, lang), med: tr(T.effortMed, lang), high: tr(T.effortHigh, lang), max: tr(T.effortMax, lang) })[k];
  const btnRef = useRef<HTMLButtonElement>(null);
  return (
    <div style={{ position: "relative" }} onClick={(e) => e.stopPropagation()}>
      <button ref={btnRef} className="pill-btn" onClick={onToggle}>
        <Icon name="sliders" />{label(value)}<Icon name="chevD" className="chev" />
      </button>
      <MenuPopover open={open} anchorRef={btnRef} title={tr(T.menuEffort, lang)}>
        {(["low", "med", "high", "max"] as Effort[]).map((k) => (
          <div key={k} className={"menu-item" + (k === value ? " sel" : "")} onClick={() => { onChange(k); onToggle(); }}>
            <Icon name="sliders" />{label(k)}{k === "max" ? tr(T.effortMaxNote, lang) : ""}
          </div>
        ))}
      </MenuPopover>
    </div>
  );
}

function ModeMenu({ value, onChange, lang, open, onToggle }: { value: Mode; onChange: (v: Mode) => void; lang: Lang; open: boolean; onToggle: () => void }) {
  const label = (m: Mode) => ({ chat: tr(T.modeChat, lang), agent: tr(T.modeAgent, lang), plan: tr(T.modePlan, lang) })[m];
  const btnRef = useRef<HTMLButtonElement>(null);
  return (
    <div style={{ position: "relative" }} onClick={(e) => e.stopPropagation()}>
      <button ref={btnRef} className="pill-btn" onClick={onToggle}>
        <Icon name="chat" />{label(value)}<Icon name="chevD" className="chev" />
      </button>
      <MenuPopover open={open} anchorRef={btnRef} title={tr(T.menuMode, lang)}>
        {(["chat", "agent", "plan"] as Mode[]).map((m) => (
          <div key={m} className={"menu-item" + (m === value ? " sel" : "")} onClick={() => { onChange(m); onToggle(); }}>
            <Icon name="chat" />{label(m)}
            {m === value && <span style={{ marginLeft: "auto" }}><Icon name="check" /></span>}
          </div>
        ))}
      </MenuPopover>
    </div>
  );
}

function QueueSection({ items, onCancel, lang }: { items: QueuedMsg[]; onCancel: (id: number) => void; lang: Lang }) {
  if (!items.length) return null;
  return (
    <div className="queue-section">
      <div className="queue-tl">
        {items.map((item, idx) => (
          <div key={item.id} className="queue-tl-row">
            <div className="queue-tl-left">
              <div className="queue-tl-dot" />
              {idx < items.length - 1 && <div className="queue-tl-line" />}
            </div>
            <div className="queue-tl-content">
              <span className="queue-tl-badge">{tr(T.queued, lang)}</span>
              <span className="queue-tl-text">{item.text}</span>
              <button className="queue-cancel" onClick={() => onCancel(item.id)} title={tr(T.cancelQueued, lang)}>
                <Icon name="x" />
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="queue-divider" />
    </div>
  );
}

export function Composer({ value, onChange, onSend, onStop, running, queuedMsgs, onCancelQueued, lang, model, models, onModelChange, effort, onEffortChange, mode, onModeChange, thinking, onThinkingToggle, approval, meter }: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onStop: () => void;
  running: boolean;
  queuedMsgs: QueuedMsg[];
  onCancelQueued: (id: number) => void;
  lang: Lang;
  model: string;
  models: string[];
  onModelChange: (m: string) => void;
  effort: Effort;
  onEffortChange: (e: Effort) => void;
  mode: Mode;
  onModeChange: (m: Mode) => void;
  thinking: boolean;
  onThinkingToggle: () => void;
  /** Approval panel, slotted in just above the input box (same width). */
  approval?: React.ReactNode;
  /** Context meter, slotted just below the input box (bottom-right). */
  meter?: React.ReactNode;
}) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const [openMenu, setOpenMenu] = useState<"plus" | "model" | "effort" | "mode" | null>(null);

  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 160) + "px";
  }, [value]);

  useEffect(() => {
    if (!openMenu) return;
    const close = () => setOpenMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [openMenu]);

  const key = (e: React.KeyboardEvent) => {
    // Enter inserts a newline; only Cmd/Ctrl+Enter sends (no accidental sends).
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); if (running && !value.trim()) return; onSend(); }
  };
  const toggle = (name: "plus" | "model" | "effort" | "mode") => setOpenMenu((v) => (v === name ? null : name));

  return (
    <div className="composer-wrap">
      <div className="composer-inner">
        {/* When a banner (approval/ask) is present, it + the input box live inside one
            shared rounded shell, so the input reads as an inset box connected to the banner. */}
        <div className={"composer-shell" + (approval ? " has-banner" : "")}>
          {approval}
          <div className="composer">
            <QueueSection items={queuedMsgs} onCancel={onCancelQueued} lang={lang} />
          <textarea ref={taRef} value={value} rows={1}
            placeholder={tr(running ? T.phRunning : T.phEmpty, lang)}
            onChange={(e) => onChange(e.target.value)} onKeyDown={key} />
          <div className="composer-bar">
            <PlusMenu lang={lang} open={openMenu === "plus"} onToggle={() => toggle("plus")} />
            <div className="bar-spacer" />
            <button className="pill-btn ghost" title={tr(T.voice, lang)}><Icon name="mic" /></button>
            {running && !value.trim() ? (
              <button className="send-btn stop" onClick={onStop} title={tr(T.stop, lang)}><Icon name="stop" /></button>
            ) : (
              <button className="send-btn" onClick={onSend} disabled={!value.trim()} title={tr(T.send, lang)}><Icon name="arrowUp" /></button>
            )}
          </div>
          </div>
        </div>
        {/* below the input box: borderless model/effort on the left, context ring on the right */}
        <div className="composer-footer">
          <ModeMenu value={mode} onChange={onModeChange} lang={lang} open={openMenu === "mode"} onToggle={() => toggle("mode")} />
          <ModelMenu value={model} options={models} onChange={onModelChange} open={openMenu === "model"} onToggle={() => toggle("model")}
            thinking={thinking} onThinkingToggle={onThinkingToggle} lang={lang} />
          <EffortMenu value={effort} onChange={onEffortChange} lang={lang} open={openMenu === "effort"} onToggle={() => toggle("effort")} />
          <div className="bar-spacer" />
          {meter}
        </div>
      </div>
    </div>
  );
}
