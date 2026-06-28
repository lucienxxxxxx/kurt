# PROJECT_INDEX — kurt-app (macOS desktop)

> Cached architecture map. **Read this first**; scan the tree only for files this map
> points to. Keep it fresh on every structural change (project-module-workflow Step 6).
> Last synced: 2026-06-29, after moving app-wide UI icons to the `lucide-react` adapter.

## 1. Overview
Tauri v2 macOS desktop front-end for kurt (Phase 6). It renders the agent's event
stream as a rich thread UI (per `prototype/`) and is a **consumer of the kurt engine**
via `kurt-bridge` (a local Bun HTTP/SSE server), not a re-implementation. `packages/kurt-app`
in the `kurt` monorepo. Design mapping: `PORTING_GUIDE.md`. Rules: `CLAUDE.md`.

## 2. Stack & commands
- **Tauri v2** (Rust shell) + **React 19 + TypeScript + Vite** + CSS tokens + `lucide-react` icons + shadcn-style local wrappers under `@/components/ui/*`.
- **Not a bun-workspace member** — own `package.json` + `bun.lock`. Install: `cd packages/kurt-app && bun install`.
- Dev (GUI): `bun run tauri dev` · Frontend build: `bun run build` (tsc + vite) · Sidecar: `bun run build:bridge` · Bundle: `bun run build:mac` / `bun run tauri build`.
- Rust gate: `cd src-tauri && cargo check`. Component tests (from 6.1): `bun run test` (Vitest + RTL).
- **Gate** = `bun run build` + `cargo check` (+ tests). GUI/visual → `MANUAL_TESTS.md`.

