/** App root. UI state + thread rendering (layout ported from prototype/app.jsx).
 *  Runs and sessions are real, via kurt-bridge: each conversation streams its turn
 *  over SSE independently (runs continue in the background when you switch away);
 *  the sidebar lists the bridge's sessions and loading one reconstructs its steps. */

import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import type { Effort, Lang, Loc, Mode, QueuedMsg, SessionMeta, Step, Tab, TabKind, TabsState, Theme } from "./types.ts";
import { T, tr } from "./i18n/strings.ts";
import { runStream, listSessions, getSession, getInfo, approve, answer, truncateSession, deleteSession, readFile, rawFileUrl, type ApprovalRequest, type AskRequest, type PlanStep, type ProviderGroup } from "./lib/bridge.ts";
import { resolveBridgeUrl } from "./lib/bridgeUrl.ts";
import { externalLinkFromClick, openExternal } from "./lib/external.ts";
import { fmtElapsed, fmtTokens } from "./lib/format.ts";
import { initTabs, tabsReducer, type TabsAction } from "./lib/tabs.ts";
import { isNearBottom } from "./lib/scroll.ts";
import { playSend, runComplete } from "./lib/notify.ts";
import { pickFolder } from "./lib/dialog.ts";
import { Sidebar } from "./components/Sidebar.tsx";
import { Composer } from "./components/Composer.tsx";
import { Settings } from "./components/Settings.tsx";
import { Approval } from "./components/Approval.tsx";
import { Ask } from "./components/Ask.tsx";
import { Workspace } from "./components/workspace/Workspace.tsx";
import { PreviewTab, previewKindFor } from "./components/workspace/PreviewTab.tsx";
import { FilesTab } from "./components/workspace/FilesTab.tsx";
const TerminalTab = lazy(() => import("./components/workspace/TerminalTab.tsx").then((m) => ({ default: m.TerminalTab })));
import { PlanTab } from "./components/workspace/PlanTab.tsx";
import { renderStep, type OpenOutput } from "./components/thread/steps.tsx";
import { MdBlock } from "./components/Markdown.tsx";
import { CopyButton, MessageTime } from "./components/MessageActions.tsx";
import { ContextMeter } from "./components/ContextMeter.tsx";
import { Icon } from "./components/Icon.tsx";
import logo from "./assets/kurt_logo.svg";

let _uid = 1000;
const uid = () => ++_uid;

/** One in-flight agent run. Lives until its turn(s) finish or it's aborted.
 *  Runs are independent per conversation, so several can stream at once. */
interface Run {
  runId: number;
  sessionId: string | null;   // resolved on the first SSE frame (null = brand-new chat until then)
  ctrl: AbortController;       // replaced per turn (a run may continue through its queue)
  buf: Step[];                // this conversation's accumulated steps
  idMap: Map<number, number>; // bridge step _id → app uid, for the current turn
  queue: QueuedMsg[];         // messages queued onto THIS run while it streams
  startedAt: number;          // for the elapsed-time readout
  tokens: number;             // cumulative total tokens reported via usage frames
  contextTokens: number;      // latest call's input/prompt tokens = current context size (API)
  previewables: string[];     // previewable docs (md/html/pdf) written this run → auto-preview on done
  workspace: string;          // the conversation's workspace for this run
}

/** A user prompt awaiting a decision — a sensitive-op approval or an ask_user. */
type Prompt = { kind: "approval"; req: ApprovalRequest } | { kind: "ask"; req: AskRequest };

const persisted = <V extends string>(key: string, fallback: V): V => {
  try { const v = localStorage.getItem(key); return v === null ? fallback : (v as V); } catch { return fallback; }
};

