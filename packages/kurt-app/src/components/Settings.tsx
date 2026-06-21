/** In-app Settings (ported from prototype/ui.jsx): appearance (theme cards +
 *  language segmented control), general (toggles), about. Replaces the chat area. */

import { useEffect, useState } from "react";
import type { Lang, Theme } from "../types.ts";
import { T, tr, type StringKey } from "../i18n/strings.ts";
import { getConfig, setConfig, type DesktopConfig, type ProviderConfig, type ProviderId } from "../lib/bridge.ts";
import { resolveBridgeUrl } from "../lib/bridgeUrl.ts";
import { Icon } from "./Icon.tsx";
import { ModelLogo } from "./ModelLogo.tsx";
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

/** UI metadata for each provider (label + default baseURL placeholder + custom?). */
const PROVIDERS: { id: ProviderId; label: string; baseURL: string; modelsHint: string; custom: boolean }[] = [
  { id: "openai", label: "OpenAI", baseURL: "https://api.openai.com/v1", modelsHint: "gpt-4o, gpt-4o-mini, o3-mini", custom: false },
  { id: "claude", label: "Claude", baseURL: "https://api.anthropic.com", modelsHint: "claude-opus-4-8, claude-sonnet-4-6", custom: false },
  { id: "deepseek", label: "DeepSeek", baseURL: "https://api.deepseek.com", modelsHint: "deepseek-v4-flash, deepseek-v4-pro", custom: false },
  { id: "custom", label: "Custom", baseURL: "https://…/v1", modelsHint: "my-model-1, my-model-2", custom: true },
];

