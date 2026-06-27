# PROJECT_INDEX — kurt-tui

> Cached architecture map. Read this first; scan only what it points to.
> Last synced: 2026-06-27, after `/mcp` + `/provider` (in-TUI multi-provider API-key setup: DeepSeek/OpenAI/Claude presets + Custom; first-run onboarding; no env var needed). Earlier: `/skills` discovery command; B1–B5 bug sweep (atomic writes + session occupancy lock, `kurt worktree list|prune`, autoCompactThreshold); Phase 5 MCP + Skills.

## 1. Overview
Ink terminal UI for `kurt-agent`. A front-end consumer: subscribes to the engine
event stream → renders; keystrokes → engine commands. All agent logic comes from
`kurt-agent` (imported via the workspace as `"kurt-agent"`). This package is
`packages/kurt-tui` in the single-repo **`kurt`** monorepo; the engine is `packages/kurt-agent`.

## 2. Stack & commands
- TypeScript on **Bun** + **Ink/React**; markdown via `marked` + `marked-terminal`.
- Install once at the repo root (`kurt/`, two levels up): `cd ../.. && bun install`.
- `bun run tui` / `bun run chat` (need `DEEPSEEK_API_KEY`) · `bun test` · `bun run typecheck`.
- Global launcher: `kurt` (a `~/.bun/bin/kurt` wrapper → `src/cli.ts`). Subcommands: `kurt` (TUI), `kurt chat`, `kurt config [set|path]`, `kurt help`.
- Flags (tui/chat): `--workspace`/`--workplace <path>` (working dir, default cwd) · `--allow-write <path>` (repeatable) · `--yes`/`-y` (auto-approve sensitive commands) · `--worktree` (isolate in a per-session git worktree+branch) · `--no-mcp` (skip MCP servers).
- **MCP** (Phase 5): servers configured in `~/.kurt/mcp.json` (global) + `<ws>/.kurt/mcp.json` (project, overrides) using the `{ "mcpServers": {...} }` schema. Connected at launch (`mcp-config.ts` → `connectMcpServers` in kurt-agent); their tools join the hub (agent mode); side-effecting tools ask approval; status printed at launch. Implementation lives in kurt-agent's `src/mcp/`.
- **Skills** (Phase 5): reusable procedures in `~/.kurt/skills/` (global) + `<ws>/.kurt/skills/` (project, overrides), each `<name>/SKILL.md` or flat `<name>.md` with optional name/description frontmatter. `skills.ts` (`loadSkills`) builds a `SkillProvider` + the prompt catalog (descriptions only); the `skill` tool (kurt-agent) loads a body on demand (available in every mode). Names printed at launch.
- **Approval**: sensitive commands (rm/sudo/…) prompt allow/always/deny in the TUI (stdin in chat). "Always" persists the rule key to `<workspace>/.kurt/allowlist.json` (per-project). Classifier lives in `kurt-agent` (`classifyCommand`).
- **Write outside the workspace**: the agent calls `request_write_access` (same approval prompt); on allow, the dir is opened for write_file/shell/run_code for the rest of the session (`makeTools` shares one mutable writable-roots array). "Always" persists `write-access:<dir>` in the allowlist.
- **Working dir**: the agent works inside one workspace — `WORKSPACE_DIR` (the whole dir, **fully writable, no approval**). Injected into the system prompt AND as env to shell/run_code. No `import/`/`export/` subdirs are created. Sandbox blocks writes *outside* the workspace (+ `--allow-write` dirs). File writes and command approval are **independent**: in-workspace writes never prompt; sensitive commands always do.
- Settings (`model/effort/thinking/mode`) persist to `~/.kurt/config.json` (override path with `KURT_CONFIG_PATH`). Precedence: persisted > env > default.
- **Providers / API keys** (`src/providers.ts`): multi-provider config persisted under `config.json` `providers` (DeepSeek/OpenAI/Claude built-in presets + a Custom endpoint; each has enabled/apiKey/baseURL/models/format). Configure IN the TUI via `/provider` (no env var required); env keys (`DEEPSEEK_API_KEY`/`OPENAI_API_KEY`/`ANTHROPIC_API_KEY`) still turn a provider on. Claude is stored as `format:"claude"` but still routed through the OpenAI-compatible transport for now (native Anthropic later). First run with nothing configured opens setup automatically.
- Gate before merge: **`bun run typecheck && bun test`** (currently 96 tests, offline; SessionStore tests moved to kurt-agent in 6.2).

## 3. Architecture
- Depends on `kurt-agent` only through its public API (`"kurt-agent"` → its `src/lib.ts`):
  `runLoop`, `Event`/`Message`, `OpenAICompatModel`, the tools, `SeatbeltSandbox`/`DirectSandbox`,
  `SessionWorkspace`, `DuckDuckGoSearch`, `messagesFromEvents`, `compactHistory`/`serializeForSummary`.
