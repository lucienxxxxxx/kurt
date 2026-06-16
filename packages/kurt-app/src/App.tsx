/** App root (ported from prototype/app.jsx). Holds UI state, groups the thread
 *  into per-user-message segments, and (for 6.1) fakes the live run with timers
 *  over the mock `liveRun`. In 6.3 the timer loop is replaced by the kurt-bridge
 *  SSE stream; the rendering + state shape stay the same. */

import { useCallback, useEffect, useRef, useState } from "react";
import type { Lang, Panel, QueuedMsg, RawStep, Step, Theme } from "./types.ts";
import { T, tr } from "./i18n/strings.ts";
import { sessions, recents, liveRun, FILE_CONTENT } from "./mocks/agent.ts";
import { Sidebar } from "./components/Sidebar.tsx";
import { Composer } from "./components/Composer.tsx";
import { Settings } from "./components/Settings.tsx";
import { DetailPanel } from "./components/DetailPanel.tsx";
import { renderStep, type OpenOutput } from "./components/thread/steps.tsx";
import logo from "./assets/kurt_logo.svg";

let _uid = 1000;
const uid = () => ++_uid;
const withIds = (steps: RawStep[]): Step[] => steps.map((s) => ({ ...s, _id: uid() }) as Step);

const persisted = <V extends string>(key: string, fallback: V): V => {
  try { const v = localStorage.getItem(key); return v === null ? fallback : (v as V); } catch { return fallback; }
};

