/** Sidebar (ported from prototype/ui.jsx): traffic lights + search, brand,
 *  new-chat / projects / skills, recent list, profile + settings. */

import { useEffect, useState } from "react";
import type { Lang, SessionMeta } from "../types.ts";
import { T, tr } from "../i18n/strings.ts";
import { Icon } from "./Icon.tsx";
import logo from "../assets/kurt_logo.svg";

function RecentItemMenu({ lang, onClose }: { lang: Lang; onClose: () => void }) {
  useEffect(() => {
    const close = () => onClose();
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [onClose]);
  return (
    <div className="menu" style={{ position: "absolute", top: 32, right: 0, zIndex: 60 }}>
      <div className="menu-item" onClick={(e) => { e.stopPropagation(); onClose(); }}>
        <Icon name="projects" />{tr(T.archiveToProject, lang)}
      </div>
      <div className="menu-item del" onClick={(e) => { e.stopPropagation(); onClose(); }}>
        <Icon name="x" />{tr(T.deleteChat, lang)}
      </div>
    </div>
  );
}

function RecentItem({ r, active, running, onPick, lang }: {
  r: SessionMeta; active: boolean; running: boolean; onPick: (id: string) => void; lang: Lang;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div className={"recent-item" + (active ? " active" : "") + (running ? " running" : "")}
      onClick={() => onPick(r.id)} title={tr(r.title, lang)}>
      <span className="r-label">{tr(r.title, lang)}</span>
      {running && <span className="live-dot" />}
      <div style={{ position: "relative" }}>
        <button className={"r-more" + (menuOpen ? " open" : "")}
          onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); }}>
          <Icon name="dots3" />
        </button>
        {menuOpen && <RecentItemMenu lang={lang} onClose={() => setMenuOpen(false)} />}
      </div>
    </div>
  );
}

export function Sidebar({ recents, activeId, runningId, onPick, onNewChat, lang, onOpenSettings }: {
  recents: SessionMeta[];
  activeId: string | null;
  runningId: string | null;
  onPick: (id: string) => void;
  onNewChat: () => void;
  lang: Lang;
  onOpenSettings: () => void;
}) {
  return (
    <div className="sidebar">
      {/* The macOS traffic lights (close/min/max) are the REAL native buttons,
          overlaid here at top-left via tauri.conf titleBarStyle:"Overlay" +
          trafficLightPosition — no fake dots, no extra title-bar frame.
          The bar is a drag region so the window can be moved by it. */}
      <div className="sb-top" data-tauri-drag-region>
        <div style={{ marginLeft: "auto" }}>
          <button className="icon-btn" title={tr(T.search, lang)}><Icon name="search" /></button>
        </div>
      </div>

      <div className="brand">
        <img className="brand-logo" src={logo} alt="Kurt" />
        <span className="brand-name">Kurt</span>
      </div>

      <div className="sb-scroll">
        <div className="nav-item primary" onClick={onNewChat} title={tr(T.newChat, lang)}>
          <span className="ni-ico"><Icon name="newchat" /></span>
          <span className="ni-label">{tr(T.newChat, lang)}</span>
        </div>

        <div className="nav-item" title={tr(T.projects, lang)}>
          <span className="ni-ico"><Icon name="projects" /></span>
          <span className="ni-label">{tr(T.projects, lang)}</span>
        </div>
        <div className="nav-item" title={tr(T.skills, lang)}>
          <span className="ni-ico"><Icon name="skills" /></span>
          <span className="ni-label">{tr(T.skills, lang)}</span>
        </div>

        <div className="sb-section-label"><span>{tr(T.recent, lang)}</span></div>
        {recents.map((r) => (
          <RecentItem key={r.id} r={r} active={r.id === activeId} running={r.id === runningId} onPick={onPick} lang={lang} />
        ))}
      </div>

      <div className="sb-bottom">
        <div className="profile">
          <span className="avatar">L</span>
          <div className="p-meta">
            <div className="p-name">lew</div>
            <div className="p-plan">Pro</div>
          </div>
          <button className="icon-btn" onClick={onOpenSettings} title={tr(T.openSettings, lang)}>
            <Icon name="gear" />
          </button>
        </div>
      </div>
    </div>
  );
}
