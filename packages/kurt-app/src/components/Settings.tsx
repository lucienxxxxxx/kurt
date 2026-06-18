/** In-app Settings (ported from prototype/ui.jsx): appearance (theme cards +
 *  language segmented control), general (toggles), about. Replaces the chat area. */

import { useEffect, useState } from "react";
import type { Lang, Theme } from "../types.ts";
import { T, tr, type StringKey } from "../i18n/strings.ts";
import { getConfig, setConfig, type DesktopConfig } from "../lib/bridge.ts";
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
  const [cfg, setCfg] = useState<DesktopConfig | null>(null);
  // structured form state
  const [baseURL, setBaseURL] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [modelsText, setModelsText] = useState("");
  const [format, setFormat] = useState<"openai" | "claude">("openai");
  const [savedFlag, setSavedFlag] = useState(false);
  // raw JSON editor state
  const [jsonText, setJsonText] = useState("");
  const [editingJson, setEditingJson] = useState(false);
  const [jsonErr, setJsonErr] = useState(false);

  const apply = (c: DesktopConfig): void => {
    setCfg(c);
    setBaseURL(c.baseURL);
    setApiKey(c.apiKey);
    setModelsText(c.models.join(", "));
    setFormat(c.format);
    if (!editingJson) setJsonText(JSON.stringify(c, null, 2));
  };
  const refetch = async (): Promise<void> => {
    try { const c = await getConfig(await resolveBridgeUrl()); if (c) apply(c); } catch { /* bridge not ready */ }
  };
  useEffect(() => { void refetch(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const saveForm = async (): Promise<void> => {
    const models = modelsText.split(",").map((s) => s.trim()).filter(Boolean);
    await setConfig(await resolveBridgeUrl(), { baseURL: baseURL.trim(), apiKey: apiKey.trim(), models, format });
    await refetch();
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
    setEditingJson(false);
    setJsonErr(false);
  };

  const hasKey = (cfg?.apiKey ?? "").length > 0;
  return (
    <div className="set-panel">
      <div className="set-row">
        <div className="set-row-head">
          <div className="set-row-title">{tr(T.apiBaseUrlLabel, lang)}</div>
          <div className="set-row-sub">{tr(T.apiBaseUrlDesc, lang)}</div>
        </div>
        <input className="api-input" value={baseURL} spellCheck={false} placeholder="https://api.deepseek.com" onChange={(e) => setBaseURL(e.target.value)} />
      </div>
      <div className="set-row">
        <div className="set-row-head">
          <div className="set-row-title">
            {tr(T.apiKeyLabel, lang)} · <span style={{ color: hasKey ? "var(--green)" : "var(--text-muted)" }}>{tr(hasKey ? T.apiKeySet : T.apiKeyNone, lang)}</span>
          </div>
          <div className="set-row-sub">{tr(T.apiKeyDesc, lang)}</div>
        </div>
        <input className="api-input" type="password" value={apiKey} spellCheck={false} placeholder={tr(T.apiKeyPlaceholder, lang)} onChange={(e) => setApiKey(e.target.value)} />
      </div>
      <div className="set-row">
        <div className="set-row-head">
          <div className="set-row-title">{tr(T.apiModelsLabel, lang)}</div>
          <div className="set-row-sub">{tr(T.apiModelsDesc, lang)}</div>
        </div>
        <input className="api-input" value={modelsText} spellCheck={false} placeholder="deepseek-v4-flash, deepseek-v4-pro" onChange={(e) => setModelsText(e.target.value)} />
      </div>
      <div className="set-row inline">
        <div className="set-row-head">
          <div className="set-row-title">{tr(T.apiFormatLabel, lang)}</div>
          <div className="set-row-sub">{tr(T.apiFormatDesc, lang)}</div>
        </div>
        <SegRow<"openai" | "claude"> value={format} onChange={setFormat}
          options={[{ value: "openai", label: tr(T.apiFormatOpenai, lang) }, { value: "claude", label: tr(T.apiFormatClaude, lang) }]} />
      </div>
      <div className="api-row" style={{ justifyContent: "flex-end" }}>
        <button className="pill-btn" onClick={() => void saveForm()}>{savedFlag ? tr(T.saved, lang) : tr(T.save, lang)}</button>
      </div>

      <div className="set-row">
        <div className="set-row-head">
          <div className="set-row-title">{tr(T.apiRawLabel, lang)}{jsonErr && <span style={{ color: "var(--accent)", marginLeft: 8 }}>· {tr(T.apiJsonInvalid, lang)}</span>}</div>
          <div className="set-row-sub">{tr(T.apiRawDesc, lang)}</div>
        </div>
        <textarea className={"api-json" + (editingJson ? " editing" : "")} value={jsonText} readOnly={!editingJson} spellCheck={false}
          onChange={(e) => onJsonChange(e.target.value)} rows={8} />
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