export default function App() {
  const [theme, setTheme] = useState<Theme>(() => persisted<Theme>("kurt-theme", "light"));
  const [lang, setLang] = useState<Lang>(() => persisted<Lang>("kurt-lang", "zh"));
  const [view, setView] = useState<"chat" | "settings">("chat");

  const [thread, setThread] = useState<Step[]>(() => withIds(sessions.s1!.steps));
  const [activeId, setActiveId] = useState<string | null>("s1");
  const [titleEntry, setTitleEntry] = useState(sessions.s1!.title);

  const [collapsed, setCollapsed] = useState<Set<number>>(() => new Set());
  const [input, setInput] = useState("");

  const [running, setRunning] = useState(false);
  const [, setPaused] = useState(false);
  const [liveId, setLiveId] = useState<number | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [queuedMsgs, setQueuedMsgs] = useState<QueuedMsg[]>([]);
  const queuedMsgsRef = useRef<QueuedMsg[]>([]);
  const [panels, setPanels] = useState<Panel[]>([]);
  const [activePanelId, setActivePanelId] = useState<string | null>(null);

  const queueRef = useRef<RawStep[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pausedRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => { document.documentElement.setAttribute("data-theme", theme); try { localStorage.setItem("kurt-theme", theme); } catch { /* ignore */ } }, [theme]);
  useEffect(() => { document.documentElement.setAttribute("lang", lang === "zh" ? "zh-CN" : "en"); try { localStorage.setItem("kurt-lang", lang); } catch { /* ignore */ } }, [lang]);

  useEffect(() => { const el = scrollRef.current; if (el && running) requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; }); }, [thread, liveId, running]);
  useEffect(() => { const el = scrollRef.current; if (el) el.scrollTop = 0; }, [activeId]);

  const clearTimer = () => { if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; } };

  const scheduleNext = useCallback(function next() {
    if (pausedRef.current) return;
    if (queueRef.current.length === 0) {
      const pending = queuedMsgsRef.current;
      if (pending.length > 0) {
        const [first, ...rest] = pending;
        queuedMsgsRef.current = rest;
        setQueuedMsgs(rest);
        const userStep: Step = { type: "user", text: { zh: first!.text, en: first!.text }, _id: uid() };
        setThread((t) => [...t, userStep]);
        queueRef.current = liveRun.slice();
        timerRef.current = setTimeout(next, 480);
      } else {
        setRunning(false); setLiveId(null); setRunningId(null);
      }
      return;
    }
    const step = queueRef.current.shift()!;
    const s = { ...step, _id: uid() } as Step;
    setThread((t) => [...t, s]);
    setLiveId(s._id);
    const delay = step.type === "tool" ? 1150 : step.type === "thinking" ? 1000 : step.type === "read" ? 650 : 850;
    timerRef.current = setTimeout(next, delay);
  }, []);

  const stopRun = useCallback(() => {
    clearTimer(); queueRef.current = []; pausedRef.current = false;
    queuedMsgsRef.current = []; setQueuedMsgs([]);
    setPaused(false); setRunning(false); setLiveId(null); setRunningId(null);
  }, []);

  const send = () => {
    const text = input.trim();
    if (!text) return;
    setInput("");
    if (running) {
      const item = { id: uid(), text };
      const next = [...queuedMsgsRef.current, item];
      queuedMsgsRef.current = next;
      setQueuedMsgs(next);
      return;
    }
    const userStep: Step = { type: "user", text: { zh: text, en: text }, _id: uid() };
    setThread((t) => [...t, userStep]);
    queueRef.current = liveRun.slice();
    pausedRef.current = false;
    setPaused(false); setRunning(true); setRunningId(activeId);
    clearTimer();
    timerRef.current = setTimeout(scheduleNext, 480);
  };

  const cancelQueued = (id: number) => {
    const next = queuedMsgsRef.current.filter((m) => m.id !== id);
    queuedMsgsRef.current = next;
    setQueuedMsgs(next);
  };

  const openPanel = (panel: Panel) => {
    setPanels((prev) => { if (prev.find((p) => p.id === panel.id)) { setActivePanelId(panel.id); return prev; } setActivePanelId(panel.id); return [...prev, panel]; });
  };
  const closePanel = (id: string) => {
    setPanels((prev) => {
      const next = prev.filter((p) => p.id !== id);
      setActivePanelId((cur) => (cur === id ? (next.length ? next[next.length - 1]!.id : null) : cur));
      return next;
    });
  };
  const openFile = (file: string) => {
    const content = FILE_CONTENT[file] ?? `# ${file}\n\n(No preview available)`;
    const isCode = /\.(js|ts|json|py|rs|css)$/.test(file);
    openPanel({ id: "file:" + file, type: "file", title: file.split("/").pop()!, subtitle: file, content, forceCode: isCode });
  };
  const openToolOutput = (info: OpenOutput) => {
    openPanel({ id: "output:" + info.stepId, type: "output", title: info.name, subtitle: info.title, content: info.content, forceCode: true });
  };

  const toggleStep = (id: number) => setCollapsed((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const loadSession = (id: string) => {
    stopRun();
    const sess = sessions[id];
    if (!sess) return;
    setView("chat");
    setThread(withIds(sess.steps));
    setActiveId(id); setTitleEntry(sess.title);
    setCollapsed(new Set()); setPanels([]); setActivePanelId(null);
  };
  const newChat = () => {
    stopRun();
    setView("chat");
    setThread([]); setActiveId(null); setTitleEntry(T.convNew); setCollapsed(new Set());
    setPanels([]); setActivePanelId(null);
  };

  // group thread into segments by user message
  const segments: { user: Step | null; steps: Step[] }[] = [];
  thread.forEach((step) => {
    if (step.type === "user") segments.push({ user: step, steps: [] });
    else { if (!segments.length) segments.push({ user: null, steps: [] }); segments[segments.length - 1]!.steps.push(step); }
  });

  const stepCtx = { lang, collapsed, liveId, onToggle: toggleStep, onOpenFile: openFile, onOpenOutput: openToolOutput };

  return (
    <div className="window">
      <Sidebar recents={recents} activeId={activeId} runningId={runningId} onPick={loadSession} onNewChat={newChat}
        lang={lang} onOpenSettings={() => setView(view === "settings" ? "chat" : "settings")} />

      <div className="main">
        {view === "settings" ? (
          <Settings theme={theme} setTheme={setTheme} lang={lang} setLang={setLang} onClose={() => setView("chat")} />
        ) : (
          <div className="main-chat">
            <div className="main-content">
              <div className="main-top" data-tauri-drag-region>
                <div className="conv-title-wrap" data-value={tr(titleEntry, lang)}>
                  <input className="conv-title-input" value={tr(titleEntry, lang)} spellCheck={false}
                    onChange={(e) => setTitleEntry((prev) => ({ ...prev, [lang]: e.target.value }))} />
                </div>
              </div>

              <div className="main-lower">
                <div className="main-col">
                  {thread.length === 0 ? (
                    <div className="empty-state">
                      <img className="empty-logo" src={logo} alt="Kurt" />
                      <h2>{tr(T.emptyTitle, lang)}</h2>
                      <p>{tr(T.emptyDesc, lang)}</p>
                      <div className="suggest-row">
                        {[T.suggest1, T.suggest2, T.suggest3].map((s, i) => (
                          <div key={i} className="suggest" onClick={() => setInput(tr(s, lang))}>{tr(s, lang)}</div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="thread-scroll" ref={scrollRef}>
                      <div className="thread-inner">
                        {segments.map((seg, i) => (
                          <div key={i}>
                            {seg.user && <div className="query-box">{tr(seg.user.type === "user" ? seg.user.text : null, lang)}</div>}
                            {seg.steps.length > 0 && <div className="timeline">{seg.steps.map((s) => renderStep(s, stepCtx))}</div>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <Composer value={input} onChange={setInput} onSend={send} onStop={stopRun}
                    running={running} queuedMsgs={queuedMsgs} onCancelQueued={cancelQueued} lang={lang} />
                </div>
              </div>
            </div>

            <DetailPanel panels={panels} activePanelId={activePanelId} onSetActive={setActivePanelId} onClose={closePanel} lang={lang} />
          </div>
        )}
      </div>
    </div>
  );
}