- The TUI never reaches into kurt-agent internals; if something's missing, export it from kurt-agent's `src/lib.ts`.
- Multi-turn history is rebuilt from the event stream (`messagesFromEvents`) — the engine exposes no internal state.
- **Display model = natural flow** (NOT a fixed viewport): no alternate screen, so the
  terminal keeps native scrollback and the **mouse wheel** works. Finished turns are
  flushed to scrollback via Ink `<Static>`; only the in-progress turn + input + status
  bar are re-rendered in a pinned bottom region. The banner is printed once at launch.

## 4. Module map
| Path | Responsibility | Key exports | Depends on |
|------|----------------|-------------|------------|
| `src/cli.ts` | **CLI entry / bin `kurt`**: dispatches `tui` (default) / `chat` / `config` / `worktree` (list\|prune) / `help` | — | `./run-tui`, `./run-chat`, `./config`, `kurt-agent` (WorktreeManager) |
| `src/run-tui.tsx` | Launch the TUI: prints banner once, wires runner+compactor+newSession, builds the `SessionController` (store + titling) + memory/rules preload, mounts `<App>` | `runTui` | `kurt-agent`, `./agent`, `./config`, `./session-store`, `./context-files`, `./tui` |
| `src/run-chat.ts` | Stdout REPL/one-shot using the same runtime as the TUI (+ memory/rules preload) | `runChat` | `kurt-agent`, `./agent`, `./context-files` |
| `src/agent.ts` | Shared runtime: `resolveSettings`/`resolveConfig`, `resolveWorkspace`+`workspaceEnv`, `systemPrompt(ws,mode)` (per-mode guidance), `Mode`/`normalizeMode` (legacy "ask"→"chat"), `makeSandbox`/`makeTools(…,permission,askProvider,skills?)` (wires all tools incl. ask_user/update_plan/skill)/`modelFor(…,ReasoningOptions)`, **`TOOLS_BY_MODE`/`toolsForMode(hub,mode)`** (chat=read-only+ask_user+skill · plan=+update_plan · agent=all), `parseLaunchFlags` (`--worktree`/`--no-mcp`), `autoCompactThreshold(modelId,limit)` (75% of min(limit, model real window)) | (those) | `kurt-agent`, `./config` |
| `src/config.ts` | Persisted user settings at `~/.kurt/config.json` (path via `kurtHome()`): `loadConfig`/`saveConfig`/`configPath`/`sanitize`; now also persists `providers` | (those) | `./paths`, `./providers` (types) |
| `src/providers.ts` | Multi-provider model config (pure): `ProviderId`/`ProviderConfig`/`PROVIDER_META` (DeepSeek/OpenAI/Claude/Custom), `resolveProvider`/`allProviders`/`enabledProviders`/`usableProviders`/`usableModels`/`resolveModel`/`defaultModel`/`normalizeProviders` (legacy migration + env keys)/`mergeProviders` | (those) | — |
| `src/paths.ts` | `~/.kurt/` layout: `kurtHome` (KURT_HOME override), `sessionsDir`, `globalMemoryPath`, `projectRulesPath(ws)`, `projectMemoryPath(ws)`, `globalMcpConfigPath`/`projectMcpConfigPath(ws)`, `globalSkillsDir`/`projectSkillsDir(ws)` | (those) | — |
| `src/mcp-config.ts` | Load + merge MCP server config: `parseMcpConfig` (tolerant `{mcpServers}` parse) + `loadMcpServers(ws)` (global `~/.kurt/mcp.json` ∪ project `<ws>/.kurt/mcp.json`, project wins). Connecting/using them is kurt-agent's `connectMcpServers` | `parseMcpConfig`, `loadMcpServers` | `kurt-agent` (types), `./paths` |
| `src/skills.ts` | Discover + parse skills: `parseSkill` (frontmatter+body, tolerant) + `loadSkills(ws)` (scan `~/.kurt/skills/` ∪ `<ws>/.kurt/skills/`, `<name>/SKILL.md` or flat `<name>.md`, project wins) → `{ provider, catalog, metas, infos }`. Catalog goes in the prompt; the `skill` tool (kurt-agent) loads bodies; `infos: SkillInfo[]` (name/description/scope/path) feeds the `/skills` overlay | `parseSkill`, `loadSkills`, `SkillInfo` | `kurt-agent` (`skillCatalog`/types), `./paths` |
| _(SessionStore)_ | **Moved to kurt-agent** (`src/session/store.ts`) in Phase 6.2 so TUI + bridge + desktop share one `~/.kurt/sessions` + one impl. Import `SessionStore`/`SessionMeta`/`SessionRecord` `from "kurt-agent"` | — | `kurt-agent` |
| `src/context-files.ts` | `loadContextPrelude(ws)` → reads `~/.kurt/memory.md` (global) + `<ws>/.kurt/memory.md` (project, agent-written) + `<ws>/.kurt/rules.md` (user rules) into a system-prompt prelude | `loadContextPrelude` | `./paths` |
| `src/tui/app.tsx` | Root Ink component: `committed` (→ `<Static>` scrollback) + `live` (current turn) + session state, command palette, drives the loop, `/compact`, `/sessions` picker, `/new`, `/clear`; autosave + auto-title via `SessionController` | `App`, `EngineRunner`, `Compactor`, `SessionState`, `SessionController` | ink, react, kurt-agent, sibling files |
| `src/tui/session-view.ts` | `entriesFromMessages` — rebuild display entries from saved `Message[]` (resume repaint; renders thinking/text/tool blocks) | `entriesFromMessages` | `kurt-agent`, `./entries` |
| `src/tui/session-picker.tsx` | The `/sessions` list overlay (title · msg count · time-ago); keys handled in App | `SessionPicker` | ink, `../session-store` |
| `src/tui/skills-picker.tsx` | The `/skills` list overlay (name · [global/project] · description); ↵ views a skill's body (printed to scrollback); keys handled in App | `SkillsPicker` | ink, `../skills` |
| `src/tui/mcp-info.ts` | Pure view-model for `/mcp`: `parseMcpToolName` + `mcpServerInfos(statuses, tools)` (group namespaced `mcp__<server>__<tool>` by server) | `mcpServerInfos`, `McpServerInfo` | `kurt-agent` (types) |
| `src/tui/mcp-picker.tsx` | The `/mcp` server-list overlay (name · [ok/fail] · N tools · error); ↵ prints that server's tools to scrollback; keys handled in App | `McpPicker` | ink, `./mcp-info` |
| `src/tui/model-picker.tsx` | The `/model` list overlay (model · provider label · ● current); ↑/↓ + ↵ selects; keys handled in App | `ModelPicker`, `ModelOption` | ink |
| `src/tui/provider-config.tsx` | The `/provider` setup overlay (pure renderer): provider list + per-provider edit form (apiKey masked, baseURL/models/format); `editFields`/`ProvEdit` | `ProviderConfigView`, `editFields`, `ProvEdit` | ink, `../providers` |
| `src/tui/conversation.tsx` | Renders one entry: user (divider+plain), kurt (markdown when final), thinking (plain gray, no italic), tool cards (header `⚙ label + brief one-liner`, then IN:/OUT:, live stream tail + ⠿ while running, clipped), notices | `EntryView` | ink, `./markdown`, `./tool-format`, `./entries` |
| `src/tui/status-bar.tsx` | Bottom bar: model · ctx + scarcity dot · effort · think · mode | `StatusBar`, `Status`, `ChatMode` | ink, `./theme` |
| `src/tui/banner.ts` | Startup banner (printed once at launch; scrolls with history) | `bannerString` | — |
| `src/tui/entries.ts` | View-model: `Entry`, `applyEvent` reducer, `safeJson` | `applyEvent`,`pushUser`,`safeJson` | `kurt-agent` (types) |
| `src/tui/commands.ts` | Slash-command registry + parse/filter | `COMMANDS`,`filterCommands`,`parseCommand`,`isCommand` | — |
| `src/tui/markdown.ts` | `renderMarkdown` (marked + marked-terminal → ANSI) | `renderMarkdown` | marked(-terminal) |
| `src/tui/tool-format.ts` | Tool card helpers: label, IN formatting, output clip | `toolLabel`,`formatToolInput`,`clip`,`labeled` | `./entries` |
| `src/tui/theme.ts` | `formatTokens`, `usedFraction`, `scarcityColor` | (same) | — |
| `src/tui/permission.ts` | `PermissionBridge`: tool `request()` ↔ TUI prompt (useSyncExternalStore); `decide`, "always"→allowlist | `PermissionBridge` | `kurt-agent`, `../allowlist` |
| `src/tui/approval.tsx` | The approval prompt (command/explanation/risk + [y]/[a]/[n]) | `Approval` | ink, `kurt-agent` |
| `src/tui/ask.ts` | `AskBridge`: the agent's `ask_user` ↔ TUI prompt (useSyncExternalStore; `answer()`; resolves "" on abort) | `AskBridge`, `PendingAsk` | `kurt-agent` |
| `src/tui/ask-prompt.tsx` | The ask_user prompt (question + lettered options + free-text); keys handled in App | `AskPrompt` | ink |
| `src/allowlist.ts` | Per-project `<ws>/.kurt/allowlist.json` (load/add/has) | `Allowlist` | — |
| `src/tui/index.ts` | Barrel for the tui components | re-exports | — |

