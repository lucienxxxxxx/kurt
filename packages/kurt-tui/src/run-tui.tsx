/**
 * runTui — launch the Ink TUI. Natural-flow display (no alt-screen). Resolves
 * settings from persisted config + env, the working dir from launch options,
 * wires the engine + sandboxed tools, and persists in-app settings changes.
 */

import { render } from "ink";
import { runLoop, SessionWorkspace, ToolHub, type Event, type Message } from "kurt-agent";
import { autoCompaction, compactHistory, serializeForSummary, type CompactionPolicy } from "kurt-agent";
import { connectMcpServers, summarizeStatuses, type McpRuntime } from "kurt-agent";
import { loadMcpServers } from "./mcp-config.ts";
import { App, bannerString, type Compactor, type EngineRunner, type SessionController, type SessionState } from "./tui/index.ts";
import {
  resolveConfig,
  makeSandbox,
  makeTools,
  maybeWorktree,
  modelFor,
  resolveWorkspace,
  systemPrompt,
  toolsForMode,
  autoCompactThreshold,
  type LaunchOptions,
  type WorktreeSession,
} from "./agent.ts";
import { saveConfig } from "./config.ts";
import {
  allProviders,
  mergeProviders,
  resolveModel,
  usableModels,
  usableProviders,
  type ProviderConfig,
  type ProviderId,
  type ProvidersConfig,
} from "./providers.ts";
import { loadContextPrelude } from "./context-files.ts";
import { loadSkills } from "./skills.ts";
import { mcpServerInfos } from "./tui/mcp-info.ts";
import { SessionStore, type SessionRecord } from "kurt-agent";
import { Allowlist } from "./allowlist.ts";
import { PermissionBridge } from "./tui/permission.ts";
import { AskBridge } from "./tui/ask.ts";

