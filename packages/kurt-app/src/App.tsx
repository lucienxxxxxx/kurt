/** App root. UI state + thread rendering (layout ported from prototype/app.jsx).
 *  Runs and sessions are real, via kurt-bridge: startRun streams a turn over SSE;
 *  the sidebar lists the bridge's sessions and loading one reconstructs its steps. */

import { useCallback, useEffect, useRef, useState } from "react";
import type { Effort, Lang, Loc, Mode, Panel, QueuedMsg, SessionMeta, Step, Theme } from "./types.ts";
import { T, tr } from "./i18n/strings.ts";
import { runStream, listSessions, getSession, getInfo, approve, type ApprovalRequest } from "./lib/bridge.ts";
import { resolveBridgeUrl } from "./lib/bridgeUrl.ts";
import { Sidebar } from "./components/Sidebar.tsx";
import { Composer } from "./components/Composer.tsx";
import { Settings } from "./components/Settings.tsx";
import { Approval } from "./components/Approval.tsx";
import { DetailPanel } from "./components/DetailPanel.tsx";
import { renderStep, type OpenOutput } from "./components/thread/steps.tsx";
import { MdBlock } from "./components/Markdown.tsx";
import logo from "./assets/kurt_logo.svg";

let _uid = 1000;
const uid = () => ++_uid;

const persisted = <V extends string>(key: string, fallback: V): V => {
  try { const v = localStorage.getItem(key); return v === null ? fallback : (v as V); } catch { return fallback; }
};

