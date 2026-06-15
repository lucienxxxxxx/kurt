/* global React, ReactDOM, AGENT, T, tr, Sidebar, Composer, ThinkingStep, TextStep, ToolStep, ReadStep, SkillStep, Icon, Settings, QueueBar, DetailPanel */
const { useState, useRef, useEffect, useCallback } = React;

let _uid = 1000;
const uid = () => ++_uid;
const withIds = (steps) => steps.map((s) => ({ ...s, _id: uid() }));

function App() {
  const [theme, setTheme] = useState("light");
  const [lang, setLang] = useState("zh");
  const [view, setView] = useState("chat"); // 'chat' | 'settings'

  const [thread, setThread] = useState(() => withIds(AGENT.sessions.s1.steps));
  const [activeId, setActiveId] = useState("s1");
  const [titleEntry, setTitleEntry] = useState(AGENT.sessions.s1.title);

  const [collapsed, setCollapsed] = useState(() => new Set());
  const [input, setInput] = useState("");

  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [liveId, setLiveId] = useState(null);
  const [runningId, setRunningId] = useState(null);
  const [queuedMsgs, setQueuedMsgs] = useState([]); // [{id, text}]
  const queuedMsgsRef = useRef([]);
  const [panels, setPanels] = useState([]);
  const [activePanelId, setActivePanelId] = useState(null);

  const queueRef = useRef([]);
  const timerRef = useRef(null);
  const pausedRef = useRef(false);
  const scrollRef = useRef(null);

  useEffect(() => { document.documentElement.setAttribute("data-theme", theme); }, [theme]);
  useEffect(() => { document.documentElement.setAttribute("lang", lang === "zh" ? "zh-CN" : "en"); }, [lang]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el && running) requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
  }, [thread, liveId, running]);
  useEffect(() => { const el = scrollRef.current; if (el) el.scrollTop = 0; }, [activeId]);

  const clearTimer = () => { if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; } };

  const scheduleNext = useCallback(function next() {
    if (pausedRef.current) return;
    if (queueRef.current.length === 0) {
      // run finished — check if there's a queued message
      const pending = queuedMsgsRef.current;
      if (pending.length > 0) {
        const [first, ...rest] = pending;
        queuedMsgsRef.current = rest;
        setQueuedMsgs(rest);
        const userStep = { type: "user", text: { zh: first.text, en: first.text }, _id: uid() };
        setThread((t) => [...t, userStep]);
        queueRef.current = AGENT.liveRun.slice();
        timerRef.current = setTimeout(next, 480);
      } else {
        setRunning(false); setLiveId(null); setRunningId(null);
      }
      return;
    }
    const step = queueRef.current.shift();
    const s = { ...step, _id: uid() };
    setThread((t) => [...t, s]);
    setLiveId(s._id);
    const delay = step.type === "tool" ? 1150 : step.type === "thinking" ? 1000
      : step.type === "read" ? 650 : 850;
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
      // enqueue instead of starting immediately
      const item = { id: uid(), text };
      const next = [...queuedMsgsRef.current, item];
      queuedMsgsRef.current = next;
      setQueuedMsgs(next);
      return;
    }
    const userStep = { type: "user", text: { zh: text, en: text }, _id: uid() };
    setThread((t) => [...t, userStep]);
    queueRef.current = AGENT.liveRun.slice();
    pausedRef.current = false;
    setPaused(false); setRunning(true); setRunningId(activeId);
    clearTimer();
    timerRef.current = setTimeout(scheduleNext, 480);
  };

  const cancelQueued = (id) => {
    const next = queuedMsgsRef.current.filter((m) => m.id !== id);
    queuedMsgsRef.current = next;
    setQueuedMsgs(next);
  };

  const openPanel = (panel) => {
    setPanels(prev => {
      const existing = prev.find(p => p.id === panel.id);
      if (existing) {
        setActivePanelId(panel.id);
        return prev;
      }
      setActivePanelId(panel.id);
      return [...prev, panel];
    });
  };

  const closePanel = (id) => {
    setPanels(prev => {
      const next = prev.filter(p => p.id !== id);
      setActivePanelId(prevActive => {
        if (prevActive === id) return next.length > 0 ? next[next.length - 1].id : null;
        return prevActive;
      });
      return next;
    });
  };

  const openFile = (file) => {
    const content = (window.FILE_CONTENT && window.FILE_CONTENT[file]) || `# ${file}\n\n(No preview available)`;
    const isCode = file.endsWith(".js") || file.endsWith(".ts") || file.endsWith(".json")
      || file.endsWith(".py") || file.endsWith(".rs") || file.endsWith(".css");
    openPanel({
      id: "file:" + file,
      type: "file",
      title: file.split("/").pop(),
      subtitle: file,
      content,
      forceCode: isCode,
    });
  };

  const openToolOutput = (info) => {
    openPanel({
      id: "output:" + (info.stepId || uid()),
      type: "output",
      title: info.name,
      subtitle: info.title,
      content: info.content,
      forceCode: true,
    });
  };

  const togglePause = () => {
    if (pausedRef.current) { pausedRef.current = false; setPaused(false); scheduleNext(); }
    else { pausedRef.current = true; setPaused(true); clearTimer(); }
  };

  const toggleStep = (id) => setCollapsed((s) => {
    const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n;
  });

  const loadSession = (id) => {
    stopRun();
    const sess = AGENT.sessions[id];
    if (!sess) return;
    setView("chat");
    setThread(withIds(sess.steps));
    setActiveId(id); setTitleEntry(sess.title);
    setCollapsed(new Set());
    setPanels([]); setActivePanelId(null);
  };

  const newChat = () => {
    stopRun();
    setView("chat");
    setThread([]); setActiveId(null); setTitleEntry(T.convNew); setCollapsed(new Set());
    setPanels([]); setActivePanelId(null);
  };

  // group thread into segments by user message
  const segments = [];
  thread.forEach((step) => {
    if (step.type === "user") segments.push({ user: step, steps: [] });
    else {
      if (segments.length === 0) segments.push({ user: null, steps: [] });
      segments[segments.length - 1].steps.push(step);
    }
  });

  const renderStep = (step) => {
    const open = !collapsed.has(step._id);
    const typing = step._id === liveId;
    switch (step.type) {
      case "thinking":
        return <ThinkingStep key={step._id} step={step} open={open}
          typing={typing} onToggle={() => toggleStep(step._id)} lang={lang} />;
      case "tool":
        return <ToolStep key={step._id} step={step} open={open}
          onToggle={() => toggleStep(step._id)} lang={lang}
          onOpenOutput={openToolOutput} />;
      case "read":
        return <ReadStep key={step._id} step={step} lang={lang} onOpen={openFile} />;
      case "skill":
        return <SkillStep key={step._id} step={step} open={open}
          onToggle={() => toggleStep(step._id)} lang={lang} />;
      default:
        return <TextStep key={step._id} step={step} typing={typing} lang={lang} />;
    }
  };

  return (
    <div className="window">
      <Sidebar
        recents={AGENT.recents}
        activeId={activeId}
        runningId={runningId}
        onPick={loadSession}
        onNewChat={newChat}
        theme={theme}
        onToggleTheme={() => setTheme((t) => t === "light" ? "dark" : "light")}
        onOpenSettings={() => setView(view === "settings" ? "chat" : "settings")}
        lang={lang}
      />

      <div className="main">
        {view === "settings" ? (
          <Settings theme={theme} setTheme={setTheme} lang={lang} setLang={setLang}
            onClose={() => setView("chat")} />
        ) : (
        <>
        <div className="main-chat">
        <div className="main-content">
        <div className="main-top">
          <div className="conv-title-wrap" data-value={tr(titleEntry, lang)}>
            <input
              className="conv-title-input"
              value={tr(titleEntry, lang)}
              onChange={(e) => setTitleEntry((prev) => ({ ...prev, [lang]: e.target.value }))}
              spellCheck={false}
            />
          </div>
        </div>

        <div className="main-lower">
          <div className="main-col">
            {thread.length === 0 ? (
              <div className="empty-state">
                <img className="empty-logo" src="kurt_logo.svg" alt="Kurt" />
                <h2>{tr(T.emptyTitle, lang)}</h2>
                <p>{tr(T.emptyDesc, lang)}</p>
                <div className="suggest-row">
                  {[T.suggest1, T.suggest2, T.suggest3].map((s, i) => (
                    <div key={i} className="suggest" onClick={() => { setInput(tr(s, lang)); }}>
                      {tr(s, lang)}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="thread-scroll" ref={scrollRef}>
                <div className="thread-inner">
                  {segments.map((seg, i) => (
                    <div key={i}>
                      {seg.user && <div className="query-box">{tr(seg.user.text, lang)}</div>}
                      {seg.steps.length > 0 && (
                        <div className="timeline">{seg.steps.map(renderStep)}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <Composer
              value={input}
              onChange={setInput}
              onSend={send}
              onStop={stopRun}
              running={running}
              queuedMsgs={queuedMsgs}
              onCancelQueued={cancelQueued}
              lang={lang}
            />
          </div>
        </div>
        </div>

        <DetailPanel
          panels={panels}
          activePanelId={activePanelId}
          onSetActive={setActivePanelId}
          onClose={closePanel}
          lang={lang}
        />
        </div>
        </>
        )}
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
