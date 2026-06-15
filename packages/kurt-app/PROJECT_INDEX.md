# PROJECT_INDEX — kurt-app (macOS desktop)

> Cached architecture map. **Read this first**; scan the tree only for files this map
> points to. Keep it fresh on every structural change (project-module-workflow Step 6).
> Last synced: 2026-06-15, after Phase 6.0 (Tauri v2 + React + Vite scaffold).

## 1. Overview
Tauri v2 macOS desktop front-end for kurt (Phase 6). It renders the agent's event
stream as a rich thread UI (per `prototype/`) and is a **consumer of the kurt engine**
via `kurt-bridge` (a local Bun HTTP/SSE server), not a re-implementation. `packages/kurt-app`
in the `kurt` monorepo. Design mapping: `PORTING_GUIDE.md`. Rules: `CLAUDE.md`.

## 2. Stack & commands
- **Tauri v2** (Rust shell) + **React 19 + TypeScript + Vite** + (incoming) Tailwind + shadcn/ui + Zustand + TanStack Query.
- **Not a bun-workspace member** — own `package.json` + `bun.lock`. Install: `cd packages/kurt-app && bun install`.
- Dev (GUI): `bun run tauri dev` · Frontend build: `bun run build` (tsc + vite) · Bundle: `bun run tauri build`.
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
| `src/main.tsx`, `src/App.tsx` | React entry + root (scaffold default for now) | 6.0 scaffold; real UI in 6.1 |
| `src/` (planned: `components/{layout,brand,thread,composer}`, `stores/`, `hooks/`, `i18n/`, `lib/`, `styles/`) | UI per `PORTING_GUIDE.md` §2 | built 6.1 → 6.3 |
| `src-tauri/` | Rust shell: `Cargo.toml` (pkg `kurt-app`, lib `kurt_app_lib`), `src/{main,lib}.rs`, `tauri.conf.json` (productName "Kurt"), `capabilities/`, `icons/` | 6.0 ✓; IPC + sidecar spawn in 6.3/6.4 |
| `index.html`, `vite.config.ts`, `tsconfig*.json` | Vite + TS config | 6.0 ✓ |
| `prototype/` | **Design reference** (HTML/JSX mockup) — do NOT port scaffolding (`PORTING_GUIDE.md` §10) | reference |
| `PORTING_GUIDE.md` | Prototype→production mapping (layout, tokens, components, i18n, icons) | reference |
| `MANUAL_TESTS.md` | Human test procedures for GUI/visual things automation can't check | per phase |

## 5. Navigation — "to do X, look at Y"
- **Match the design** → `PORTING_GUIDE.md` (§3 tokens, §4 components, §11 fidelity rules) + `prototype/ui.jsx`/`tokens.css`.
- **Add/!change a screen or component** → `src/components/**` (after 6.1); wrap shadcn via `@/components/ui/*`.
- **Talk to the engine** → `kurt-bridge` HTTP/SSE (from 6.2); app side in `src/hooks/useStreamedRun.ts` + `src/lib/` (from 6.3).
- **Window/chrome/IPC/sidecar** → `src-tauri/tauri.conf.json` + `src-tauri/src/lib.rs`.
- **State** → `src/stores/useAgentStore.ts` (Zustand; only persist `{theme,lang}`).

## 6. Conventions
- Pure logic/components testable (Vitest + RTL); side effects (IPC/fetch) in `hooks/`/`lib/`.
- shadcn only via `@/components/ui/*`. lucide-react for icons (`PORTING_GUIDE.md` §8). `cn()` = clsx + tailwind-merge.
- Strict TS. Commit style + workflow per `CLAUDE.md` §4. API key never committed.

## 7. Status / roadmap (Phase 6 sub-phases — live status in repo-root PROGRESS.md)
- **6.0 Scaffold ✓** — Tauri v2 + React + Vite; builds (frontend + Rust); names = kurt-app/Kurt.
- **6.1** Static UI parity on mock data (Tailwind + shadcn + tokens; sidebar/thread/composer/menus/theme/i18n).
- **6.2** `kurt-bridge` (Bun): Event→Step over HTTP/SSE; sessions CRUD; integration-tested.
- **6.3** Wire app↔bridge: Tauri spawns bridge; Zustand + TanStack Query; live streaming run.
- **6.4** Harden + package: API-key Settings, permission modal, persistence, bundle signed `.app`.