## 3. Architecture (the bridge boundary)
```
kurt-app (Tauri+React, this pkg)         kurt-bridge (Bun, packages/kurt-bridge — built in 6.2)
  webview UI ──fetch/SSE──▶ 127.0.0.1 ──▶  HTTP+SSE: POST /run (SSE), sessions CRUD
  Tauri (Rust) spawns + supervises ─────▶  consumes kurt-agent: runLoop, tools, sandbox,
  the bridge (dev: local `bun`)            MCP, skills, sessions, compaction, permissions
```
- Engine logic lives in `kurt-agent`; the bridge maps engine `Event` → the UI `Step` shape
  (user/thinking/text/tool/read/skill). The app holds NO engine code (铁律 #2).
- The app↔bridge contract is HTTP/SSE JSON; the app defines its own wire types (mirror the bridge).

## 4. Module map
| Path | Responsibility | Status |
|------|----------------|--------|
| `src/main.tsx` | React entry; imports `styles/{tokens,app}.css` | 6.0/6.1 ✓ |
| `src/App.tsx` | Root: UI state, theme/lang (persisted), thread→segment grouping; **real runs via the bridge** (`startRun` streams steps, remaps bridge step ids, stop aborts, queue → multi-turn); routes chat/settings/skills views; derives sidebar projects from session workspaces and filters project children out of Recent | 6.3+ ✓ |
| `src/lib/bridge.ts` | kurt-bridge HTTP/SSE client: `runStream`, `listSessions` (incl. workspace), session CRUD, config/info, workspace file APIs, **`listSkills`/`getSkill`**. Wire types mirror `kurt-bridge/src/types.ts` | 6.3+ ✓ |
| `src/lib/projects.ts` | Pure sidebar project grouping: compares full workspace paths, creates a project only when a workspace has 3+ sessions, disambiguates duplicate folder names by adding parent path segments with compact ellipsis, and exposes project session ids so Recent can hide archived children | ✓ |
| `src/lib/bridgeUrl.ts` | `resolveBridgeUrl` — polls Tauri `bridge_url` command (auto-spawned port), falls back to `VITE_BRIDGE_URL`/`127.0.0.1:8765` | 6.3 ✓ |
| `src/lib/scroll.ts` | `isNearBottom`/`distanceFromBottom` — pure threshold check for the thread's conditional bottom-follow (App drives follow-state + the jump-to-latest pill from it) | ✓ |
| `src/lib/notify.ts` | `playSend()` / `runComplete(body)` — send & completion sound effects (`assets/sounds/*.mp3`) + a desktop notification (tauri-plugin-notification) when the window is unfocused | ✓ |
| `src/lib/dialog.ts` | `pickFolder()` — native folder picker (tauri-plugin-dialog) for the per-conversation workspace | ✓ |
| `src/components/` | `Icon` (**lucide-react adapter; app icon names map to Lucide first, with fallback only for unknown names**), `Markdown` (**`MdBlock` = react-markdown + remark-gfm**), `Sidebar` (new chat + skills + Projects section + Recent section), `SkillsPage` (local skills list/detail/use), `Composer`, `Settings`, `thread/steps`, **`Approval`** | 6.1/6.4+ ✓ |
| `src/components/ui/` | shadcn-style local UI wrappers (`Button`, `Badge`, `ScrollArea`) imported via `@/components/ui/*`; styling remains in `styles/app.css` to match the existing CSS-token system | ✓ |
| `src/components/workspace/` | **Tab framework (editor groups)**: `WorkspaceTabsBar` (one strip per group: tabs + `+` dropdown + right-click split/move/unsplit/close), `Workspace` (renders 1–2 groups, each = strip + pane; draggable divider), `PreviewTab` (md/code/html/pdf/tool-output; replaces DetailPanel), `FilesTab` (workspace tree via bridge `/fs`), `PlanTab` (agent plan checklist from the `plan` frame), `TerminalTab` (xterm.js ↔ Rust PTY, lazy-loaded) | Phase A/B/C ✓ |
| `src-tauri/src/pty.rs` | Terminal backend: portable-pty PTY per tab; commands `pty_spawn`/`pty_write`/`pty_resize`/`pty_kill`; output → `pty:data:<id>` / `pty:exit:<id>` events | Phase C ✓ |
| `src/lib/tabs.ts` | Pure `tabsReducer` over **editor groups** (`add`/`addSplit`/`close`/`activate`/`split`/`unsplit`/`update`) + `initTabs`/`activeTab`; each pane is a `TabGroup` owning its tabs+active tab (split = 2 groups). App stores tabs **per session** (`Record<sessionId, TabsState>`, `"new"` for the unsaved chat) so each conversation keeps its own tabs/split | Phase A (groups, per-session) ✓ |
| `src/i18n/strings.ts` | `T` dict + `tr(entry,lang,params)` (ported from i18n.js) | 6.1 ✓ |
| `src/types.ts` | `Step` discriminated union, `RawStep` (distributive Omit), `Session`/`Panel`/`QueuedMsg`; **`Tab`/`TabKind`/`TabGroup`/`TabsState`/`PreviewKind`** | 6.1 / Phase A ✓ |
| `src/mocks/agent.ts` | `sessions`/`recents`/`liveRun`/`FILE_CONTENT` fixtures (from data.js) | 6.1 (replaced by bridge in 6.3) |
| `src/styles/` | `tokens.css` (verbatim) + `app.css` (prototype CSS, window shell adapted for Tauri) | 6.1 ✓ |
| `src/test/setup.ts` | Vitest + jest-dom setup (jsdom env in `vite.config.ts`) | 6.1 ✓ |
| `scripts/build-bridge-sidecar.ts` | Compiles `packages/kurt-bridge/src/index.ts` with `bun build --compile` into `src-tauri/binaries/kurt-bridge-<target-triple>` for Tauri `externalBin` packaging | 6.4d ✓ |
| `src-tauri/` | Rust shell: `src/lib.rs` **spawns the kurt-bridge sidecar** (release: bundled `kurt-bridge` binary from resources/current exe dir; dev: `bun run` the source entry; reads `KURT_BRIDGE_PORT` from stdout; `bridge_url` command; kills on Exit; bridge dies on stdin-EOF). `tauri.conf.json` (productName "Kurt", macOS Overlay traffic lights, `externalBin`). `capabilities/`, `icons/` | 6.4d ✓ |
| `index.html`, `vite.config.ts`, `tsconfig*.json` | Vite + TS config; `@/* → src/*` alias for local UI wrappers | 6.0+ ✓ |
| `prototype/` | **Design reference** (HTML/JSX mockup) — do NOT port scaffolding (`PORTING_GUIDE.md` §10) | reference |
| `PORTING_GUIDE.md` | Prototype→production mapping (layout, tokens, components, i18n, icons) | reference |
| `MANUAL_TESTS.md` | Human test procedures for GUI/visual things automation can't check | per phase |

## 5. Navigation — "to do X, look at Y"
- **Match the design** → `PORTING_GUIDE.md` (§3 tokens, §4 components, §11 fidelity rules) + `prototype/ui.jsx`/`tokens.css`.
- **Add/change a screen or component** → `src/components/**`; shared primitives go through `src/components/ui/*` and should be imported via `@/components/ui/*`.
- **Use icons** → `src/components/Icon.tsx`; add Lucide imports/mappings there first. Do not add hand-written SVG icon paths in business components; only brand logos and visualizations should own SVG directly.
- **Sidebar project grouping** → `src/lib/projects.ts` + `src/components/Sidebar.tsx`.
- **Skills page / skill client** → `src/components/SkillsPage.tsx` + `src/lib/bridge.ts` (`/skills`).
- **Talk to the engine** → `kurt-bridge` HTTP/SSE (from 6.2); app side in `src/hooks/useStreamedRun.ts` + `src/lib/` (from 6.3).
- **Window/chrome/IPC/sidecar** → `src-tauri/tauri.conf.json` + `src-tauri/src/lib.rs`.
- **State** → `src/stores/useAgentStore.ts` (Zustand; only persist `{theme,lang}`).

## 6. Conventions
- Pure logic/components testable (Vitest + RTL); side effects (IPC/fetch) in `hooks/`/`lib/`.
- shadcn-style primitives only via `@/components/ui/*`; current wrappers are local CSS-token components (`Button`, `Badge`, `ScrollArea`) and use `src/lib/cn.ts`.
- UI icons are Lucide-first via `src/components/Icon.tsx`; preserve local app icon names for call-site stability.
- Strict TS. Commit style + workflow per `CLAUDE.md` §4. API key never committed.

## 7. Status / roadmap (Phase 6 sub-phases — live status in repo-root PROGRESS.md)
- **6.0 Scaffold ✓** — Tauri v2 + React + Vite; builds (frontend + Rust); names = kurt-app/Kurt.
- **6.1 Static UI parity ✓** — CSS-reuse (not shadcn, per user); sidebar/thread(5 step types)/composer+menus/settings/detail-panels/theme/i18n on mock data + faked streaming; real macOS traffic lights overlaid. Vitest 11 pass.
- **6.2** `kurt-bridge` (Bun): Event→Step over HTTP/SSE; sessions CRUD; integration-tested.
- **6.3** Wire app↔bridge: Tauri spawns bridge; Zustand + TanStack Query; live streaming run.
- **6.4** Harden + package: API-key Settings, permission modal, persistence, compiled bridge sidecar, macOS `.app`/`.dmg` bundle. Signing/notarization remains distribution-specific.
