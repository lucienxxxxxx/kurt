/* global React, T, tr */
const { useState, useRef, useEffect } = React;

/* ---------------- Icons (all SVG) ---------------- */
const ICON = {
  plus: "M12 5v14M5 12h14",
  search: "M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.3-4.3",
  sidebar: "M4 5h16v14H4zM10 5v14",
  sun: "M12 4V2M12 22v-2M4 12H2M22 12h-2M5.6 5.6L4.2 4.2M19.8 19.8l-1.4-1.4M5.6 18.4l-1.4 1.4M19.8 4.2l-1.4 1.4M12 8a4 4 0 100 8 4 4 0 000-8z",
  moon: "M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z",
  chat: "M21 12a8 8 0 01-8 8H7l-4 3v-5a8 8 0 018-11h2a8 8 0 016 5z",
  folder: "M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z",
  image: "M3 5h18v14H3zM3 16l5-5 4 4 3-3 6 6M8.5 9.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3z",
  globe: "M12 3a9 9 0 100 18 9 9 0 000-18zM3 12h18M12 3c2.5 2.5 3.5 6 3.5 9s-1 6.5-3.5 9c-2.5-2.5-3.5-6-3.5-9s1-6.5 3.5-9z",
  calendar: "M5 5h14v15H5zM5 9h14M9 3v4M15 3v4",
  broom: "M19 5l-7 7M11 13l-4 7M11 13l5 5M5.5 18.5L8 21",
  mic: "M12 3a3 3 0 013 3v6a3 3 0 01-6 0V6a3 3 0 013-3zM5 11a7 7 0 0014 0M12 18v3",
  bell: "M6 9a6 6 0 1112 0c0 5 2 6 2 6H4s2-1 2-6zM10 21h4",
  chevR: "M9 6l6 6-6 6",
  chevD: "M6 9l6 6 6-6",
  send: "M5 12l14-7-5 7 5 7-14-7zM5 12h9",
  stop: "M7 7h10v10H7z",
  pause: "M8 6v12M16 6v12",
  paperclip: "M21 11l-8.5 8.5a4 4 0 01-5.7-5.7L15 5.5a2.5 2.5 0 013.5 3.5l-8.4 8.4a1 1 0 01-1.4-1.4l7.7-7.7",
  sliders: "M4 7h11M19 7h1M4 17h7M15 17h5M15 5v4M11 15v4",
  terminal: "M5 5h14v14H5zM8 9l3 3-3 3M13 15h4",
  file: "M7 3h7l4 4v14H7zM14 3v4h4",
  spark: "M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z",
  user: "M12 12a4 4 0 100-8 4 4 0 000 8zM5 21a7 7 0 0114 0",
  check: "M5 13l4 4L19 7",
  more: "M5 9l5 5M19 9l-5 5",
  edit: "M4 20h4L19 9l-4-4L4 16zM14 6l4 4",
  newchat: "M12 5v14M5 12h14",
  projects: "M3 8h6l2 2h10v9H3zM7 5h6l2 2",
  skills: "M13 2L4 14h7l-2 8 10-12h-8z",
  gear: "M12 9a3 3 0 100 6 3 3 0 000-6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3h.1a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8v.1a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z",
  x: "M6 6l12 12M18 6l-12 12",
  info: "M12 3a9 9 0 100 18 9 9 0 000-18zM12 11v6M12 7v.01",
  palette: "M12 3a9 9 0 100 18c1 0 1.5-.8 1.5-1.7 0-.4-.2-.8-.5-1.1-.3-.3-.5-.7-.5-1.2 0-1 .8-1.8 1.8-1.8H16a5 5 0 005-5c0-4.4-4-8-9-8zM7 12.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3zM10.5 8a1.5 1.5 0 100-3 1.5 1.5 0 000 3zM15 8a1.5 1.5 0 100-3 1.5 1.5 0 000 3z",
  // three-dot icon
  dots3: "M12 5v.01M12 12v.01M12 19v.01",
  // language toggle: stylized "translate" (two arrows + dot)
  translate: "M5 5h7M8.5 5v3M5 8h6M6 11l3 3 3-3M14 19l4-10 4 10M15.5 16h5",
};
function Icon({ name, className }) {
  const d = ICON[name] || "";
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {d.split("M").filter(Boolean).map((seg, i) => <path key={i} d={"M" + seg} />)}
    </svg>
  );
}

