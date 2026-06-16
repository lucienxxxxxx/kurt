/** App root. UI state + thread rendering (ported from prototype/app.jsx). Runs are
 *  driven by the real engine via kurt-bridge (SSE) — see startRun. Sidebar recents
 *  remain the mock demos for now (browsable); a "New chat" send executes a REAL
 *  agent run. Live session list/reload from the bridge comes in the next increment. */

import { useEffect, useRef, useState } from "react";
import type { Lang, Loc, Panel, QueuedMsg, RawStep, Step, Theme } from "./types.ts";
import { T, tr } from "./i18n/strings.ts";
import { sessions, recents, FILE_CONTENT } from "./mocks/agent.ts";
import { runStream } from "./lib/bridge.ts";
import { bridgeUrl } from "./lib/bridgeUrl.ts";
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
  const [titleEntry, setTitleEntry] = useState<Loc>(sessions.s1!.title);

  const [collapsed, setCollapsed] = useState<Set<number>>(() => new Set());
  const [input, setInput] = useState("");

  const [running, setRunning] = useState(false);
  const [liveId, setLiveId] = useState<number | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [queuedMsgs, setQueuedMsgs] = useState<QueuedMsg[]>([]);
  const queuedMsgsRef = useRef<QueuedMsg[]>([]);
  const [panels, setPanels] = useState<Panel[]>([]);
  const [activePanelId, setActivePanelId] = useState<string | null>(null);

  // Bridge run plumbing: abort the in-flight run; the real session id for this
  // chat (so follow-up turns continue it); bridge step _id → app _id (bridge
  // numbers restart at 1 per run, so we remap to keep thread ids globally unique).
  const abortRef = useRef<AbortController | null>(null);
  const realSessionRef = useRef<string | null>(null);

  useEffect(() => { document.documentElement.setAttribute("data-theme", theme); try { localStorage.setItem("kurt-theme", theme); } catch { /* ignore */ } }, [theme]);
  useEffect(() => { document.documentElement.setAttribute("lang", lang === "zh" ? "zh-CN" : "en"); try { localStorage.setItem("kurt-lang", lang); } catch { /* ignore */ } }, [lang]);

  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => { const el = scrollRef.current; if (el && running) requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; }); }, [thread, liveId, running]);
  useEffect(() => { const el = scrollRef.current; if (el) el.scrollTop = 0; }, [activeId]);

  const upsert = (step: Step): void =>
    setThread((t) => {
      const i = t.findIndex((s) => s._id === step._id);
      if (i >= 0) { const next = t.slice(); next[i] = step; return next; }
      return [...t, step];
    });

  /** Execute one real run against the bridge, streaming steps into the thread. */
  const startRun = async (text: string): Promise<void> => {
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setRunning(true);
    setRunningId(activeId);
    const idMap = new Map<number, number>();
    try {
      await runStream(
        bridgeUrl(),
        { sessionId: realSessionRef.current ?? undefined, text },
        {
          onSession: (id) => { realSessionRef.current = id; },
          onStep: (bridgeStep) => {
            let appId = idMap.get(bridgeStep._id);
            if (appId === undefined) { appId = uid(); idMap.set(bridgeStep._id, appId); }
            upsert({ ...bridgeStep, _id: appId } as Step);
            setLiveId(appId);
          },
          onError: (message) => upsert({ _id: uid(), type: "text", text: `⚠ ${message}` }),
        },
        ctrl.signal,
      );
    } finally {
      abortRef.current = null;
      setLiveId(null);
      // Drain one queued message (continues the same real session).
      const [next, ...rest] = queuedMsgsRef.current;
      if (next) {
        queuedMsgsRef.current = rest;
        setQueuedMsgs(rest);
        setThread((t) => [...t, { _id: uid(), type: "user", text: next.text }]);
        void startRun(next.text);
      } else {
        setRunning(false);
        setRunningId(null);
      }
    }
  };

  const send = (): void => {
    const text = input.trim();
    if (!text) return;
    setInput("");
    if (running) {
      const item = { id: uid(), text };
      const nextQ = [...queuedMsgsRef.current, item];
      queuedMsgsRef.current = nextQ;
      setQueuedMsgs(nextQ);
      return;
    }
    setThread((t) => [...t, { _id: uid(), type: "user", text }]);
    void startRun(text);
  };

  const stopRun = (): void => {
    abortRef.current?.abort();
    abortRef.current = null;
    queuedMsgsRef.current = [];
    setQueuedMsgs([]);
    setRunning(false);
    setLiveId(null);
    setRunningId(null);
  };

  const cancelQueued = (id: number): void => {
    const next = queuedMsgsRef.current.filter((m) => m.id !== id);
    queuedMsgsRef.current = next;
    setQueuedMsgs(next);
  };

  const openPanel = (panel: Panel): void => {
    setPanels((prev) => { if (prev.find((p) => p.id === panel.id)) { setActivePanelId(panel.id); return prev; } setActivePanelId(panel.id); return [...prev, panel]; });
  };
  const closePanel = (id: string): void => {
    setPanels((prev) => {
      const next = prev.filter((p) => p.id !== id);
      setActivePanelId((cur) => (cur === id ? (next.length ? next[next.length - 1]!.id : null) : cur));
      return next;
    });
  };
  const openFile = (file: string): void => {
    const content = FILE_CONTENT[file] ?? `# ${file}\n\n(No preview available)`;
    const isCode = /\.(js|ts|json|py|rs|css)$/.test(file);
    openPanel({ id: "file:" + file, type: "file", title: file.split("/").pop()!, subtitle: file, content, forceCode: isCode });
  };
  const openToolOutput = (info: OpenOutput): void => {
    openPanel({ id: "output:" + info.stepId, type: "output", title: info.name, subtitle: info.title, content: info.content, forceCode: true });
  };

  const toggleStep = (id: number): void => setCollapsed((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const loadSession = (id: string): void => {
    stopRun();
    const sess = sessions[id];
    if (!sess) return;
    realSessionRef.current = null; // mock demos aren't real bridge sessions
    setView("chat");
    setThread(withIds(sess.steps));
    setActiveId(id); setTitleEntry(sess.title);
    setCollapsed(new Set()); setPanels([]); setActivePanelId(null);
  };
  const newChat = (): void => {
    stopRun();
    realSessionRef.current = null;
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
                    onChange={(e) => setTitleEntry((prev) => (typeof prev === "string" ? e.target.value : { ...prev, [lang]: e.target.value }))} />
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
                            {seg.user && <div className="query-box">{tr(seg.user.type === "user" ? seg.user.text : "", lang)}</div>}
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