export default function App() {
  const [theme, setTheme] = useState<Theme>(() => persisted<Theme>("kurt-theme", "light"));
  const [lang, setLang] = useState<Lang>(() => persisted<Lang>("kurt-lang", "zh"));
  const [view, setView] = useState<"chat" | "settings">("chat");

  const [thread, setThread] = useState<Step[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [titleEntry, setTitleEntry] = useState<Loc>(T.convNew);
  const [sessionList, setSessionList] = useState<SessionMeta[]>([]);
  // Sessions whose run finished while you weren't viewing them → unread dot.
  const [unread, setUnread] = useState<Set<string>>(() => new Set());

  const [collapsed, setCollapsed] = useState<Set<number>>(() => new Set());
  const [input, setInput] = useState("");
  const [model, setModel] = useState("");
  const [models, setModels] = useState<string[]>([]);
  const [effort, setEffort] = useState<Effort>("med");
  const [mode, setMode] = useState<Mode>(() => persisted<Mode>("kurt-mode", "agent"));
  const [thinking, setThinking] = useState<boolean>(() => { try { return localStorage.getItem("kurt-thinking") === "1"; } catch { return false; } });

  const [running, setRunning] = useState(false);
  const [liveId, setLiveId] = useState<number | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [queuedMsgs, setQueuedMsgs] = useState<QueuedMsg[]>([]);
  const queuedMsgsRef = useRef<QueuedMsg[]>([]);
  const [panels, setPanels] = useState<Panel[]>([]);
  const [activePanelId, setActivePanelId] = useState<string | null>(null);
  // Approvals are keyed by the session their run belongs to, so switching
  // sessions doesn't lose a pending prompt — it re-appears when you switch back.
  const [pendingApprovals, setPendingApprovals] = useState<Record<string, ApprovalRequest>>({});
  const approvalKey = (id: string | null): string => id ?? "";

  const abortRef = useRef<AbortController | null>(null);
  const realSessionRef = useRef<string | null>(null);
  const activeIdRef = useRef<string | null>(null);     // latest activeId, for stream callbacks
  const runSidRef = useRef<string | null>(null);       // session id the active run belongs to
  const runBufRef = useRef<Step[]>([]);                // the running session's accumulated steps
  const setActive = useCallback((id: string | null): void => { activeIdRef.current = id; setActiveId(id); }, []);

  useEffect(() => { document.documentElement.setAttribute("data-theme", theme); try { localStorage.setItem("kurt-theme", theme); } catch { /* ignore */ } }, [theme]);
  useEffect(() => { document.documentElement.setAttribute("lang", lang === "zh" ? "zh-CN" : "en"); try { localStorage.setItem("kurt-lang", lang); } catch { /* ignore */ } }, [lang]);
  useEffect(() => { try { localStorage.setItem("kurt-mode", mode); } catch { /* ignore */ } }, [mode]);
  useEffect(() => { try { localStorage.setItem("kurt-thinking", thinking ? "1" : "0"); } catch { /* ignore */ } }, [thinking]);

  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => { const el = scrollRef.current; if (el && running) requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; }); }, [thread, liveId, running]);
  // On session switch, jump straight to the latest message (bottom), not the top.
  useEffect(() => { const el = scrollRef.current; if (el) requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; }); }, [activeId]);

  const refreshSessions = useCallback(async (): Promise<void> => {
    try {
      const list = await listSessions(await resolveBridgeUrl());
      setSessionList(list.map((s) => ({ id: s.id, title: s.title || tr(T.convNew, "en"), icon: "chat" })));
    } catch { /* bridge not ready — leave the list as-is */ }
  }, []);
  useEffect(() => { void refreshSessions(); }, [refreshSessions]);
  // Available models + current default for the composer's model menu.
  useEffect(() => {
    void (async () => {
      try {
        const info = await getInfo(await resolveBridgeUrl());
        if (info) { setModels(info.models); setModel((m) => m || info.model); }
      } catch { /* bridge not ready */ }
    })();
  }, []);

  /** Upsert a step into the running session's buffer; mirror to the visible
   *  thread only while that session is the one being viewed (so a run that
   *  continues after you switch away doesn't leak into another conversation). */
  const upsertRun = (sid: string | null, step: Step): void => {
    const buf = runBufRef.current;
    const i = buf.findIndex((s) => s._id === step._id);
    if (i >= 0) buf[i] = step; else buf.push(step);
    if (activeIdRef.current === sid) setThread(buf.slice());
  };

  /** Execute one real run against the bridge, streaming steps into the run buffer. */
  const startRun = async (text: string): Promise<void> => {
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setRunning(true);
    runSidRef.current = realSessionRef.current; // session this run belongs to (null = new chat)
    const idMap = new Map<number, number>();
    try {
      const base = await resolveBridgeUrl();
      await runStream(
        base,
        { sessionId: realSessionRef.current ?? undefined, text, model: model || undefined, effort, thinking, mode },
        {
          onSession: (id) => {
            realSessionRef.current = id;
            runSidRef.current = id;
            setRunningId(id);
            if (activeIdRef.current === null) setActive(id); // follow a brand-new chat to its session
          },
          onStep: (bridgeStep) => {
            let appId = idMap.get(bridgeStep._id);
            if (appId === undefined) { appId = uid(); idMap.set(bridgeStep._id, appId); }
            upsertRun(runSidRef.current, { ...bridgeStep, _id: appId } as Step);
            setLiveId(appId);
          },
          onApproval: (req) => setPendingApprovals((m) => ({ ...m, [approvalKey(runSidRef.current)]: req })),
          onError: (message) => upsertRun(runSidRef.current, { _id: uid(), type: "text", text: `⚠ ${message}` }),
        },
        ctrl.signal,
      );
    } finally {
      abortRef.current = null;
      setLiveId(null);
      // This run's approval (if any) is now resolved/aborted — drop it.
      setPendingApprovals((m) => { const n = { ...m }; delete n[approvalKey(runSidRef.current)]; return n; });
      const [next, ...rest] = queuedMsgsRef.current;
      if (next) {
        queuedMsgsRef.current = rest;
        setQueuedMsgs(rest);
        const userStep: Step = { _id: uid(), type: "user", text: next.text };
        runBufRef.current = [...runBufRef.current, userStep];
        if (activeIdRef.current === runSidRef.current) setThread(runBufRef.current.slice());
        void startRun(next.text);
      } else {
        setRunning(false);
        setRunningId(null);
        // Finished while you were looking elsewhere → mark its sidebar dot unread.
        const sid = runSidRef.current;
        if (sid && sid !== activeIdRef.current) setUnread((u) => new Set(u).add(sid));
        void refreshSessions(); // the new/updated session now shows in the sidebar
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
    // Seed the run buffer with the current thread + this message, then run.
    const userStep: Step = { _id: uid(), type: "user", text };
    runBufRef.current = [...thread, userStep];
    setThread(runBufRef.current.slice());
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
    // bridge resolves the prompt as "deny" on abort — drop this run's approval
    const key = approvalKey(runSidRef.current);
    setPendingApprovals((m) => { const n = { ...m }; delete n[key]; return n; });
  };

  const decideApproval = (decision: "allow" | "always" | "deny"): void => {
    const key = approvalKey(activeId);
    const req = pendingApprovals[key];
    if (!req) return;
    setPendingApprovals((m) => { const n = { ...m }; delete n[key]; return n; });
    void (async () => {
      try { await approve(await resolveBridgeUrl(), req.id, decision); } catch { /* ignore */ }
    })();
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
    // Real file preview (serving content from the bridge) is a later touch.
    const isCode = /\.(js|ts|json|py|rs|css)$/.test(file);
    openPanel({ id: "file:" + file, type: "file", title: file.split("/").pop()!, subtitle: file, content: `# ${file}\n\n(No preview available yet)`, forceCode: isCode });
  };
  const openToolOutput = (info: OpenOutput): void => {
    openPanel({ id: "output:" + info.stepId, type: "output", title: info.name, subtitle: info.title, content: info.content, forceCode: true });
  };

  const toggleStep = (id: number): void => setCollapsed((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const loadSession = async (id: string): Promise<void> => {
    // Do NOT stop the active run: switching away keeps it (and any pending
    // approval) alive; switching back restores its live buffer.
    setView("chat");
    realSessionRef.current = id;
    setUnread((u) => { if (!u.has(id)) return u; const n = new Set(u); n.delete(id); return n; }); // clicking clears the unread dot
    setCollapsed(new Set()); setPanels([]); setActivePanelId(null);
    if (id === runningId) {
      setActive(id);
      setThread(runBufRef.current.slice());
      const meta = sessionList.find((s) => s.id === id);
      if (meta) setTitleEntry(meta.title);
      return;
    }
    try {
      const detail = await getSession(await resolveBridgeUrl(), id);
      if (!detail) return;
      setActive(id);
      setThread(detail.steps);
      setTitleEntry(detail.title || T.convNew);
    } catch { /* ignore */ }
  };
  const newChat = (): void => {
    stopRun();
    realSessionRef.current = null;
    runBufRef.current = [];
    setView("chat");
    setThread([]); setActive(null); setTitleEntry(T.convNew); setCollapsed(new Set());
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
      <Sidebar recents={sessionList} activeId={activeId} runningId={runningId} unread={unread} onPick={loadSession} onNewChat={newChat}
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
                            {seg.user && <div className="query-box"><MdBlock text={tr(seg.user.type === "user" ? seg.user.text : "", lang)} /></div>}
                            {seg.steps.length > 0 && <div className="timeline">{seg.steps.map((s) => renderStep(s, stepCtx))}</div>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <Composer value={input} onChange={setInput} onSend={send} onStop={stopRun}
                    running={running} queuedMsgs={queuedMsgs} onCancelQueued={cancelQueued} lang={lang}
                    model={model} models={models} onModelChange={setModel} effort={effort} onEffortChange={setEffort}
                    mode={mode} onModeChange={setMode} thinking={thinking} onThinkingToggle={() => setThinking((v) => !v)}
                    approval={pendingApprovals[approvalKey(activeId)] ? <Approval req={pendingApprovals[approvalKey(activeId)]!} lang={lang} onDecide={decideApproval} /> : null} />
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
