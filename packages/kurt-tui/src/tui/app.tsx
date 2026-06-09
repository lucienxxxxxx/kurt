import { Box, Static, Text, useApp, useInput, useStdout } from "ink";
import { useEffect, useRef, useState } from "react";
import { messagesFromEvents, type Event, type Message } from "kurt-agent";
import { applyEvent, type Entry } from "./entries.ts";
import { COMMANDS, filterCommands, isCommand, parseCommand } from "./commands.ts";
import { EntryView } from "./conversation.tsx";
import { StatusBar, type ChatMode, type Status } from "./status-bar.tsx";
import { Welcome } from "./welcome.tsx";

export interface SessionState {
  modelId: string;
  effort: string;
  thinking: boolean;
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

export interface AppProps {
  run: EngineRunner;
  compact: Compactor;
  models: string[];
  config: AppConfig;
  onNewSession?: () => void;
  /** Persist changed settings (model/effort/thinking/mode) across launches. */
  onConfigChange?: (patch: { model: string; effort: string; thinking: boolean; mode: ChatMode }) => void;
}

const MODES: ChatMode[] = ["ask", "agent", "plan"];
const EFFORTS = ["low", "medium", "high"];
const PALETTE_MAX = 8;

export function App({ run, compact, models, config, onNewSession, onConfigChange }: AppProps) {
  const { stdout } = useStdout();
  const { exit } = useApp();

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

  const historyRef = useRef<Message[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const liveRef = useRef<Entry[]>([]);
  const thinkingRef = useRef(thinking);
  thinkingRef.current = thinking;

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
    commit([{ kind: "user", text }]); // user line lands in scrollback immediately
    const nextHistory = [...historyRef.current, { role: "user", content: [{ type: "text", text }] } as Message];
    historyRef.current = nextHistory;

    setRunning(true);
    setLiveBoth([]);
    const ac = new AbortController();
    abortRef.current = ac;
    const captured: Event[] = [];
    try {
      for await (const ev of run(nextHistory, ac.signal, { modelId, effort, thinking })) {
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
      case "/clear":
        historyRef.current = [];
        reset();
        break;
      case "/new":
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
    if (key.ctrl && char === "c") {
      if (running && abortRef.current) abortRef.current.abort();
      else exit();
      return;
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

        {cmdItems.length > 0 && (
          <Box flexDirection="column" marginTop={1}>
            {cmdItems.slice(0, PALETTE_MAX).map((c, i) => (
              <Text key={c.name} inverse={i === sel} color={i === sel ? undefined : "gray"}>
                {`${c.name}${c.args ? " " + c.args : ""}  —  ${c.summary}`}
              </Text>
            ))}
          </Box>
        )}

        <Box marginTop={1}>
          <Text color="green">{"› "}</Text>
          <Text>{input}</Text>
          <Text dimColor>{running ? " (running… Esc to interrupt)" : "▌"}</Text>
        </Box>
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