export async function runTui(opts: LaunchOptions = {}): Promise<void> {
  if (!process.stdin.isTTY) {
    console.error("The TUI needs an interactive terminal. Run `kurt` directly, or use `kurt chat`.");
    process.exit(1);
  }

  const cfg = await resolveConfig();
  // No env-var exit anymore: if nothing is configured the TUI launches straight
  // into the provider setup overlay (see `needsSetup` below + the `/provider` command).

  // The live multi-provider config. The setup overlay mutates this (and persists)
  // so a freshly added key takes effect without restarting.
  let desktop: ProvidersConfig = cfg.desktop;

  /** Build a model for `id` using its provider's baseURL/key, or null if unconfigured. */
  const modelForId = (
    id: string,
    maxTokens?: number,
    reasoning: { thinking?: boolean; effort?: string } = {},
  ): ReturnType<typeof modelFor> | null => {
    const prov = resolveModel(desktop, id);
    if (!prov || !prov.apiKey) return null;
    return modelFor(id, prov.baseURL, prov.apiKey, maxTokens, reasoning);
  };

  // --worktree: isolate this session in its own git worktree + branch.
  let worktree: WorktreeSession | null;
  try {
    worktree = await maybeWorktree(opts);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
  const ws = resolveWorkspace(worktree ? worktree.root : opts.workspacePath);
  const allowWrite = opts.allowWrite ?? [];
  const permission = new PermissionBridge(await Allowlist.load(ws.root));
  const askBridge = new AskBridge();
  const sandbox = makeSandbox();
  let codeTemp = new SessionWorkspace({ sessionId: "tui" });

  // Connect MCP servers once (their tools join every hub the session builds). A
  // failed server degrades to zero tools — it never blocks launch (铁律 #3: MCP
  // tools are just more Tools in the hub; the engine is untouched).
  const mcp: McpRuntime = opts.noMcp
    ? { tools: [], statuses: [], close: async () => {} }
    : await connectMcpServers(await loadMcpServers(ws.root), { permission });

  // Discover skills (global + project). Descriptions go in the prompt catalog;
  // the `skill` tool loads a body on demand (progressive disclosure).
  const skills = await loadSkills(ws.root);

  // All tools live in one hub; the runner hands each mode its allowed subset.
  let hub = new ToolHub([...makeTools(sandbox, codeTemp, ws, allowWrite, permission, askBridge, skills.provider), ...mcp.tools]);
  const newSession = (): void => {
    codeTemp.dispose();
    codeTemp = new SessionWorkspace({ sessionId: "tui" });
    hub = new ToolHub([...makeTools(sandbox, codeTemp, ws, allowWrite, permission, askBridge, skills.provider), ...mcp.tools]);
  };

  // Preload global memory (~/.kurt/memory.md) + project rules (.kurt/rules.md) + skill catalog.
  const prelude = (await loadContextPrelude(ws.root)) + (skills.catalog ? "\n\n" + skills.catalog : "");

  // Saved conversations (stored globally, listed per workspace). A fresh session
  // starts in memory now and is persisted on the first turn.
  const store = new SessionStore();
  let current = store.create(ws.root, cfg.modelId);

  // Occupancy lock: hold a lock on the active session so a second terminal can't
  // open the same one and silently overwrite its history. Released/reclaimed on
  // switch and exit (and auto-reclaimed if this process dies — liveness-based).
  let heldLockId: string | null = null;
  const releaseHeld = (): void => {
    if (heldLockId) store.releaseLock(heldLockId);
    heldLockId = null;
  };
  store.acquireLock(current.id); // fresh unique id → always succeeds
  heldLockId = current.id;

  const makeTitle = async (messages: Message[]): Promise<string> => {
    const firstUser = messages.find((m) => m.role === "user");
    const fallback =
      (firstUser?.content.find((b) => b.type === "text") as { text?: string } | undefined)?.text?.slice(0, 48).trim() ||
      "untitled";
    try {
      const titler = modelForId(cfg.modelId, 32);
      if (!titler) return fallback;
      const prompt =
        "Give a 3-6 word title (no quotes, no trailing punctuation) for this conversation's topic. " +
        "Reply with ONLY the title.\n\n" +
        serializeForSummary(messages.slice(0, 4));
      let text = "";
      for await (const ev of titler.stream(
        { system: "You write short, specific titles.", messages: [{ role: "user", content: [{ type: "text", text: prompt }] }], tools: [] },
        AbortSignal.timeout(8000),
      )) {
        if (ev.type === "text_delta") text += ev.text;
      }
      return text.trim().replace(/^["']|["']$/g, "").split("\n")[0]?.slice(0, 60) || fallback;
    } catch {
      return fallback;
    }
  };

  const sessions: SessionController = {
    list: () => store.list(ws.root),
    open: async (id): Promise<SessionRecord> => {
      const rec = await store.load(id);
      if (!rec) throw new Error(`session not found: ${id}`);
      if (!store.acquireLock(id)) {
        throw new Error(`session "${id}" is open in another terminal — not switching. Use /new for a fresh one.`);
      }
      releaseHeld();
      heldLockId = id;
      current = rec;
      return rec;
    },
    remove: async (id) => {
      await store.remove(id);
      if (heldLockId === id) heldLockId = null;
    },
    save: async (messages) => {
      current.messages = messages;
      await store.save(current);
    },
    startNew: async () => {
      const next = store.create(ws.root, cfg.modelId);
      store.acquireLock(next.id); // fresh unique id → succeeds
      releaseHeld();
      heldLockId = next.id;
      current = next;
    },
    ensureTitle: async (messages) => {
      if (current.title) return current.title;
      current.title = await makeTitle(messages);
      current.messages = messages;
      await store.save(current);
      return current.title;
    },
    currentId: () => current.id,
  };

  // Shared summarizer for both manual /compact and auto-compaction.
  const summarize = async (older: Message[], signal: AbortSignal): Promise<string> => {
    const model = modelForId(cfg.modelId, cfg.maxTokens);
    if (!model) return "(summary unavailable)";
    const prompt =
      "Summarize the following conversation transcript concisely. Preserve key facts, " +
      "decisions, file paths, code identifiers, and open tasks. No preamble.\n\n" +
      serializeForSummary(older);
    let text = "";
    for await (const ev of model.stream(
      { system: "You compress conversations faithfully.", messages: [{ role: "user", content: [{ type: "text", text: prompt }] }], tools: [] },
      signal,
    )) {
      if (ev.type === "text_delta") text += ev.text;
    }
    return text.trim() || "(summary unavailable)";
  };

  // Auto-compaction: the engine fires it when estimated tokens cross ~75% of the
  // context limit, so long sessions don't overflow the window (manual /compact still works).
  const autoCompact: CompactionPolicy = autoCompaction({
    thresholdTokens: autoCompactThreshold(cfg.modelId, cfg.contextLimit),
    summarize,
  });

  const run: EngineRunner = (messages: Message[], signal: AbortSignal, session: SessionState): AsyncIterable<Event> => {
    const model = modelForId(session.modelId, cfg.maxTokens, { thinking: session.thinking, effort: session.effort });
    if (!model) {
      return (async function* () {
        yield {
          type: "error",
          message: `No API key for "${session.modelId}". Open /provider to configure a model provider.`,
          fatal: true,
        } as Event;
      })();
    }
    return runLoop({
      system: systemPrompt(ws, session.mode) + prelude,
      messages,
      tools: toolsForMode(hub, session.mode),
      model,
      compaction: autoCompact,
      signal,
    });
  };

  const compact: Compactor = (messages, signal) => compactHistory(messages, (older) => summarize(older, signal), 2);

  // Provider setup controller for the `/provider` overlay: snapshot for display,
  // save to persist + apply live (returns the refreshed usable model list).
  const providers = {
    snapshot: () => allProviders(desktop),
    save: async (id: ProviderId, patch: Partial<ProviderConfig>): Promise<{ models: string[]; needsSetup: boolean }> => {
      desktop = mergeProviders(desktop, { [id]: patch });
      await saveConfig({ providers: desktop.providers });
      return { models: usableModels(desktop), needsSetup: usableProviders(desktop).length === 0 };
    },
  };

  // Natural-flow: no alternate screen → native scrollback + mouse wheel work.
  process.stdout.write("\n" + bannerString(process.stdout.columns || 80) + "\n");
  process.stdout.write(`\x1b[2m  workspace: ${ws.root}${allowWrite.length ? `  (+write: ${allowWrite.join(", ")})` : ""}\x1b[0m\n`);
  if (worktree) process.stdout.write(`\x1b[2m  worktree:  isolated on branch ${worktree.branch} (of ${worktree.repoRoot})\x1b[0m\n`);
  if (mcp.statuses.length) process.stdout.write(`\x1b[2m  mcp:       ${summarizeStatuses(mcp.statuses)}\x1b[0m\n`);
  if (skills.metas.length) process.stdout.write(`\x1b[2m  skills:    ${skills.metas.map((s) => s.name).join(", ")}\x1b[0m\n`);
  if (cfg.needsSetup) process.stdout.write(`\x1b[33m  setup:     no API key yet — opening provider setup (or type /provider)\x1b[0m\n`);

  const app = render(
    <App
      run={run}
      compact={compact}
      models={cfg.models}
      onNewSession={newSession}
      onConfigChange={(patch) => void saveConfig(patch)}
      permission={permission}
      session={sessions}
      ask={askBridge}
      skills={{ list: skills.infos, load: skills.provider.load }}
      mcp={mcpServerInfos(mcp.statuses, mcp.tools)}
      providers={providers}
      needsSetup={cfg.needsSetup}
      config={{ model: cfg.modelId, contextLimit: cfg.contextLimit, effort: cfg.effort, thinking: cfg.thinking, mode: cfg.mode }}
    />,
  );

  try {
    await app.waitUntilExit();
  } finally {
    releaseHeld(); // free the session lock so it can be reopened
    codeTemp.dispose();
    await mcp.close();
    if (worktree) {
      try {
        process.stdout.write(`\n${await worktree.finish()}\n`);
      } catch (err) {
        process.stdout.write(`\n(worktree commit failed: ${err instanceof Error ? err.message : String(err)})\n`);
      }
    }
  }
}
