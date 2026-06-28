# AGENTS.md — kurt (monorepo root)

A single git repo, bun-workspace monorepo. Bun workspace = `["packages/kurt-agent", "packages/kurt-tui", "packages/kurt-bridge"]`. Packages:

- `packages/kurt-agent/` — the agent **engine** (library). Read `packages/kurt-agent/CLAUDE.md` + `PROJECT_INDEX.md` before working there.
- `packages/kurt-tui/` — **Ink** terminal front-end + the `kurt` CLI; consumes `kurt-agent` via the workspace. Read `packages/kurt-tui/CLAUDE.md` + `PROJECT_INDEX.md`.
- `packages/kurt-bridge/` — **local HTTP/SSE bridge** (Bun): runs the engine for GUI front-ends, mapping the `Event` stream → desktop `Step` shape. Consumes `kurt-agent` (workspace). Read `packages/kurt-bridge/CLAUDE.md` + `PROJECT_INDEX.md`.
- `packages/kurt-app/` — **Tauri v2 + React** macOS desktop front-end (Phase 6). **Not a bun-workspace member** (own `package.json` + `bun.lock`; install with `cd packages/kurt-app && bun install`) so React/Vite/Tauri deps stay out of the engine lockfile. It reaches the engine over HTTP/SSE via `kurt-bridge`, not a TS dep. Read `packages/kurt-app/CLAUDE.md` + `PROJECT_INDEX.md`.

## Layout & rules
- One repo (this one). `bun install` **here** at the root links the workspace (kurt-agent + kurt-tui) and owns the root `bun.lock`. kurt-app is installed separately (its own lockfile).
- Dependency edge is one-way: front-ends → `kurt-agent`. kurt-agent exposes its public API via `packages/kurt-agent/src/lib.ts`; kurt-tui imports `from "kurt-agent"`. Never make the engine depend on a front-end.
- UI deps (ink/react/marked/tauri) live only in the front-ends; the engine core stays dependency-free except the MCP SDK (per `packages/kurt-agent/CLAUDE.md` §1).
- Front-end icons: use [Lucide](https://lucide.dev/icons/) as the first-choice icon set. In `kurt-app`, business components should render icons through `src/components/Icon.tsx` (the lucide adapter) and must not add hand-written SVG path icons unless the asset is a brand/product logo or a non-icon visualization.
- Code style and module boundary rules live in [`docs/代码风格规范.md`](docs/代码风格规范.md). Read its first section before coding; drill into package-specific sections only as needed.

## Workflow (applies to this repo)
- Primary workflow = the `project-module-workflow` skill: read the relevant package's `PROJECT_INDEX.md` first; develop on a `feat/…` (or `fix/…`) branch **in this repo**; gate green before merge; integrate via rebase → `--ff-only`; refresh the touched package's `PROJECT_INDEX.md` / `WORKLOG.md`.
- **`PROGRESS.md` (repo root) is the single live status doc.** Read it at the start of a unit of work to orient, and **after every change that lands on main, update it** — phase status, feature checklist, what's unimplemented, known debt, and the "last updated" commit/date. Treat refreshing PROGRESS.md as a mandatory wrap-up step (alongside PROJECT_INDEX/WORKLOG), never an afterthought.
- Gate = `bun run typecheck && bun test` **in each package you touched**.
- Commit trailer: `Co-Authored-By: Codex Opus 4.8 <noreply@anthropic.com>`. main holds integrated, passing work.
- The three iron rules (engine zero-I/O · protocol-agnostic · add-shells-don't-change-core) are defined in `packages/kurt-agent/CLAUDE.md` — they govern the engine.
