# PROJECT_INDEX — kurt-tui

> Cached architecture map. Read this first; scan only what it points to.
> Last synced: 2026-06-09, after adding the `kurt` CLI + persisted settings.

## 1. Overview
Ink terminal UI for `kurt-agent`. A front-end consumer: subscribes to the engine
event stream → renders; keystrokes → engine commands. All agent logic comes from
`kurt-agent` (imported via the workspace as `"kurt-agent"`).

## 2. Stack & commands
- TypeScript on **Bun** + **Ink/React**; markdown via `marked` + `marked-terminal`.
- Install once at the workspace root: `cd .. && bun install`.
- `bun run tui` / `bun run chat` (need `DEEPSEEK_API_KEY`) · `bun test` · `bun run typecheck`.
- Global launcher: `kurt` (a `~/.bun/bin/kurt` wrapper → `src/cli.ts`). Subcommands: `kurt` (TUI), `kurt chat`, `kurt config [set|path]`, `kurt help`.
- Settings (`model/effort/thinking/mode`) persist to `~/.kurt/config.json` (override path with `KURT_CONFIG_PATH`). Precedence: persisted > env > default. API key is env-only.
- Gate before merge: **`bun run typecheck && bun test`** (currently 26 tests, offline).

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
| `src/cli.ts` | **CLI entry / bin `kurt`**: dispatches `tui` (default) / `chat` / `config` / `help` | — | `./run-tui`, `./run-chat`, `./config` |
| `src/run-tui.tsx` | Launch the TUI: prints banner once, wires runner+compactor+newSession, mounts `<App>` (normal screen), persists settings on change | `runTui` | `kurt-agent`, `./agent`, `./config`, `./tui` |
| `src/run-chat.ts` | Stdout REPL/one-shot using the same runtime as the TUI | `runChat` | `kurt-agent`, `./agent` |
| `src/agent.ts` | Shared runtime: `resolveSettings` (pure precedence) / `resolveConfig`, `makeSandbox`/`makeTools`/`modelFor`, `SYSTEM` | (those) | `kurt-agent`, `./config` |
| `src/config.ts` | Persisted user settings at `~/.kurt/config.json`: `loadConfig`/`saveConfig`/`configPath`/`sanitize` | (those) | — |
| `src/tui/app.tsx` | Root Ink component: `committed` (→ `<Static>` scrollback) + `live` (current turn) + session state, command palette, drives the loop, `/compact`, `/new`, `/clear` | `App`, `EngineRunner`, `Compactor`, `SessionState` | ink, react, kurt-agent, sibling files |
| `src/tui/conversation.tsx` | Renders one entry: user (divider+plain), kurt (markdown when final), thinking, tool cards (IN:/OUT:, clipped), notices | `EntryView` | ink, `./markdown`, `./tool-format`, `./entries` |
| `src/tui/status-bar.tsx` | Bottom bar: model · ctx + scarcity dot · effort · think · mode | `StatusBar`, `Status`, `ChatMode` | ink, `./theme` |
| `src/tui/banner.ts` | Startup banner (printed once at launch; scrolls with history) | `bannerString` | — |
| `src/tui/entries.ts` | View-model: `Entry`, `applyEvent` reducer, `safeJson` | `applyEvent`,`pushUser`,`safeJson` | `kurt-agent` (types) |
| `src/tui/commands.ts` | Slash-command registry + parse/filter | `COMMANDS`,`filterCommands`,`parseCommand`,`isCommand` | — |
| `src/tui/markdown.ts` | `renderMarkdown` (marked + marked-terminal → ANSI) | `renderMarkdown` | marked(-terminal) |
| `src/tui/tool-format.ts` | Tool card helpers: label, IN formatting, output clip | `toolLabel`,`formatToolInput`,`clip`,`labeled` | `./entries` |
| `src/tui/theme.ts` | `formatTokens`, `usedFraction`, `scarcityColor` | (same) | — |
| `src/tui/index.ts` | Barrel for the tui components | re-exports | — |

## 5. Navigation — "to do X, look at Y"
- **Change layout/regions** → `app.tsx` (the `<Static>` history + the pinned `live`/palette/input/status region). Scrolling is the terminal's own (mouse wheel) — no in-app scroll code.
- **Add a slash command** → `commands.ts` (registry) + `app.tsx` `handleCommand`.
- **Change how a message type renders** → `conversation.tsx` `EntryView`.
- **Status-bar content** → `status-bar.tsx` + `theme.ts`.
- **Add a CLI subcommand** → `cli.ts` (dispatch) + a `run-*.ts`.
- **Change settings/precedence or persistence** → `agent.ts` (`resolveSettings`) + `config.ts`.
- **New engine capability needed** → implement in `kurt-agent`, export from its `src/lib.ts`, then consume here.
- Tests: `src/tui/*.test.ts(x)` (entries/commands/markdown/tool-format + an Ink render of `App`).

## 6. Conventions
- Pure view-model in `.ts` (testable); Ink components in `.tsx`.
- Only cross-package import is `"kurt-agent"`; everything else relative within `src/tui/`.
- Strict TS; `#`-private fields; `bun.lock` owned by workspace root (gitignored here).
- Git/workflow per `CLAUDE.md` §3 (project-module-workflow).
