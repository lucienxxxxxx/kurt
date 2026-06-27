import { Box, Static, Text, useApp, useInput, useStdout } from "ink";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { messagesFromEvents, type Event, type Message, type PermissionRequest, type SessionMeta, type SessionRecord } from "kurt-agent";
import { applyEvent, type Entry } from "./entries.ts";
import { COMMANDS, filterCommands, isCommand, parseCommand } from "./commands.ts";
import { EntryView } from "./conversation.tsx";
import { StatusBar, type ChatMode, type Status } from "./status-bar.tsx";
import { Welcome } from "./welcome.tsx";
import { Approval } from "./approval.tsx";
import { SessionPicker } from "./session-picker.tsx";
import { SkillsPicker } from "./skills-picker.tsx";
import { AskPrompt } from "./ask-prompt.tsx";
import { entriesFromMessages } from "./session-view.ts";
import type { PermissionBridge } from "./permission.ts";
import type { AskBridge, PendingAsk } from "./ask.ts";
import type { SkillInfo } from "../skills.ts";

const NO_SUBSCRIBE = (): (() => void) => () => {};
const NO_PENDING = (): PermissionRequest | null => null;
const NO_ASK = (): PendingAsk | null => null;
const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export interface SessionState {
  modelId: string;
  effort: string;
  thinking: boolean;
  mode: ChatMode;
}

export type EngineRunner = (messages: Message[], signal: AbortSignal, session: SessionState) => AsyncIterable<Event>;
export type Compactor = (messages: Message[], signal: AbortSignal) => Promise<{ messages: Message[]; summarizedCount: number }>;

export interface AppConfig {
  model: string;
  contextLimit: number;
  effort: string;
  thinking: boolean;
  mode?: ChatMode;
}

/**
 * Persistence/switching for saved conversations. The controller owns the
 * "current session" (in the composition root); the App calls it and renders.
 */
export interface SessionController {
  /** Saved sessions for the current workspace, newest first. */
  list: () => Promise<SessionMeta[]>;
  /** Switch to a session, returning its full record. */
  open: (id: string) => Promise<SessionRecord>;
  /** Delete a session by id. */
  remove: (id: string) => Promise<void>;
  /** Persist the current session's messages (autosave after each turn). */
  save: (messages: Message[]) => Promise<void>;
  /** Begin a brand-new (empty) session. */
  startNew: () => Promise<void>;
  /** Ensure the current session has a title (LLM-summarized, with fallback). */
  ensureTitle: (messages: Message[]) => Promise<string>;
  /** Id of the current session (to detect deleting the active one). */
  currentId: () => string;
}

export interface AppProps {
  run: EngineRunner;
  compact: Compactor;
  models: string[];
  config: AppConfig;
  onNewSession?: () => void;
  /** Persist changed settings (model/effort/thinking/mode) across launches. */
  onConfigChange?: (patch: { model: string; effort: string; thinking: boolean; mode: ChatMode }) => void;
  /** Bridge for sensitive-command approval prompts (when gating is enabled). */
  permission?: PermissionBridge;
  /** Session persistence + switching (when enabled). */
  session?: SessionController;
  /** Bridge for the agent's ask_user prompts (when enabled). */
  ask?: AskBridge;
  /** Loaded skills + a body loader, for the `/skills` command (when enabled). */
  skills?: { list: SkillInfo[]; load: (name: string) => Promise<string | null> };
}

const MODES: ChatMode[] = ["chat", "agent", "plan"];
const EFFORTS = ["low", "medium", "high"];
const PALETTE_MAX = 8;