/* ---------------- Markdown renderer ---------------- */
function renderInline(text) {
  const parts = [];
  const re = /(`[^`]+`|\*\*[^*]+\*\*|\[([^\]]+)\]\(([^)]+)\))/g;
  let last = 0, m, k = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("`")) parts.push(<code key={k++} className="inl">{tok.slice(1, -1)}</code>);
    else if (tok.startsWith("**")) parts.push(<strong key={k++}>{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith("[")) parts.push(<a key={k++} className="md-link" href={m[3]}>{m[2]}</a>);
    last = m.index + tok.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

function MdBlock({ text }) {
  const lines = text.split("\n");
  const elements = [];
  let i = 0, k = 0;

  while (i < lines.length) {
    const line = lines[i];

    // blank line → spacer
    if (line.trim() === "") { elements.push(<div key={k++} style={{ height: 6 }} />); i++; continue; }

    // fenced code block
    if (line.trim().startsWith("```")) {
      const lang = line.trim().slice(3).trim();
      const codeLines = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) { codeLines.push(lines[i]); i++; }
      i++; // skip closing ```
      elements.push(
        <pre key={k++} className="md-pre">
          {lang && <div className="md-pre-lang">{lang}</div>}
          <code>{codeLines.join("\n")}</code>
        </pre>
      );
      continue;
    }

    // headers
    if (line.startsWith("### ")) { elements.push(<h4 key={k++} className="md-h3">{renderInline(line.slice(4))}</h4>); i++; continue; }
    if (line.startsWith("## "))  { elements.push(<h3 key={k++} className="md-h2">{renderInline(line.slice(3))}</h3>); i++; continue; }
    if (line.startsWith("# "))   { elements.push(<h2 key={k++} className="md-h1">{renderInline(line.slice(2))}</h2>); i++; continue; }

    // horizontal rule
    if (/^---+$/.test(line.trim())) { elements.push(<hr key={k++} className="md-hr" />); i++; continue; }

    // unordered list
    if (/^[-*] /.test(line.trim())) {
      const items = [];
      while (i < lines.length && /^[-*] /.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*] /, ""));
        i++;
      }
      elements.push(<ul key={k++} className="md-ul">{items.map((t, j) => <li key={j}>{renderInline(t)}</li>)}</ul>);
      continue;
    }

    // ordered list
    if (/^\d+[.)]\s/.test(line.trim())) {
      const items = [];
      while (i < lines.length && /^\d+[.)]\s/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+[.)]\s/, ""));
        i++;
      }
      elements.push(<ol key={k++} className="md-ol">{items.map((t, j) => <li key={j}>{renderInline(t)}</li>)}</ol>);
      continue;
    }

    // normal paragraph
    elements.push(<p key={k++}>{renderInline(line)}</p>);
    i++;
  }
  return elements;
}

// keep old name for backwards compat
function Paras({ text }) { return <MdBlock text={text} />; }

/* ---------------- Step renderers ---------------- */
function ThinkingStep({ step, open, onToggle, typing, lang }) {
  return (
    <div className="step thinking-step">
      <div className={"think-head" + (open ? " open" : "")} onClick={onToggle}>
        <Icon name="chevR" className="chev" />
        <span>{typing ? tr(T.thinking, lang) : tr(T.thoughtFor, lang, { n: step.sec })}</span>
      </div>
      {open && (
        <div className="think-body">
          <Paras text={tr(step.text, lang)} />
        </div>
      )}
    </div>
  );
}

function TextStep({ step, typing, lang }) {
  return (
    <div className="step">
      <div className={"step-text" + (typing ? " typing-cursor" : "")}>
        <Paras text={tr(step.text, lang)} />
      </div>
    </div>
  );
}

