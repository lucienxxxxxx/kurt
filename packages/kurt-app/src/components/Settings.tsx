/** In-app Settings (ported from prototype/ui.jsx): appearance (theme cards +
 *  language segmented control), general (toggles), about. Replaces the chat area. */

import { useEffect, useState } from "react";
import type { Lang, Theme } from "../types.ts";
import { T, tr, type StringKey } from "../i18n/strings.ts";
import { getInfo, setConfig, type BridgeInfo } from "../lib/bridge.ts";
import { resolveBridgeUrl } from "../lib/bridgeUrl.ts";
import { Icon } from "./Icon.tsx";
import logo from "../assets/kurt_logo.svg";

function ModeCard({ active, theme, label, onClick }: { active: boolean; theme: Theme; label: string; onClick: () => void }) {
  return (
    <button className={"mode-card" + (active ? " on" : "")} data-mode={theme} onClick={onClick}>
      <div className="mode-preview">
        <span className="mp-sidebar" />
        <span className="mp-main"><span className="mp-row" /><span className="mp-row short" /></span>
      </div>
      <div className="mode-label">{label}{active && <Icon name="check" />}</div>
    </button>
  );
}

function SegRow<V extends string>({ options, value, onChange }: { options: { value: V; label: string }[]; value: V; onChange: (v: V) => void }) {
  return (
    <div className="seg-row">
      {options.map((o) => (
        <button key={o.value} className={"seg-btn" + (o.value === value ? " on" : "")} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function AppearancePanel({ theme, setTheme, lang, setLang }: { theme: Theme; setTheme: (t: Theme) => void; lang: Lang; setLang: (l: Lang) => void }) {
  return (
    <div className="set-panel">
      <div className="set-row">
        <div className="set-row-head">
          <div className="set-row-title">{tr(T.colorMode, lang)}</div>
          <div className="set-row-sub">{tr(T.colorModeDesc, lang)}</div>
        </div>
        <div className="mode-cards">
          <ModeCard theme="light" active={theme === "light"} label={tr(T.modeLight, lang)} onClick={() => setTheme("light")} />
          <ModeCard theme="dark" active={theme === "dark"} label={tr(T.modeDark, lang)} onClick={() => setTheme("dark")} />
          <ModeCard theme="system" active={theme === "system"} label={tr(T.modeSystem, lang)} onClick={() => setTheme("system")} />
        </div>
      </div>
      <div className="set-row inline">
        <div className="set-row-head">
          <div className="set-row-title">{tr(T.language, lang)}</div>
          <div className="set-row-sub">{tr(T.languageDesc, lang)}</div>
        </div>
        <SegRow<Lang> value={lang} onChange={setLang}
          options={[{ value: "zh", label: tr(T.chinese, lang) }, { value: "en", label: tr(T.english, lang) }]} />
      </div>
    </div>
  );
}

function ApiPanel({ lang }: { lang: Lang }) {
  const [status, setStatus] = useState<BridgeInfo | null>(null);
  const [key, setKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    void (async () => {
      try { setStatus(await getInfo(await resolveBridgeUrl())); } catch { /* bridge not ready */ }
    })();
  }, []);

  const save = async (): Promise<void> => {
    if (!key.trim() || saving) return;
    setSaving(true);
    try {
      const info = await setConfig(await resolveBridgeUrl(), { apiKey: key.trim() });
      if (info) setStatus(info);
      setKey("");
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="set-panel">
      <div className="set-row">
        <div className="set-row-head">
          <div className="set-row-title">
            {tr(T.apiKeyLabel, lang)} · <span style={{ color: status?.hasKey ? "var(--green)" : "var(--text-muted)" }}>{tr(status?.hasKey ? T.apiKeySet : T.apiKeyNone, lang)}</span>
          </div>
          <div className="set-row-sub">{tr(T.apiKeyDesc, lang)}</div>
        </div>
        <div className="api-row">
          <input className="api-input" type="password" value={key} placeholder={tr(T.apiKeyPlaceholder, lang)}
            onChange={(e) => setKey(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void save(); }} spellCheck={false} />
          <button className="pill-btn" disabled={saving || !key.trim()} onClick={() => void save()}>
            {justSaved ? tr(T.saved, lang) : tr(T.save, lang)}
          </button>
        </div>
      </div>
      {status?.model && (
        <div className="set-row inline">
          <div className="set-row-head">
            <div className="set-row-title">{tr(T.apiModelLabel, lang)}</div>
          </div>
          <div className="set-row-sub" style={{ fontFamily: "var(--font-mono)" }}>{status.model}</div>
        </div>
      )}
    </div>
  );
}

function GeneralPanel({ lang, collapseDetails, setCollapseDetails }: { lang: Lang; collapseDetails: boolean; setCollapseDetails: (v: boolean) => void }) {
  const [startup, setStartup] = useState(false);
  const [sendOnEnter, setSendOnEnter] = useState(true);
  return (
    <div className="set-panel">
      <div className="set-row inline">
        <div className="set-row-head">
          <div className="set-row-title">{tr(T.collapseDetails, lang)}</div>
          <div className="set-row-sub">{tr(T.collapseDetailsDesc, lang)}</div>
        </div>
        <button className={"toggle" + (collapseDetails ? " on" : "")} onClick={() => setCollapseDetails(!collapseDetails)}><span className="toggle-knob" /></button>
      </div>
      <div className="set-row inline">
        <div className="set-row-head">
          <div className="set-row-title">{tr(T.startupRun, lang)}</div>
          <div className="set-row-sub">{tr(T.startupRunDesc, lang)}</div>
        </div>
        <button className={"toggle" + (startup ? " on" : "")} onClick={() => setStartup(!startup)}><span className="toggle-knob" /></button>
      </div>
      <div className="set-row inline">
        <div className="set-row-head">
          <div className="set-row-title">{tr(T.sendOnEnter, lang)}</div>
          <div className="set-row-sub">{tr(T.sendOnEnterDesc, lang)}</div>
        </div>
        <button className={"toggle" + (sendOnEnter ? " on" : "")} onClick={() => setSendOnEnter(!sendOnEnter)}><span className="toggle-knob" /></button>
      </div>
    </div>
  );
}

function AboutPanel({ lang }: { lang: Lang }) {
  return (
    <div className="set-panel about">
      <img className="about-logo" src={logo} alt="Kurt" />
      <div className="about-name">Kurt</div>
      <div className="about-tag">{tr(T.aboutTagline, lang)}</div>
      <div className="about-ver">{tr(T.aboutVersion, lang)} 0.1.0</div>
    </div>
  );
}

export function Settings({ theme, setTheme, lang, setLang, collapseDetails, setCollapseDetails, onClose }: {
  theme: Theme; setTheme: (t: Theme) => void; lang: Lang; setLang: (l: Lang) => void;
  collapseDetails: boolean; setCollapseDetails: (v: boolean) => void; onClose: () => void;
}) {
  const [cat, setCat] = useState<"appearance" | "api" | "general" | "about">("appearance");
  const cats: { id: "appearance" | "api" | "general" | "about"; icon: string; label: StringKey }[] = [
    { id: "appearance", icon: "palette", label: "catAppearance" },
    { id: "api", icon: "spark", label: "catApi" },
    { id: "general", icon: "sliders", label: "catGeneral" },
    { id: "about", icon: "info", label: "catAbout" },
  ];
  return (
    <div className="settings">
      <div className="set-top">
        <div className="set-title">{tr(T.settings, lang)}</div>
        <button className="icon-btn" onClick={onClose} title={tr(T.close, lang)}><Icon name="x" /></button>
      </div>
      <div className="set-body">
        <div className="set-nav">
          {cats.map((c) => (
            <div key={c.id} className={"set-nav-item" + (cat === c.id ? " active" : "")} onClick={() => setCat(c.id)}>
              <Icon name={c.icon} /><span>{tr(T[c.label], lang)}</span>
            </div>
          ))}
        </div>
        <div className="set-detail">
          {cat === "appearance" && <AppearancePanel theme={theme} setTheme={setTheme} lang={lang} setLang={setLang} />}
          {cat === "api" && <ApiPanel lang={lang} />}
          {cat === "general" && <GeneralPanel lang={lang} collapseDetails={collapseDetails} setCollapseDetails={setCollapseDetails} />}
          {cat === "about" && <AboutPanel lang={lang} />}
        </div>
      </div>
    </div>
  );
}