function ApiPanel({ lang, onConfigChanged }: { lang: Lang; onConfigChanged?: () => void }) {
  const [draft, setDraft] = useState<DesktopConfig | null>(null);
  const [savedFlag, setSavedFlag] = useState(false);
  // raw JSON editor state
  const [jsonText, setJsonText] = useState("");
  const [editingJson, setEditingJson] = useState(false);
  const [jsonErr, setJsonErr] = useState(false);

  const refetch = async (): Promise<void> => {
    try {
      const c = await getConfig(await resolveBridgeUrl());
      if (c) { setDraft(c); if (!editingJson) setJsonText(JSON.stringify(c, null, 2)); }
    } catch { /* bridge not ready */ }
  };
  useEffect(() => { void refetch(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const setProv = (id: ProviderId, patch: Partial<ProviderConfig>): void =>
    setDraft((d) => (d ? { providers: { ...d.providers, [id]: { ...d.providers[id], ...patch } } } : d));

  const save = async (): Promise<void> => {
    if (!draft) return;
    await setConfig(await resolveBridgeUrl(), { providers: draft.providers });
    await refetch();
    onConfigChanged?.();
    setSavedFlag(true);
    setTimeout(() => setSavedFlag(false), 2000);
  };

  const onJsonChange = (v: string): void => {
    setJsonText(v);
    try { JSON.parse(v); setJsonErr(false); } catch { setJsonErr(true); }
  };
  const toggleJson = async (): Promise<void> => {
    if (!editingJson) { setEditingJson(true); setJsonErr(false); return; } // Edit → editable
    let parsed: unknown;
    try { parsed = JSON.parse(jsonText); } catch { setJsonErr(true); return; } // Confirm: must be valid
    if (typeof parsed !== "object" || parsed === null) { setJsonErr(true); return; }
    await setConfig(await resolveBridgeUrl(), parsed as Partial<DesktopConfig>);
    await refetch();
    onConfigChanged?.();
    setEditingJson(false);
    setJsonErr(false);
  };

  return (
    <div className="set-panel">
      <div className="set-row-head" style={{ marginBottom: 4 }}>
        <div className="set-row-title">{tr(T.apiProvidersTitle, lang)}</div>
        <div className="set-row-sub">{tr(T.apiProvidersDesc, lang)}</div>
      </div>

      {PROVIDERS.map(({ id, label, baseURL, modelsHint, custom }) => {
        const p = draft?.providers[id] ?? { enabled: false, apiKey: "" };
        const hasKey = (p.apiKey ?? "").length > 0;
        return (
          <div key={id} className={"provider-card" + (p.enabled ? " on" : "")}>
            <div className="provider-head">
              <span className="provider-name"><ModelLogo model={id} /> {label}</span>
              <span className="provider-key-dot" style={{ background: hasKey ? "var(--green, #3a9)" : "var(--border-strong)" }} />
              <span className="provider-spacer" />
              <span className="switch-row" role="switch" aria-checked={p.enabled} onClick={() => setProv(id, { enabled: !p.enabled })}>
                <span className="set-row-sub">{tr(T.apiEnable, lang)}</span>
                <span className={"switch" + (p.enabled ? " on" : "")}><span className="switch-knob" /></span>
              </span>
            </div>
            <input className="api-input" type="password" value={p.apiKey ?? ""} spellCheck={false}
              placeholder={tr(T.apiKeyPlaceholder, lang)} onChange={(e) => setProv(id, { apiKey: e.target.value })} />
            {custom && (
              <input className="api-input" value={p.baseURL ?? ""} spellCheck={false}
                placeholder={baseURL} onChange={(e) => setProv(id, { baseURL: e.target.value })} />
            )}
            <input className="api-input" value={(p.models ?? []).join(", ")} spellCheck={false}
              placeholder={modelsHint} onChange={(e) => setProv(id, { models: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} />
            {custom && (
              <SegRow<"openai" | "claude"> value={p.format ?? "openai"} onChange={(f) => setProv(id, { format: f })}
                options={[{ value: "openai", label: tr(T.apiFormatOpenai, lang) }, { value: "claude", label: tr(T.apiFormatClaude, lang) }]} />
            )}
            {id === "claude" && <div className="provider-note">{tr(T.apiClaudeSoon, lang)}</div>}
          </div>
        );
      })}

      <div className="api-row" style={{ justifyContent: "flex-end" }}>
        <button className="pill-btn" onClick={() => void save()}>{savedFlag ? tr(T.saved, lang) : tr(T.save, lang)}</button>
      </div>

      <div className="set-row">
        <div className="set-row-head">
          <div className="set-row-title">{tr(T.apiRawLabel, lang)}{jsonErr && <span style={{ color: "var(--accent)", marginLeft: 8 }}>· {tr(T.apiJsonInvalid, lang)}</span>}</div>
          <div className="set-row-sub">{tr(T.apiRawDesc, lang)}</div>
        </div>
        <textarea className={"api-json" + (editingJson ? " editing" : "")} value={jsonText} readOnly={!editingJson} spellCheck={false}
          onChange={(e) => onJsonChange(e.target.value)} rows={10} />
        <div className="api-row" style={{ justifyContent: "flex-end" }}>
          <button className="pill-btn" disabled={editingJson && jsonErr} onClick={() => void toggleJson()}>
            {editingJson ? tr(T.confirm, lang) : tr(T.edit, lang)}
          </button>
        </div>
      </div>
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

export function Settings({ theme, setTheme, lang, setLang, collapseDetails, setCollapseDetails, onConfigChanged, onClose }: {
  theme: Theme; setTheme: (t: Theme) => void; lang: Lang; setLang: (l: Lang) => void;
  collapseDetails: boolean; setCollapseDetails: (v: boolean) => void; onConfigChanged?: () => void; onClose: () => void;
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
          {cat === "api" && <ApiPanel lang={lang} onConfigChanged={onConfigChanged} />}
          {cat === "general" && <GeneralPanel lang={lang} collapseDetails={collapseDetails} setCollapseDetails={setCollapseDetails} />}
          {cat === "about" && <AboutPanel lang={lang} />}
        </div>
      </div>
    </div>
  );
}