function ToolStep({ step, open, onToggle, lang, onOpenOutput }) {
  const outText = tr(step.out, lang);
  const outLines = outText.split("\n");
  const MAX_LINES = 5;
  const isTruncated = outLines.length > MAX_LINES;
  const displayOut = isTruncated ? outLines.slice(0, MAX_LINES).join("\n") : outText;

  const handleClickOut = () => {
    if (isTruncated && onOpenOutput) {
      onOpenOutput({
        stepId: step._id,
        name: step.name,
        title: tr(step.title, lang),
        content: outText,
      });
    }
  };

  return (
    <div className="step act">
      <div className="tool-line">
        <span className="tool-name">{step.name}</span>
        <span className="tool-title">{tr(step.title, lang)}</span>
        <button className="icon-btn tool-toggle" onClick={onToggle}
          title={tr(open ? T.collapse : T.expand, lang)}>
          <Icon name={open ? "chevD" : "chevR"} />
        </button>
      </div>
      {open && (
        <div className="tool-card">
          <div className="tool-row">
            <span className="tool-tag">IN</span>
            <div className="tool-content">{step.cmd}</div>
          </div>
          <div className={"tool-row out" + (isTruncated ? " clickable" : "")} onClick={handleClickOut}>
            <span className="tool-tag">OUT</span>
            <div className="tool-content">
              {displayOut}
              {isTruncated && <span className="tool-ellipsis">…</span>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ReadStep({ step, lang, onOpen }) {
  return (
    <div className="step act">
      <div className="read-line">
        <span className="tool-name">{tr(T.readPrefix, lang)}</span>
        <button className="read-file-link" onClick={() => onOpen && onOpen(step.file)}>
          {step.file}
        </button>
        <span className="read-meta">({tr(T.linesLabel, lang, { range: step.lines })})</span>
      </div>
    </div>
  );
}

/* ---------------- Skill step ---------------- */
function SkillStep({ step, open, onToggle, lang }) {
  return (
    <div className="step skill-step">
      <div className="skill-line">
        <span className="skill-badge"><Icon name="skills" /></span>
        <span className="skill-name">{step.name}</span>
        <span className="skill-title">{tr(step.title, lang)}</span>
        <button className="icon-btn tool-toggle" onClick={onToggle}
          title={tr(open ? T.collapse : T.expand, lang)}>
          <Icon name={open ? "chevD" : "chevR"} />
        </button>
      </div>
      {open && (
        <div className="skill-card">
          {step.input && (
            <div className="skill-section">
              <div className="skill-section-label">INPUT</div>
              <div className="skill-section-body">{tr(step.input, lang)}</div>
            </div>
          )}
          {step.output && (
            <div className="skill-section out">
              <div className="skill-section-label">OUTPUT</div>
              <div className="skill-section-body"><MdBlock text={tr(step.output, lang)} /></div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------------- Sidebar ---------------- */
function RecentItemMenu({ id, lang, onClose }) {
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

function RecentItem({ r, active, running, onPick, lang }) {
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
        {menuOpen && <RecentItemMenu id={r.id} lang={lang} onClose={() => setMenuOpen(false)} />}
      </div>
    </div>
  );
}

function Sidebar({ recents, activeId, runningId, onPick, onNewChat,
                   theme, onToggleTheme, lang, onOpenSettings }) {
  return (
    <div className="sidebar">
      <div className="sb-top">
        <div className="traffic">
          <span className="dot-light red" /><span className="dot-light yellow" /><span className="dot-light green" />
        </div>
        <div style={{ marginLeft: "auto" }}>
          <button className="icon-btn" title={tr(T.search, lang)}><Icon name="search" /></button>
        </div>
      </div>

      <div className="brand">
        <img className="brand-logo" src="kurt_logo.svg" alt="Kurt" />
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
          <RecentItem key={r.id} r={r}
            active={r.id === activeId} running={r.id === runningId}
            onPick={onPick} lang={lang} />
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

/* =============================================================
 * Composer area
 * -------------------------------------------------------------
 * Broken into small components that each map 1:1 to a shadcn
 * primitive when ported. Annotated with `// shadcn:` hints.
 * ============================================================= */

/* ---- shared menu popover (maps to shadcn DropdownMenuContent) ---- */
function MenuPopover({ open, children, anchor = { bottom: 40, left: 0 } }) {
  if (!open) return null;
  return <div className="menu" style={{ position: "absolute", ...anchor }}>{children}</div>;
}

/* ---- "+" attachments menu  ▸  shadcn: DropdownMenu ---- */
function PlusMenu({ lang, open, onToggle }) {
  return (
    <div style={{ position: "relative" }} onClick={(e) => e.stopPropagation()}>
      <button className="pill-btn ghost" onClick={onToggle}>
        <Icon name="plus" />
      </button>
      <MenuPopover open={open}>
        <div className="menu-item" onClick={onToggle}>
          <Icon name="paperclip" />{tr(T.addAttach, lang)}
        </div>
        <div className="menu-item" onClick={onToggle}>
          <Icon name="folder" />{tr(T.chooseFolder, lang)}
        </div>
        <div className="menu-item" onClick={onToggle}>
          <Icon name="globe" />{tr(T.pasteUrl, lang)}
        </div>
      </MenuPopover>
    </div>
  );
}

/* ---- model picker  ▸  shadcn: DropdownMenu (or Select) ---- */
function ModelMenu({ value, onChange, lang, open, onToggle }) {
  const opts = ["Sonnet 4.6", "Opus 4.2", "Haiku 4"];
  return (
    <div style={{ position: "relative" }} onClick={(e) => e.stopPropagation()}>
      <button className="pill-btn" onClick={onToggle}>
        <Icon name="spark" />{value}<Icon name="chevD" className="chev" />
      </button>
      <MenuPopover open={open}>
        {opts.map((m) => (
          <div key={m} className={"menu-item" + (m === value ? " sel" : "")}
            onClick={() => { onChange(m); onToggle(); }}>
            <Icon name="spark" />{m}
            {m === value && <span style={{ marginLeft: "auto" }}><Icon name="check" /></span>}
          </div>
        ))}
      </MenuPopover>
    </div>
  );
}

/* ---- effort picker  ▸  shadcn: DropdownMenu ---- */
function EffortMenu({ value, onChange, lang, open, onToggle }) {
  const label = (k) => ({
    low: tr(T.effortLow, lang), med: tr(T.effortMed, lang),
    high: tr(T.effortHigh, lang), max: tr(T.effortMax, lang),
  })[k];
  return (
    <div style={{ position: "relative" }} onClick={(e) => e.stopPropagation()}>
      <button className="pill-btn" onClick={onToggle}>
        <Icon name="sliders" />{label(value)}<Icon name="chevD" className="chev" />
      </button>
      <MenuPopover open={open}>
        {["low", "med", "high", "max"].map((k) => (
          <div key={k} className={"menu-item" + (k === value ? " sel" : "")}
            onClick={() => { onChange(k); onToggle(); }}>
            <Icon name="sliders" />
            {label(k)}{k === "max" ? tr(T.effortMaxNote, lang) : ""}
          </div>
        ))}
      </MenuPopover>
    </div>
  );
}

/* ---- run bar (visible while streaming)  ▸  custom; uses shadcn Button ---- */
function RunBar({ paused, onPause, onStop, lang }) {
  return (
    <div className={"running-bar" + (paused ? " paused" : "")}>
      <span className="spin" />
      <span>{paused ? tr(T.paused, lang) : tr(T.runningLabel, lang)}</span>
      <div style={{ flex: 1 }} />
      <button className="pill-btn ghost" onClick={onPause}>
        <Icon name={paused ? "send" : "pause"} />
        {paused ? tr(T.resume, lang) : tr(T.pause, lang)}
      </button>
      <button className="pill-btn ghost" onClick={onStop} style={{ color: "var(--accent)" }}>
        <Icon name="stop" />{tr(T.stop, lang)}
      </button>
    </div>
  );
}

/* ---- send button  ▸  shadcn: Button size="icon" ---- */
function SendButton({ disabled, onSend, lang }) {
  return (
    <button className="send-btn" onClick={onSend} disabled={disabled} title={tr(T.send, lang)}>
      <Icon name="send" />
    </button>
  );
}

/* ---- composer orchestrator  ▸  custom; uses shadcn Textarea inside ---- */
function Composer({ value, onChange, onSend, onStop, running, queuedMsgs, onCancelQueued, lang }) {
  const taRef = useRef(null);
  const [model, setModel] = useState("Sonnet 4.6");
  const [effort, setEffort] = useState("med");
  const [openMenu, setOpenMenu] = useState(null); // 'plus' | 'model' | 'effort' | null

  useEffect(() => {
    const ta = taRef.current; if (!ta) return;
    ta.style.height = "auto"; ta.style.height = Math.min(ta.scrollHeight, 160) + "px";
  }, [value]);

  // close any open menu on outside click
  useEffect(() => {
    if (!openMenu) return;
    const close = () => setOpenMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [openMenu]);

  const key = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (running && !value.trim()) return; onSend(); } };

  const toggle = (name) => setOpenMenu((v) => v === name ? null : name);

  return (
    <div className="composer-wrap">
      <div className="composer-inner">
        <div className="composer">
          <QueueSection items={queuedMsgs} onCancel={onCancelQueued} lang={lang} />
          <textarea ref={taRef} value={value} rows={1}
            placeholder={tr(running ? T.phRunning : T.phEmpty, lang)}
            onChange={(e) => onChange(e.target.value)} onKeyDown={key} />
          <div className="composer-bar">
            <PlusMenu lang={lang} open={openMenu === "plus"} onToggle={() => toggle("plus")} />
            <ModelMenu value={model} onChange={setModel} lang={lang}
              open={openMenu === "model"} onToggle={() => toggle("model")} />
            <EffortMenu value={effort} onChange={setEffort} lang={lang}
              open={openMenu === "effort"} onToggle={() => toggle("effort")} />
            <div className="bar-spacer" />
            <button className="pill-btn ghost" title={tr(T.voice, lang)}><Icon name="mic" /></button>
            {running && !value.trim() ? (
              <button className="send-btn stop" onClick={onStop} title={tr(T.stop, lang)}>
                <Icon name="stop" />
              </button>
            ) : (
              <SendButton disabled={!value.trim()} onSend={onSend} lang={lang} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* =============================================================
 * Settings page  ▸ in-app, replaces the chat area
 * shadcn map: outer = Dialog/Sheet content; left = NavigationMenu;
 * right panels use Card + RadioGroup + Switch + Label.
 * ============================================================= */

function ModeCard({ active, theme, label, onClick }) {
  return (
    <button className={"mode-card" + (active ? " on" : "")}
      data-mode={theme} onClick={onClick}>
      <div className="mode-preview">
        <span className="mp-sidebar" />
        <span className="mp-main">
          <span className="mp-row" />
          <span className="mp-row short" />
        </span>
      </div>
      <div className="mode-label">
        {label}
        {active && <Icon name="check" />}
      </div>
    </button>
  );
}

function SegRow({ options, value, onChange }) {
  return (
    <div className="seg-row">
      {options.map((o) => (
        <button key={o.value}
          className={"seg-btn" + (o.value === value ? " on" : "")}
          onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function AppearancePanel({ theme, setTheme, lang, setLang }) {
  return (
    <div className="set-panel">
      <div className="set-row">
        <div className="set-row-head">
          <div className="set-row-title">{tr(T.colorMode, lang)}</div>
          <div className="set-row-sub">{tr(T.colorModeDesc, lang)}</div>
        </div>
        <div className="mode-cards">
          <ModeCard theme="light" active={theme === "light"}
            label={tr(T.modeLight, lang)} onClick={() => setTheme("light")} />
          <ModeCard theme="dark"  active={theme === "dark"}
            label={tr(T.modeDark, lang)} onClick={() => setTheme("dark")} />
        </div>
      </div>

      <div className="set-row inline">
        <div className="set-row-head">
          <div className="set-row-title">{tr(T.language, lang)}</div>
          <div className="set-row-sub">{tr(T.languageDesc, lang)}</div>
        </div>
        <SegRow value={lang} onChange={setLang}
          options={[
            { value: "zh", label: tr(T.chinese, lang) },
            { value: "en", label: tr(T.english, lang) },
          ]} />
      </div>
    </div>
  );
}

function GeneralPanel({ lang }) {
  const [startup, setStartup] = useState(false);
  const [sendOnEnter, setSendOnEnter] = useState(true);
  return (
    <div className="set-panel">
      <div className="set-row inline">
        <div className="set-row-head">
          <div className="set-row-title">{tr(T.startupRun, lang)}</div>
          <div className="set-row-sub">{tr(T.startupRunDesc, lang)}</div>
        </div>
        <button className={"toggle" + (startup ? " on" : "")} onClick={() => setStartup(!startup)}>
          <span className="toggle-knob" />
        </button>
      </div>
      <div className="set-row inline">
        <div className="set-row-head">
          <div className="set-row-title">{tr(T.sendOnEnter, lang)}</div>
          <div className="set-row-sub">{tr(T.sendOnEnterDesc, lang)}</div>
        </div>
        <button className={"toggle" + (sendOnEnter ? " on" : "")} onClick={() => setSendOnEnter(!sendOnEnter)}>
          <span className="toggle-knob" />
        </button>
      </div>
    </div>
  );
}

function AboutPanel({ lang }) {
  return (
    <div className="set-panel about">
      <img className="about-logo" src="kurt_logo.svg" alt="Kurt" />
      <div className="about-name">Kurt</div>
      <div className="about-tag">{tr(T.aboutTagline, lang)}</div>
      <div className="about-ver">{tr(T.aboutVersion, lang)} 0.1.0</div>
    </div>
  );
}

function Settings({ theme, setTheme, lang, setLang, onClose }) {
  const [cat, setCat] = useState("appearance");
  const cats = [
    { id: "appearance", icon: "palette",  label: T.catAppearance },
    { id: "general",    icon: "sliders",  label: T.catGeneral },
    { id: "about",      icon: "info",     label: T.catAbout },
  ];
  return (
    <div className="settings">
      <div className="set-top">
        <div className="set-title">{tr(T.settings, lang)}</div>
        <button className="icon-btn" onClick={onClose} title={tr(T.close, lang)}>
          <Icon name="x" />
        </button>
      </div>
      <div className="set-body">
        <div className="set-nav">
          {cats.map((c) => (
            <div key={c.id} className={"set-nav-item" + (cat === c.id ? " active" : "")}
              onClick={() => setCat(c.id)}>
              <Icon name={c.icon} />
              <span>{tr(c.label, lang)}</span>
            </div>
          ))}
        </div>
        <div className="set-detail">
          {cat === "appearance" && <AppearancePanel theme={theme} setTheme={setTheme} lang={lang} setLang={setLang} />}
          {cat === "general"    && <GeneralPanel lang={lang} />}
          {cat === "about"      && <AboutPanel lang={lang} />}
        </div>
      </div>
    </div>
  );
}

/* ---------------- Detail Panel (floating card, multi-tab) ---------------- */
function DetailPanel({ panels, activePanelId, onSetActive, onClose, lang }) {
  if (!panels || panels.length === 0) return null;
  const activePanel = panels.find(function(p) { return p.id === activePanelId; }) || panels[0];
  var showTabs = panels.length > 1;
  var isCode = activePanel.forceCode || false;

  return (
    <div className="detail-panel">
      {showTabs && (
        <div className="dp-tabs">
          {panels.map(function(p) {
            return (
              <button key={p.id}
                className={"dp-tab" + (p.id === activePanel.id ? " active" : "")}
                onClick={function() { onSetActive(p.id); }}>
                <span>{p.title}</span>
                <span className="dp-tab-close" onClick={function(e) { e.stopPropagation(); onClose(p.id); }}>
                  <Icon name="x" />
                </span>
              </button>
            );
          })}
        </div>
      )}
      <div className="dp-head">
        <span className="dp-title">{activePanel.title}</span>
        {activePanel.subtitle && <span className="dp-subtitle">{activePanel.subtitle}</span>}
        <button className="icon-btn" style={{ marginLeft: 'auto' }} onClick={function() { onClose(activePanel.id); }} title={tr(T.close, lang)}>
          <Icon name="x" />
        </button>
      </div>
      <div className="dp-body">
        {isCode ? (
          <pre className="fp-code"><code>{activePanel.content || "// (empty)"}</code></pre>
        ) : (
          <div className="fp-md"><MdBlock text={activePanel.content || "(empty)"} /></div>
        )}
      </div>
    </div>
  );
}

/* ---- queue section inside composer — timeline style ---- */
function QueueSection({ items, onCancel, lang }) {
  if (!items || items.length === 0) return null;
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
              <button className="queue-cancel" onClick={() => onCancel(item.id)}
                title={tr(T.cancelQueued, lang)}>
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
function QueueBar({ items, onCancel, lang }) {
  return <QueueSection items={items} onCancel={onCancel} lang={lang} />;
}

Object.assign(window, {
  Icon, renderInline, MdBlock, Paras,
  ThinkingStep, TextStep, ToolStep, ReadStep, SkillStep,
  QueueBar, DetailPanel,
  Sidebar, Composer, Settings,
});