## 5. Navigation — "to do X, look at Y"
- **Change layout/regions** → `app.tsx` (the `<Static>` history + the pinned `live`/palette/input/status region). Scrolling is the terminal's own (mouse wheel) — no in-app scroll code.
- **Add a slash command** → `commands.ts` (registry) + `app.tsx` `handleCommand`.
- **Change how a message type renders** → `conversation.tsx` `EntryView`.
- **Status-bar content** → `status-bar.tsx` + `theme.ts`.
- **Add a CLI subcommand** → `cli.ts` (dispatch) + a `run-*.ts`.
- **Saved sessions / switching / titles** → `session-store.ts` (storage) + `tui/session-view.ts` (resume repaint) + `tui/session-picker.tsx` (UI) + `app.tsx` (`SessionController` calls); the controller (store + titling) is built in `run-tui.tsx`.
- **Memory / rules preload, or the ~/.kurt layout** → `context-files.ts` + `paths.ts`.
- **Modes (chat/agent/plan) — change tool sets or per-mode prompt** → `agent.ts` (`TOOLS_BY_MODE`, `toolsForMode`, `systemPrompt(ws,mode)`); the runner picks `toolsForMode(hub, session.mode)`. `ToolHub`/`Agent` live in `kurt-agent`.
- **ask_user prompt (agent → user)** → `tui/ask.ts` (bridge) + `tui/ask-prompt.tsx` (UI) + `app.tsx` (keys); stdin variant in `run-chat.ts`. Tool/`AskProvider` are in `kurt-agent`.
- **Change settings/precedence or persistence** → `agent.ts` (`resolveSettings`) + `config.ts`.
- **Change working paths / sandbox writable dirs / system prompt** → `agent.ts` (`resolveWorkspace`, `makeTools`, `systemPrompt`); CLI flags in `cli.ts` (`parseLaunchFlags`).
- **Change the approval prompt / allowlist** → `tui/approval.tsx` (UI), `tui/permission.ts` (bridge), `allowlist.ts` (storage); the *classifier* is in `kurt-agent` (`classifyCommand`).
- **MCP servers (config / which servers / lifecycle)** → `mcp-config.ts` (load+merge `mcp.json`) + `paths.ts` (file locations); wired in `run-tui.tsx`/`run-chat.ts` (connect → add tools to hub → close on exit). The client/adapter/transports are in kurt-agent `src/mcp/`.
- **Skills (discovery / parsing / catalog)** → `skills.ts` (`loadSkills`/`parseSkill`) + `paths.ts` (skills dirs); wired in `run-tui.tsx`/`run-chat.ts` (provider → `makeTools`; catalog appended to the prompt prelude). The `skill` tool + `skillCatalog` are in kurt-agent `src/skills/`/`tools/skill.ts`. Mode gating: `skill` is in all of chat/plan/agent (`TOOLS_BY_MODE`).
- **Browse loaded skills at runtime (`/skills`)** → command in `commands.ts`; `app.tsx` (`openSkills`/`viewSkill` + `skillsView` overlay state + key handling) renders `tui/skills-picker.tsx`. Data comes from `run-tui.tsx` (`skills={{ list: skills.infos, load: skills.provider.load }}`); ↵ prints the chosen skill's body into scrollback.
- **Browse connected MCP servers (`/mcp`)** → command in `commands.ts`; `app.tsx` (`openMcp`/`viewMcpServer` + `mcpView`) renders `tui/mcp-picker.tsx`. Data from `run-tui.tsx` (`mcp={mcpServerInfos(mcp.statuses, mcp.tools)}`); ↵ prints that server's tool list into scrollback.
- **Pick a model from a list (`/model`)** → `app.tsx` (`openModelPicker`/`modelOptions` + `modelView`) renders `tui/model-picker.tsx`; no-arg `/model` opens the list (each model tagged with its provider label, ● marks current), `/model <id>` still sets directly. Empty list → routes to `/provider`.
- **Configure model providers / API keys (`/provider`)** → command in `commands.ts`; `app.tsx` (`openProvider`/`saveProvider`/`beginEdit` + `provView` list+edit state + key handling) renders `tui/provider-config.tsx`. Backed by the `providers` controller from `run-tui.tsx` (`snapshot`/`save`); save persists to `config.json` and applies live (refreshes the model list). First run with no key auto-opens it; sending is blocked until a provider is usable.
- **New engine capability needed** → implement in `kurt-agent`, export from its `src/lib.ts`, then consume here.
- Tests: `src/tui/*.test.ts(x)` (entries/commands/markdown/tool-format + an Ink render of `App`).

## 6. Conventions
- Pure view-model in `.ts` (testable); Ink components in `.tsx`.
- Only cross-package import is `"kurt-agent"`; everything else relative within `src/tui/`.
- Strict TS; `#`-private fields; `bun.lock` owned by workspace root (gitignored here).
- Git/workflow per `CLAUDE.md` §3 (project-module-workflow).