/** A short label for what the run is doing right now, from the live step. */
function liveActivity(thread: Step[], liveId: number | null, lang: Lang): string {
  const s = liveId != null ? thread.find((x) => x._id === liveId) : undefined;
  if (!s) return tr(T.actWorking, lang);
  switch (s.type) {
    case "thinking": return tr(T.actThinking, lang);
    case "text": return tr(T.actReplying, lang);
    case "tool": return tr(T.actRunning, lang, { name: s.name });
    case "read": return tr(T.actReading, lang, { name: s.file.split("/").pop() || s.file });
    case "skill": return tr(T.actSkill, lang, { name: s.name });
    default: return tr(T.actWorking, lang);
  }
}

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
  const [model, setModel] = useState<string>(() => persisted<string>("kurt-model", ""));
  const [models, setModels] = useState<string[]>([]);
  const [modelGroups, setModelGroups] = useState<ProviderGroup[]>([]);
  const [workspace, setWorkspace] = useState<string>(""); // bridge default workspace (fallback)
  // The viewed conversation's workspace (folder picker). New chats default to the
  // last-picked dir (persisted), then the bridge default.
  const [convWorkspace, setConvWorkspace] = useState<string>(() => { try { return localStorage.getItem("kurt-workspace") || ""; } catch { return ""; } });
  const [effort, setEffort] = useState<Effort>(() => persisted<Effort>("kurt-effort", "med"));
  const [mode, setMode] = useState<Mode>(() => persisted<Mode>("kurt-mode", "agent"));
  const [thinking, setThinking] = useState<boolean>(() => { try { return localStorage.getItem("kurt-thinking") === "1"; } catch { return false; } });
  // When on, thinking/tool/skill detail cards start collapsed (only the main text shows).
  const [collapseDetails, setCollapseDetails] = useState<boolean>(() => { try { return localStorage.getItem("kurt-collapse-details") === "1"; } catch { return false; } });

  const [liveId, setLiveId] = useState<number | null>(null);
  // Which sessions have an in-flight run (sidebar dots + composer state). A run
  // in a brand-new chat isn't here until its id resolves; newChatRunId covers that.
  const [runningIds, setRunningIds] = useState<Set<string>>(() => new Set());
  const [newChatRunId, setNewChatRunId] = useState<number | null>(null);
  const [queuedMsgs, setQueuedMsgs] = useState<QueuedMsg[]>([]); // the VIEWED run's queue
  // Live run readout for the VIEWED conversation (elapsed + tokens); null when idle.
  const [viewStats, setViewStats] = useState<{ startedAt: number; tokens: number; contextTokens: number } | null>(null);
  const [loadingSession, setLoadingSession] = useState(false); // fetching a session's steps (no cache yet)
  const [, forceTick] = useState(0);
  // Workspace tabs are PER conversation: each session id (and "new" for the unsaved
  // chat) maps to its own tabs/split layout. `tabs` mirrors the viewed session's.
  const sessionTabTitle = tr(T.tabSession, lang);
  const [tabsMap, setTabsMap] = useState<Record<string, TabsState>>({});
  const tabs = tabsMap[activeId ?? "new"] ?? initTabs(sessionTabTitle);
  const dispatchTabs = useCallback((action: TabsAction): void => {
    const key = activeIdRef.current ?? "new";
    setTabsMap((m) => ({ ...m, [key]: tabsReducer(m[key] ?? initTabs(sessionTabTitle), action) }));
  }, [sessionTabTitle]);
  const tabCounter = useRef(0);
  const plansRef = useRef<Map<string, PlanStep[]>>(new Map()); // latest plan per session (live, per launch)
  const autoPlanRef = useRef<Set<string>>(new Set());          // sessions whose Plan tab was auto-opened
  const [viewPlan, setViewPlan] = useState<PlanStep[] | undefined>(undefined); // plan of the viewed session
  // Approvals are keyed by the session their run belongs to, so switching
  // sessions doesn't lose a pending prompt — it re-appears when you switch back.
  // Per-session QUEUE of prompts (approvals + ask_user). Parallel tool calls can
  // raise several at once; we present them one at a time (FIFO) so the user handles
  // them in order instead of later ones clobbering earlier ones.
  const [prompts, setPrompts] = useState<Record<string, Prompt[]>>({});
  const approvalKey = (id: string | null): string => id ?? "";
  const enqueuePrompt = (sid: string, p: Prompt): void =>
    setPrompts((m) => {
      const q = m[sid] ?? [];
      if (q.some((x) => x.req.id === p.req.id)) return m; // de-dupe re-sent frames
      return { ...m, [sid]: [...q, p] };
    });
  const dropPrompt = (sid: string, id: string): void =>
    setPrompts((m) => { const q = (m[sid] ?? []).filter((x) => x.req.id !== id); return { ...m, [sid]: q }; });

  const runsRef = useRef<Map<number, Run>>(new Map()); // in-flight runs, by runId
  const sessionCache = useRef<Map<string, Step[]>>(new Map()); // last-known steps per session → instant, blank-free switches
  const activeIdRef = useRef<string | null>(null);     // latest activeId, for stream callbacks
  const newChatRunIdRef = useRef<number | null>(null); // mirror of newChatRunId for callbacks
  const setActive = useCallback((id: string | null): void => { activeIdRef.current = id; setActiveId(id); }, []);
  const setNewChatRun = useCallback((rid: number | null): void => { newChatRunIdRef.current = rid; setNewChatRunId(rid); }, []);

  // Resolve the run (if any) for a session id / for the conversation in view.
  const runForSession = (id: string): Run | undefined => {
    for (const r of runsRef.current.values()) if (r.sessionId === id) return r;
    return undefined;
  };
  const viewedRun = (): Run | undefined => {
    const id = activeIdRef.current;
    if (id !== null) return runForSession(id);
    const rid = newChatRunIdRef.current;
    return rid !== null ? runsRef.current.get(rid) : undefined;
  };
  // Is `run` the conversation currently on screen? (handles the unsaved-new-chat case)
  const isViewing = (run: Run): boolean =>
    run.sessionId !== null
      ? run.sessionId === activeIdRef.current
      : activeIdRef.current === null && newChatRunIdRef.current === run.runId;

  // Is the conversation in view running? (drives the composer's send/stop state)
  const viewRunning = activeId !== null ? runningIds.has(activeId) : newChatRunId !== null;

  // Links in agent/user content must open in the system browser, NOT navigate
  // the app's own webview (which would replace the UI). Intercept clicks globally.
  useEffect(() => {
    const onClick = (e: MouseEvent): void => {
      const href = externalLinkFromClick(e);
      if (!href) return;
      e.preventDefault();
      void openExternal(href);
    };
    document.addEventListener("click", onClick, true); // capture: beat any inner handler
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = (): void => {
      const resolved = theme === "system" ? (mq.matches ? "dark" : "light") : theme;
      document.documentElement.setAttribute("data-theme", resolved);
    };
    apply();
    try { localStorage.setItem("kurt-theme", theme); } catch { /* ignore */ }
    if (theme !== "system") return;
    mq.addEventListener("change", apply); // follow the OS while on "system"
    return () => mq.removeEventListener("change", apply);
  }, [theme]);
  useEffect(() => { document.documentElement.setAttribute("lang", lang === "zh" ? "zh-CN" : "en"); try { localStorage.setItem("kurt-lang", lang); } catch { /* ignore */ } }, [lang]);
  useEffect(() => { try { localStorage.setItem("kurt-mode", mode); } catch { /* ignore */ } }, [mode]);
  useEffect(() => { try { localStorage.setItem("kurt-effort", effort); } catch { /* ignore */ } }, [effort]);
  useEffect(() => { if (model) try { localStorage.setItem("kurt-model", model); } catch { /* ignore */ } }, [model]);
  useEffect(() => { try { localStorage.setItem("kurt-thinking", thinking ? "1" : "0"); } catch { /* ignore */ } }, [thinking]);
  useEffect(() => { try { localStorage.setItem("kurt-collapse-details", collapseDetails ? "1" : "0"); } catch { /* ignore */ } }, [collapseDetails]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollPos = useRef<Map<string, number>>(new Map()); // sessionId ("" = new chat) → last scrollTop
  const wantScroll = useRef(false); // a switch happened → restore/jump once the thread is on screen
  // Conditional bottom-follow: while the user is at (or near) the bottom we keep
  // pinning to the latest content as it streams; the moment they scroll up we stop
  // hijacking their position and surface a "jump to latest" affordance instead.
  const followRef = useRef(true);
  const [showJump, setShowJump] = useState(false);
  const nearBottom = (el: HTMLElement): boolean => isNearBottom(el);
  const onThreadScroll = (): void => {
    const el = scrollRef.current;
    if (!el) return;
    scrollPos.current.set(activeIdRef.current ?? "", el.scrollTop);
    const near = nearBottom(el);
    followRef.current = near;            // scrolled up → stop following; back near bottom → resume
    if (near) setShowJump((v) => (v ? false : v));
  };
  const jumpToLatest = (): void => {
    followRef.current = true;
    setShowJump(false);
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  };
  // Content changed (new step / streaming delta): if we're following, stay pinned to
  // the bottom; if the user has scrolled away, don't move them — just flag new content.
  useEffect(() => {
    if (wantScroll.current) return; // a session switch is handling the position itself
    const el = scrollRef.current;
    if (!el) return;
    if (followRef.current) requestAnimationFrame(() => { const e = scrollRef.current; if (e) e.scrollTop = e.scrollHeight; });
    else setShowJump(true);
  }, [thread, liveId]);
  // After a switch, once the conversation's content is on screen, restore where you
  // left it — or jump to the bottom the first time. Sets follow-state from the
  // restored position so streaming behaves correctly afterward.
  useEffect(() => {
    if (!wantScroll.current) return;
    const el = scrollRef.current;
    if (!el) return; // thread-scroll not mounted yet (loading/empty) → wait for content
    wantScroll.current = false;
    const saved = scrollPos.current.get(activeIdRef.current ?? "");
    requestAnimationFrame(() => {
      const e = scrollRef.current; if (!e) return;
      e.scrollTop = saved ?? e.scrollHeight;
      followRef.current = nearBottom(e);
      setShowJump(false);
    });
  }, [thread]);
  // Tick once a second while a run readout is showing, so elapsed time advances.
  const runStatusOn = viewStats !== null;
  useEffect(() => {
    if (!runStatusOn) return;
    const t = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [runStatusOn]);

  const refreshSessions = useCallback(async (): Promise<void> => {
    try {
      const list = await listSessions(await resolveBridgeUrl());
      // Keep the raw title (may be "" while a new session's title is still being
      // auto-summarized); the sidebar localizes the empty case to "新会话".
      setSessionList(list.map((s) => ({ id: s.id, title: s.title, icon: "chat" })));
    } catch { /* bridge not ready — leave the list as-is */ }
  }, []);
  useEffect(() => { void refreshSessions(); }, [refreshSessions]);
  // Available models + grouping for the composer's model menu. Re-run after the
  // Settings provider config changes so enabling a provider updates the dropdown.
  const refreshInfo = useCallback(async (): Promise<void> => {
    try {
      const info = await getInfo(await resolveBridgeUrl());
      if (info) {
        setModels(info.models);
        setModelGroups(info.providers ?? []);
        setModel((m) => (m && info.models.includes(m) ? m : info.model));
        setWorkspace(info.workspace || "");
        setConvWorkspace((w) => w || info.workspace || "");
      }
    } catch { /* bridge not ready */ }
  }, []);
  useEffect(() => { void refreshInfo(); }, [refreshInfo]);

  /** Upsert a step into a run's buffer; mirror to the visible thread + cursor only
   *  while that run is the conversation on screen (a backgrounded run doesn't leak
   *  into whatever you're viewing). */
  const upsertRun = (run: Run, step: Step): void => {
    const buf = run.buf;
    const i = buf.findIndex((s) => s._id === step._id);
    if (i >= 0) {
      const ts = step.ts ?? buf[i]!.ts; // preserve creation time across streamed updates
      buf[i] = ts === undefined ? step : { ...step, ts };
    } else {
      buf.push({ ...step, ts: step.ts ?? Date.now() });
    }
    if (isViewing(run)) { setThread(buf.slice()); setLiveId(step._id); }
  };

  /** Stream one turn of `run` from the bridge; on finish, continue its queue or retire it. */
  const streamRun = async (run: Run, text: string): Promise<void> => {
    run.ctrl = new AbortController();
    run.idMap = new Map(); // the bridge restarts step ids at 1 each turn — map them fresh
    try {
      const base = await resolveBridgeUrl();
      await runStream(
        base,
        { sessionId: run.sessionId ?? undefined, text, model: model || undefined, effort, thinking, mode, workspace: run.workspace || undefined },
        {
          onSession: (id) => {
            const wasUnsaved = run.sessionId === null;
            run.sessionId = id;
            if (wasUnsaved) {
              setRunningIds((s) => new Set(s).add(id));
              if (activeIdRef.current === null && newChatRunIdRef.current === run.runId) {
                setNewChatRun(null); // the new chat now has a real id — follow it
                setActive(id);
                // carry any tabs opened in the unsaved chat over to its real id
                setTabsMap((m) => { if (!m["new"]) return m; const { new: fromNew, ...rest } = m; return { ...rest, [id]: fromNew }; });
              }
              void refreshSessions(); // it now appears in the sidebar (with a running dot)
            }
          },
          onStep: (bridgeStep) => {
            let appId = run.idMap.get(bridgeStep._id);
            if (appId === undefined) { appId = uid(); run.idMap.set(bridgeStep._id, appId); }
            upsertRun(run, { ...bridgeStep, _id: appId } as Step);
            // Track previewable docs written this run (md/html/pdf) for auto-preview on done.
            if (bridgeStep.type === "tool" && bridgeStep.name === "write_file" && typeof bridgeStep.title === "string" && bridgeStep.title) {
              const path = bridgeStep.title;
              const kind = previewKindFor(path);
              if ((kind === "markdown" || kind === "html" || kind === "pdf") && !run.previewables.includes(path)) run.previewables.push(path);
            }
          },
          onPlan: (steps) => {
            const sid = run.sessionId;
            if (!sid) return;
            plansRef.current.set(sid, steps);
            if (isViewing(run)) {
              setViewPlan(steps);
              if (!autoPlanRef.current.has(sid)) { // auto split-open the Plan tab the first time
                autoPlanRef.current.add(sid);
                dispatchTabs({ type: "addSplit", tab: { id: "plan", kind: "plan", title: tr(T.tabPlan, lang), closable: true } });
              }
            }
          },
          onApproval: (req) => { if (run.sessionId) enqueuePrompt(run.sessionId, { kind: "approval", req }); },
          onAsk: (req) => { if (run.sessionId) enqueuePrompt(run.sessionId, { kind: "ask", req }); },
          onUsage: (u) => { run.tokens += u.totalTokens; if (u.inputTokens > 0) run.contextTokens = u.inputTokens; if (isViewing(run)) setViewStats({ startedAt: run.startedAt, tokens: run.tokens, contextTokens: run.contextTokens }); },
          onError: (message) => upsertRun(run, { _id: uid(), type: "text", text: `⚠ ${message}`, ts: Date.now() } as Step),
        },
        run.ctrl.signal,
      );
    } finally {
      if (run.sessionId) {
        const sid = run.sessionId;
        setPrompts((m) => { const n = { ...m }; delete n[sid]; return n; }); // run ended → drop any unresolved prompts
      }
      const next = run.ctrl.signal.aborted ? undefined : run.queue.shift();
      if (next) {
        const userStep: Step = { _id: uid(), type: "user", text: next.text, ts: Date.now() };
        run.buf = [...run.buf, userStep];
        if (isViewing(run)) { setThread(run.buf.slice()); setQueuedMsgs(run.queue.slice()); }
        void streamRun(run, next.text); // continue the same conversation
      } else {
        runsRef.current.delete(run.runId);
        if (run.sessionId) sessionCache.current.set(run.sessionId, run.buf.slice()); // keep the switch cache fresh
        if (run.sessionId) setRunningIds((s) => { const n = new Set(s); n.delete(run.sessionId!); return n; });
        if (run.sessionId && run.sessionId !== activeIdRef.current) setUnread((u) => new Set(u).add(run.sessionId!));
        if (newChatRunIdRef.current === run.runId) setNewChatRun(null);
        // Reconcile the visible thread from the authoritative buffer so the final
        // reply is always shown, even if a late mirror was missed.
        if (isViewing(run)) { setThread(run.buf.slice()); setLiveId(null); setQueuedMsgs([]); setViewStats(null); }
        // Auto-preview: the run finished and produced a document → split-open the last one.
        if (!run.ctrl.signal.aborted && run.previewables.length > 0 && isViewing(run)) {
          openFile(run.previewables[run.previewables.length - 1]!);
        }
        // Completion chime + (when unfocused) a desktop notification.
        if (!run.ctrl.signal.aborted) {
          const meta = run.sessionId ? sessionList.find((s) => s.id === run.sessionId) : null;
          const title = meta && meta.title ? tr(meta.title, lang) : tr(T.convNew, lang);
          runComplete(`${title} · ${tr(T.notifyDone, lang)}`);
        }
        void refreshSessions();
      }
    }
  };

  /** Start a fresh run for `sessionId` (null = the unsaved new chat in view). */
  const beginRun = (sessionId: string | null, seed: Step[], text: string): void => {
    const run: Run = { runId: uid(), sessionId, ctrl: new AbortController(), buf: seed, idMap: new Map(), queue: [], startedAt: Date.now(), tokens: 0, contextTokens: 0, previewables: [], workspace: convWorkspace };
    runsRef.current.set(run.runId, run);
    if (sessionId) setRunningIds((s) => new Set(s).add(sessionId));
    else setNewChatRun(run.runId);
    setLiveId(seed.length ? seed[seed.length - 1]!._id : null);
    setViewStats({ startedAt: run.startedAt, tokens: 0, contextTokens: 0 }); // beginRun is always for the viewed conversation
    void streamRun(run, text);
  };

  const send = (): void => {
    const text = input.trim();
    if (!text) return;
    setInput("");
    playSend(); // audible send cue
    // Sending is an explicit "show me the latest" action → resume bottom-follow.
    followRef.current = true; setShowJump(false);
    const run = viewedRun();
    if (run && !run.ctrl.signal.aborted) {
      // the conversation in view is already running → queue onto its run
      run.queue.push({ id: uid(), text });
      setQueuedMsgs(run.queue.slice());
      return;
    }
    // start a new run for the conversation in view (saved session id, or null = new chat)
    const userStep: Step = { _id: uid(), type: "user", text, ts: Date.now() };
    const seed = [...thread, userStep];
    setThread(seed);
    beginRun(activeIdRef.current, seed, text);
  };

  /** Stop the run for the conversation currently in view (only the Stop button does this). */
  const stopRun = (): void => {
    const run = viewedRun();
    if (!run) return;
    run.queue = [];
    run.ctrl.abort(); // → runStream rejects → streamRun's finally retires the run
    if (run.sessionId) setRunningIds((s) => { const n = new Set(s); n.delete(run.sessionId!); return n; });
    if (newChatRunIdRef.current === run.runId) setNewChatRun(null);
    setQueuedMsgs([]); setLiveId(null); setViewStats(null);
  };

  const decideApproval = (decision: "allow" | "always" | "deny"): void => {
    const key = approvalKey(activeId);
    const head = prompts[key]?.[0];
    if (!head || head.kind !== "approval") return; // act on the prompt currently shown
    dropPrompt(key, head.req.id); // pop → the next queued prompt surfaces
    void (async () => {
      try { await approve(await resolveBridgeUrl(), head.req.id, decision); } catch { /* ignore */ }
    })();
  };

  const answerAsk = (text: string): void => {
    const key = approvalKey(activeId);
    const head = prompts[key]?.[0];
    if (!head || head.kind !== "ask") return;
    dropPrompt(key, head.req.id);
    void (async () => {
      try { await answer(await resolveBridgeUrl(), head.req.id, text); } catch { /* ignore */ }
    })();
  };

  /** Rollback: drop this user message and everything after it (truncating the
   *  stored session too), and put its text back in the composer to edit & resend. */
  const rollbackTo = (step: Step | null): void => {
    if (!step || step.type !== "user") return;
    const idx = thread.findIndex((s) => s._id === step._id);
    if (idx < 0) return;
    stopRun(); // can't rewind a live run — stop the viewed conversation's run first
    const kept = thread.slice(0, idx);
    const keepUserTurns = kept.filter((s) => s.type === "user").length;
    setThread(kept);
    setInput(tr(step.text, lang));
    const id = activeIdRef.current;
    if (id) {
      sessionCache.current.set(id, kept); // reflect the rewind in the switch cache
      void (async () => {
        try { await truncateSession(await resolveBridgeUrl(), id, keepUserTurns); } catch { /* ignore */ }
        void refreshSessions();
      })();
    }
  };

  const cancelQueued = (id: number): void => {
    const run = viewedRun();
    if (!run) return;
    run.queue = run.queue.filter((m) => m.id !== id);
    setQueuedMsgs(run.queue.slice());
  };

  // Pick the workspace for the conversation in view; remember it as the new default.
  const pickWorkspace = async (): Promise<void> => {
    const dir = await pickFolder(convWorkspace || workspace);
    if (!dir) return;
    setConvWorkspace(dir);
    try { localStorage.setItem("kurt-workspace", dir); } catch { /* ignore */ }
  };

  // ── Workspace tabs ──────────────────────────────────────────────────────────
  /** Create/focus a tab from a group's `+` menu (files/plan/preview singletons;
   *  each terminal is its own tab). Lands in the group whose `+` was clicked. */
  const addTab = (kind: TabKind, group: number): void => {
    if (kind === "terminal") {
      const n = ++tabCounter.current;
      dispatchTabs({ type: "add", group, tab: { id: `terminal:${n}`, kind, title: `${tr(T.tabTerminal, lang)} ${n}`, closable: true } });
      return;
    }
    const id = kind; // files / plan / preview are singletons
    const title = kind === "files" ? tr(T.tabFiles, lang) : kind === "plan" ? tr(T.tabPlan, lang) : tr(T.tabPreview, lang);
    dispatchTabs({ type: "add", group, tab: { id, kind, title, closable: true } });
  };

  /** Open a workspace file in a preview tab, split beside the conversation, then
   *  load its real content from the bridge. */
  const openFile = (path: string): void => {
    const id = "file:" + path;
    const kind = previewKindFor(path);
    const title = path.split("/").pop() || path;
    dispatchTabs({ type: "addSplit", tab: { id, kind: "preview", title, closable: true, meta: { file: path, previewKind: kind, subtitle: path } } });
    void (async () => {
      const base = await resolveBridgeUrl();
      if (kind === "pdf") {
        dispatchTabs({ type: "update", id, patch: { meta: { content: rawFileUrl(base, path, convWorkspace) } } });
      } else {
        const f = await readFile(base, path, convWorkspace);
        if (f) dispatchTabs({ type: "update", id, patch: { meta: { content: f.content + (f.truncated ? "\n\n… (truncated)" : "") } } });
      }
    })();
  };

  /** Open a tool's full output in a preview tab, split beside the conversation. */
  const openToolOutput = (info: OpenOutput): void => {
    const id = "output:" + info.stepId;
    dispatchTabs({ type: "addSplit", tab: { id, kind: "preview", title: info.name, closable: true, meta: { previewKind: "output", content: info.content, subtitle: info.title } } });
  };

  const renderPane = (tab: Tab): React.ReactNode => {
    switch (tab.kind) {
      case "session": return renderSessionPane();
      case "files": return <FilesTab lang={lang} workspace={convWorkspace} onOpenFile={openFile} />;
      case "preview": return <PreviewTab tab={tab} lang={lang} />;
      case "plan": return <PlanTab steps={viewPlan} lang={lang} />;
      case "terminal": return <Suspense fallback={<div className="ws-empty" />}><TerminalTab key={tab.id} cwd={tab.meta?.cwd || convWorkspace || workspace} /></Suspense>;
      default: return null;
    }
  };

  const toggleStep = (id: number): void => setCollapsed((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const loadSession = async (id: string): Promise<void> => {
    // Switching never stops a run — it keeps streaming in the background. If this
    // session is running, show its live buffer; otherwise show cached steps instantly
    // (no blank/flash) and refresh from the bridge in the background.
    setView("chat");
    setActive(id);
    setUnread((u) => { if (!u.has(id)) return u; const n = new Set(u); n.delete(id); return n; }); // clicking clears the unread dot
    setCollapsed(new Set());
    setViewPlan(plansRef.current.get(id)); // show this session's plan (if any) in the Plan tab
    wantScroll.current = true;
    const meta = sessionList.find((s) => s.id === id);
    const title = meta && meta.title ? meta.title : T.convNew;

    const run = runForSession(id);
    if (run) {
      setLoadingSession(false);
      setThread(run.buf.slice());
      setLiveId(run.buf.length ? run.buf[run.buf.length - 1]!._id : null);
      setQueuedMsgs(run.queue.slice());
      setViewStats({ startedAt: run.startedAt, tokens: run.tokens, contextTokens: run.contextTokens });
      setTitleEntry(title);
      return;
    }

    setLiveId(null); setQueuedMsgs([]); setViewStats(null); setTitleEntry(title);
    const cached = sessionCache.current.get(id);
    if (cached) {
      setLoadingSession(false);
      setThread(cached); // instant — switching back never blanks
    } else {
      setThread([]);
      setLoadingSession(true); // show a neutral loading area, not the empty-state, while fetching
    }
    try {
      const detail = await getSession(await resolveBridgeUrl(), id);
      if (detail) sessionCache.current.set(id, detail.steps); // cache even if we've since switched away
      if (activeIdRef.current !== id) return; // a newer switch owns the view now
      setLoadingSession(false);
      if (detail) { setThread(detail.steps); setTitleEntry(detail.title || T.convNew); if (detail.workspace) setConvWorkspace(detail.workspace); }
    } catch {
      if (activeIdRef.current === id) setLoadingSession(false); // keep whatever we showed
    }
  };
  // A fresh empty chat. Any in-flight run keeps going in the background (it shows
  // in the sidebar with a running dot); only the Stop button ends a run.
  const newChat = (): void => {
    setView("chat");
    setActive(null);
    setNewChatRun(null);
    setLoadingSession(false); wantScroll.current = true;
    setThread([]); setLiveId(null); setQueuedMsgs([]); setViewStats(null);
    setTitleEntry(T.convNew); setCollapsed(new Set()); setViewPlan(undefined);
    setTabsMap((m) => { const { new: _drop, ...rest } = m; return rest; }); // fresh tabs for the new chat
    try { setConvWorkspace(localStorage.getItem("kurt-workspace") || workspace); } catch { setConvWorkspace(workspace); } // default to last-picked
  };

  /** Delete a session: stop its run if any, drop it from the bridge, clear its
   *  unread dot, and reset to a fresh chat if it was the one being viewed. */
  const removeSession = (id: string): void => {
    const run = runForSession(id);
    if (run) {
      run.queue = [];
      run.ctrl.abort();
      runsRef.current.delete(run.runId);
      setRunningIds((s) => { const n = new Set(s); n.delete(id); return n; });
    }
    sessionCache.current.delete(id); // gone — drop its cached steps
    setPrompts((m) => { const n = { ...m }; delete n[id]; return n; }); // drop its pending prompts
    setTabsMap((m) => { const { [id]: _drop, ...rest } = m; return rest; }); // drop its tabs/split
    if (id === activeId) newChat(); // we were viewing it → fall back to an empty chat
    setUnread((u) => { if (!u.has(id)) return u; const n = new Set(u); n.delete(id); return n; });
    void (async () => {
      try { await deleteSession(await resolveBridgeUrl(), id); } catch { /* ignore */ }
      void refreshSessions();
    })();
  };

  // group thread into segments by user message
  type UserStep = Extract<Step, { type: "user" }>;
  const segments: { user: UserStep | null; steps: Step[] }[] = [];
  thread.forEach((step) => {
    if (step.type === "user") segments.push({ user: step, steps: [] });
    else { if (!segments.length) segments.push({ user: null, steps: [] }); segments[segments.length - 1]!.steps.push(step); }
  });

  const stepCtx = { lang, collapsed, collapseDetails, liveId, onToggle: toggleStep, onOpenFile: openFile, onOpenOutput: openToolOutput };
  // The id of the run's LAST text step (per segment) — only it shows the copy/time footer.
  const lastTextId = (steps: Step[]): number | null => {
    for (let i = steps.length - 1; i >= 0; i--) if (steps[i]!.type === "text") return steps[i]!._id;
    return null;
  };

  // The conversation pane (thread + composer) — rendered as the `session` tab.
  function renderSessionPane(): React.ReactNode {
    return (
      <div className="main-col">
        <div className="thread-area">
        {loadingSession ? (
          <div className="thread-loading" />
        ) : thread.length === 0 ? (
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
          <div className="thread-scroll" ref={scrollRef} onScroll={onThreadScroll}>
            <div className="thread-inner">
              {segments.map((seg, i) => (
                <div key={i}>
                  {seg.user && (
                    <div className="query-row">
                      <div className="query-box"><MdBlock text={tr(seg.user.text, lang)} lang={lang} /></div>
                      <div className="msg-actions user">
                        <CopyButton text={tr(seg.user.text, lang)} lang={lang} />
                        <button className="msg-btn" onClick={() => rollbackTo(seg.user)} title={tr(T.rollback, lang)} aria-label={tr(T.rollback, lang)}>
                          <Icon name="rollback" /><span className="msg-btn-label">{tr(T.rollback, lang)}</span>
                        </button>
                        <MessageTime ts={seg.user.ts} />
                      </div>
                    </div>
                  )}
                  {seg.steps.length > 0 && <div className="timeline">{seg.steps.map((s) => renderStep(s, { ...stepCtx, lastTextId: lastTextId(seg.steps) }))}</div>}
                </div>
              ))}
              {viewStats && (
                <div className="run-status">
                  <span className="spin" />
                  <span className="run-status-text">
                    {liveActivity(thread, liveId, lang)}
                    {" · "}{fmtElapsed(Date.now() - viewStats.startedAt)}
                    {/* current context size (matches the ring); cumulative run total
                        lives in the context card to avoid two conflicting numbers */}
                    {viewStats.contextTokens > 0 ? ` · ${fmtTokens(viewStats.contextTokens)} tokens` : ""}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
        {showJump && thread.length > 0 && (
          <button className="jump-latest" onClick={jumpToLatest} title={tr(T.jumpLatest, lang)}>
            <Icon name="chevD" /><span>{tr(T.jumpLatest, lang)}</span>
          </button>
        )}
        </div>

        <Composer value={input} onChange={setInput} onSend={send} onStop={stopRun}
          running={viewRunning} queuedMsgs={queuedMsgs} onCancelQueued={cancelQueued} lang={lang}
          model={model} models={models} modelGroups={modelGroups} onModelChange={setModel} effort={effort} onEffortChange={setEffort}
          mode={mode} onModeChange={setMode} thinking={thinking} onThinkingToggle={() => setThinking((v) => !v)}
          workspace={convWorkspace} onPickWorkspace={() => void pickWorkspace()}
          approval={(() => {
            const q = prompts[approvalKey(activeId)] ?? [];
            const head = q[0];
            if (!head) return null;
            const more = q.length - 1;
            return (
              <>
                {head.kind === "approval"
                  ? <Approval req={head.req} lang={lang} onDecide={decideApproval} />
                  : <Ask req={head.req} lang={lang} onAnswer={answerAsk} />}
                {more > 0 && <div className="prompt-queue-note">{tr(T.promptQueue, lang, { n: more })}</div>}
              </>
            );
          })()}
          meter={thread.length > 0 ? <ContextMeter steps={thread} model={model} lang={lang} apiTokens={viewStats?.tokens} contextTokens={viewStats?.contextTokens} /> : null} />
      </div>
    );
  }

  return (
    <div className="window">
      <Sidebar recents={sessionList} activeId={activeId} runningIds={runningIds} unread={unread} onPick={loadSession} onDelete={removeSession} onNewChat={newChat}
        lang={lang} onOpenSettings={() => setView(view === "settings" ? "chat" : "settings")} />

      <div className="main">
        {view === "settings" ? (
          <Settings theme={theme} setTheme={setTheme} lang={lang} setLang={setLang}
            collapseDetails={collapseDetails} setCollapseDetails={setCollapseDetails}
            onConfigChanged={() => void refreshInfo()} onClose={() => setView("chat")} />
        ) : (
          <div className="main-chat">
            <div className="main-top" data-tauri-drag-region>
              <div className="conv-title-wrap" data-value={tr(titleEntry, lang)}>
                <input className="conv-title-input" value={tr(titleEntry, lang)} spellCheck={false}
                  onChange={(e) => setTitleEntry((prev) => (typeof prev === "string" ? e.target.value : { ...prev, [lang]: e.target.value }))} />
              </div>
            </div>

            <Workspace state={tabs} renderPane={renderPane} lang={lang}
              onActivate={(id) => dispatchTabs({ type: "activate", id })}
              onClose={(id) => dispatchTabs({ type: "close", id })}
              onSplit={(id) => dispatchTabs({ type: "split", id })}
              onUnsplit={() => dispatchTabs({ type: "unsplit" })}
              onAdd={addTab} />
          </div>
        )}
      </div>
    </div>
  );
}