export function App({ run, compact, models, config, onNewSession, onConfigChange, permission, session, ask, skills }: AppProps) {
  const { stdout } = useStdout();
  const { exit } = useApp();

  // Current pending approval (null when none). Drives the prompt + key handling.
  const approval = useSyncExternalStore(permission?.subscribe ?? NO_SUBSCRIBE, permission?.getSnapshot ?? NO_PENDING);
  // Current pending ask_user question (null when none).
  const pendingAsk = useSyncExternalStore(ask?.subscribe ?? NO_SUBSCRIBE, ask?.getSnapshot ?? NO_ASK);
  const [askInput, setAskInput] = useState("");
  const [askSel, setAskSel] = useState(0);

  // Session picker overlay (null when closed). Opened by /sessions.
  const [picker, setPicker] = useState<{ sessions: SessionMeta[]; selected: number } | null>(null);

  // Skills list overlay (null when closed). Opened by /skills.
  const [skillsView, setSkillsView] = useState<{ skills: SkillInfo[]; selected: number } | null>(null);

  const [cols, setCols] = useState(stdout.columns || 80);
  useEffect(() => {
    if (typeof stdout.on !== "function") return;
    const onResize = (): void => setCols(stdout.columns || 80);
    stdout.on("resize", onResize);
    return () => {
      if (typeof stdout.off === "function") stdout.off("resize", onResize);
    };
  }, [stdout]);

  // committed → flushed to the terminal's real scrollback via <Static> (the user
  // scrolls it natively with the mouse wheel). live → the current in-progress
  // turn, re-rendered in the pinned bottom region until it's committed.
  const [committed, setCommitted] = useState<Entry[]>([]);
  const [live, setLive] = useState<Entry[]>([]);
  const [staticKey, setStaticKey] = useState(0);

  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const [modelId, setModelId] = useState(config.model);
  const [effort, setEffort] = useState(config.effort);
  const [thinking, setThinking] = useState(config.thinking);
  const [mode, setMode] = useState<ChatMode>(config.mode ?? "agent");
  const [ctxUsed, setCtxUsed] = useState(0);
  const [selected, setSelected] = useState(0);
  const [tick, setTick] = useState(0); // drives the running spinner/elapsed clock

  const historyRef = useRef<Message[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const liveRef = useRef<Entry[]>([]);
  const thinkingRef = useRef(thinking);
  thinkingRef.current = thinking;
  const runStartRef = useRef(0);

  // Tick once a second while running, so the indicator shows it's alive + elapsed.
  useEffect(() => {
    if (!running) return;
    runStartRef.current = Date.now();
    setTick(0);
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [running]);

  // Persist settings whenever they change (skip the initial mount).
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    onConfigChange?.({ model: modelId, effort, thinking, mode });
  }, [modelId, effort, thinking, mode]);

  const commit = (entries: Entry[]): void => setCommitted((c) => [...c, ...entries]);
  const notice = (level: "info" | "warn" | "error", text: string): void => commit([{ kind: "notice", level, text }]);

  const setLiveBoth = (next: Entry[]): void => {
    liveRef.current = next;
    setLive(next);
  };

  async function submit(text: string): Promise<void> {
    const isFirstTurn = historyRef.current.length === 0;
    commit([{ kind: "user", text }]); // user line lands in scrollback immediately
    const nextHistory = [...historyRef.current, { role: "user", content: [{ type: "text", text }] } as Message];
    historyRef.current = nextHistory;

    setRunning(true);
    setLiveBoth([]);
    const ac = new AbortController();
    abortRef.current = ac;
    const captured: Event[] = [];
    try {
      for await (const ev of run(nextHistory, ac.signal, { modelId, effort, thinking, mode })) {
        captured.push(ev);
        if (ev.type === "usage") setCtxUsed(ev.totalTokens);
        else if (ev.type === "thinking" && !thinkingRef.current) continue;
        else setLiveBoth(applyEvent(liveRef.current, ev));
      }
    } catch (err) {
      setLiveBoth(applyEvent(liveRef.current, { type: "error", message: err instanceof Error ? err.message : String(err), fatal: true }));
    }

    const appended = messagesFromEvents(captured);
    historyRef.current = appended.length > 0 ? [...nextHistory, ...appended] : nextHistory;
    commit(liveRef.current); // move the finished turn into scrollback
    setLiveBoth([]);
    abortRef.current = null;
    setRunning(false);

    // Persist the conversation (crash-safe) and title it on the first exchange.
    if (session) {
      void session.save(historyRef.current);
      if (isFirstTurn) {
        void session.ensureTitle(historyRef.current).then((t) => {
          if (t) notice("info", `session titled: ${t}`);
        });
      }
    }
  }

  async function runCompact(): Promise<void> {
    if (running) return;
    setRunning(true);
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const before = historyRef.current.length;
      const { messages, summarizedCount } = await compact(historyRef.current, ac.signal);
      historyRef.current = messages;
      notice("info", summarizedCount > 0 ? `compacted ${before}→${messages.length} msgs (summarized ${summarizedCount})` : "nothing to compact yet");
    } catch (err) {
      notice("error", `compact failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    abortRef.current = null;
    setRunning(false);
  }

  function reset(): void {
    setCommitted([]);
    setLiveBoth([]);
    setCtxUsed(0);
    setStaticKey((k) => k + 1); // remount <Static> so its print index resets
    if (typeof stdout.write === "function") stdout.write("\x1b[2J\x1b[3J\x1b[H"); // wipe screen + scrollback
  }

  async function openPicker(): Promise<void> {
    if (!session) return void notice("warn", "sessions are not enabled");
    setPicker({ sessions: await session.list(), selected: 0 });
  }

  async function openSession(id: string): Promise<void> {
    if (!session) return;
    const rec = await session.open(id);
    historyRef.current = rec.messages;
    reset();
    setCommitted(entriesFromMessages(rec.messages)); // repaint reconstructed history
    if (rec.model) setModelId(rec.model);
    setPicker(null);
    notice("info", `resumed: ${rec.title || "(untitled)"}`);
  }

  async function deleteSession(id: string): Promise<void> {
    if (!session) return;
    const wasCurrent = session.currentId() === id;
    await session.remove(id);
    if (wasCurrent) {
      await session.startNew();
      historyRef.current = [];
      reset();
    }
    setPicker({ sessions: await session.list(), selected: 0 });
  }

  function openSkills(): void {
    const list = skills?.list ?? [];
    if (list.length === 0) {
      notice("info", "no skills loaded (drop one in ~/.kurt/skills/ or <workspace>/.kurt/skills/)");
      return;
    }
    setSkillsView({ skills: list, selected: 0 });
  }

  async function viewSkill(info: SkillInfo): Promise<void> {
    setSkillsView(null);
    const body = (await skills?.load(info.name)) ?? "";
    const header = `skill: ${info.name}  [${info.scope}]  ${info.path}`;
    notice("info", body.trim().length > 0 ? `${header}\n\n${body.trim()}` : `${header}\n\n(empty skill body)`);
  }

  function handleCommand(name: string, args: string[]): void {
    switch (name) {
      case "/help":
        notice("info", COMMANDS.map((c) => `${c.name}${c.args ? " " + c.args : ""} — ${c.summary}`).join("\n"));
        break;
      case "/model": {
        const next = args[0] ?? cycle(models, modelId);
        setModelId(next);
        notice("info", `model → ${next}`);
        break;
      }
      case "/mode": {
        const next = (args[0] as ChatMode) ?? cycle(MODES, mode);
        if (MODES.includes(next)) {
          setMode(next);
          notice("info", `mode → ${next}`);
        } else notice("error", `mode must be one of ${MODES.join("/")}`);
        break;
      }
      case "/effort": {
        const next = args[0] ?? cycle(EFFORTS, effort);
        setEffort(next);
        notice("info", `effort → ${next}`);
        break;
      }
      case "/think": {
        const next = args[0] ? args[0] === "on" : !thinking;
        setThinking(next);
        notice("info", `thinking → ${next ? "on" : "off"}`);
        break;
      }
      case "/compact":
        void runCompact();
        break;
      case "/sessions":
        void openPicker();
        break;
      case "/skills":
        openSkills();
        break;
      case "/clear":
        // The old conversation is already saved; begin a fresh session so we
        // don't overwrite it with the cleared history.
        void session?.startNew();
        historyRef.current = [];
        reset();
        break;
      case "/new":
        void session?.startNew();
        onNewSession?.();
        historyRef.current = [];
        reset();
        notice("info", "started a new session");
        break;
      case "/exit":
        exit();
        break;
      default:
        notice("error", `unknown command: ${name} (try /help)`);
    }
  }

  const cmdItems = !running && isCommand(input) ? filterCommands(input) : [];
  const sel = Math.min(selected, Math.max(0, cmdItems.length - 1));

  useInput((char, key) => {
    // While an approval is pending, keys only answer the prompt.
    if (approval && permission) {
      if (char === "y") permission.decide("allow");
      else if (char === "a") permission.decide("always");
      else if (char === "n" || key.escape || (key.ctrl && char === "c")) permission.decide("deny");
      return;
    }
    if (key.ctrl && char === "c") {
      if (running && abortRef.current) abortRef.current.abort();
      else exit();
      return;
    }
    // ask_user prompt: ↑/↓ pick an option (when not typing), type a free answer,
    // ↵ submits, esc skips.
    if (pendingAsk && ask) {
      const opts = pendingAsk.options;
      const submit = (answer: string): void => {
        ask.answer(answer);
        setAskInput("");
        setAskSel(0);
      };
      if (key.escape) return void submit("");
      if (askInput.length === 0 && opts.length > 0) {
        if (key.upArrow) return void setAskSel((s) => Math.max(0, s - 1));
        if (key.downArrow) return void setAskSel((s) => Math.min(opts.length - 1, s + 1));
      }
      if (key.return) {
        const answer = askInput.trim().length > 0 ? askInput.trim() : (opts[askSel] ?? "");
        if (answer.length > 0) submit(answer);
        return;
      }
      if (key.backspace || key.delete) return void setAskInput((v) => v.slice(0, -1));
      if (char && !key.ctrl && !key.meta) return void setAskInput((v) => v + char);
      return; // swallow other keys while asking
    }
    // Session picker: arrows move, ↵ opens, d deletes, esc closes.
    if (picker) {
      if (key.escape) return void setPicker(null);
      if (key.upArrow) return void setPicker((p) => (p ? { ...p, selected: Math.max(0, p.selected - 1) } : p));
      if (key.downArrow)
        return void setPicker((p) => (p ? { ...p, selected: Math.min(p.sessions.length - 1, p.selected + 1) } : p));
      if (key.return) {
        const s = picker.sessions[picker.selected];
        if (s) void openSession(s.id);
        return;
      }
      if (char === "d") {
        const s = picker.sessions[picker.selected];
        if (s) void deleteSession(s.id);
        return;
      }
      return; // swallow other keys while the picker is open
    }
    // Skills list: arrows move, ↵ views the body (into scrollback), esc closes.
    if (skillsView) {
      if (key.escape) return void setSkillsView(null);
      if (key.upArrow) return void setSkillsView((p) => (p ? { ...p, selected: Math.max(0, p.selected - 1) } : p));
      if (key.downArrow)
        return void setSkillsView((p) => (p ? { ...p, selected: Math.min(p.skills.length - 1, p.selected + 1) } : p));
      if (key.return) {
        const s = skillsView.skills[skillsView.selected];
        if (s) void viewSkill(s);
        return;
      }
      return; // swallow other keys while the skills list is open
    }
    if (key.escape) {
      if (running && abortRef.current) abortRef.current.abort();
      else setInput("");
      return;
    }
    if (running) return;

    if (cmdItems.length > 0) {
      if (key.upArrow) return void setSelected(Math.max(0, sel - 1));
      if (key.downArrow) return void setSelected(Math.min(cmdItems.length - 1, sel + 1));
      if (key.tab) {
        setInput(`${cmdItems[sel]!.name} `);
        setSelected(0);
        return;
      }
      if (key.return) {
        const parsed = parseCommand(input)!;
        const known = COMMANDS.some((c) => c.name === parsed.name);
        const cmd = known ? parsed : { name: cmdItems[sel]!.name, args: [] };
        setInput("");
        setSelected(0);
        handleCommand(cmd.name, cmd.args);
        return;
      }
    } else if (key.return) {
      const text = input.trim();
      setInput("");
      if (text.length === 0) return;
      if (isCommand(text)) handleCommand(parseCommand(text)!.name, parseCommand(text)!.args);
      else void submit(text);
      return;
    }

    if (key.tab) return void setMode((m) => cycle(MODES, m));
    if (key.backspace || key.delete) {
      setInput((v) => v.slice(0, -1));
      setSelected(0);
      return;
    }
    if (char && !key.ctrl && !key.meta) {
      setInput((v) => v + char);
      setSelected(0);
    }
  });

  const status: Status = { model: modelId, contextUsed: ctxUsed, contextLimit: config.contextLimit, effort, thinking, mode, running };

  return (
    <>
      {/* History — flushed to the terminal's native scrollback; scroll with the mouse wheel. */}
      <Static key={staticKey} items={committed}>
        {(entry, i) => <EntryView key={i} entry={entry} width={cols} live={false} />}
      </Static>

      {/* Pinned bottom region: in-progress turn, palette, input, status. */}
      <Box flexDirection="column">
        {committed.length === 0 && live.length === 0 && !running && <Welcome />}

        {live.map((entry, i) => (
          <EntryView key={i} entry={entry} width={cols} live />
        ))}

        {!picker && !skillsView && !pendingAsk && cmdItems.length > 0 && (
          <Box flexDirection="column" marginTop={1}>
            {cmdItems.slice(0, PALETTE_MAX).map((c, i) => (
              <Text key={c.name} inverse={i === sel} color={i === sel ? undefined : "gray"}>
                {`${c.name}${c.args ? " " + c.args : ""}  —  ${c.summary}`}
              </Text>
            ))}
          </Box>
        )}

        {approval ? (
          <Approval req={approval} />
        ) : pendingAsk ? (
          <AskPrompt pending={pendingAsk} input={askInput} selected={askSel} />
        ) : picker ? (
          <SessionPicker sessions={picker.sessions} selected={picker.selected} />
        ) : skillsView ? (
          <SkillsPicker skills={skillsView.skills} selected={skillsView.selected} />
        ) : (
          <Box marginTop={1}>
            <Text color="green">{"› "}</Text>
            <Text>{input}</Text>
            {running ? (
              <Text color="yellow">
                {` ${SPINNER[tick % SPINNER.length]} running ${Math.floor((Date.now() - runStartRef.current) / 1000)}s · press Esc to interrupt`}
              </Text>
            ) : (
              <Text dimColor>▌</Text>
            )}
          </Box>
        )}
        <StatusBar status={status} width={cols} />
      </Box>
    </>
  );
}

function cycle<T>(list: T[], cur: T): T {
  if (list.length === 0) return cur;
  const i = list.indexOf(cur);
  return list[(i + 1) % list.length] ?? list[0]!;
}
