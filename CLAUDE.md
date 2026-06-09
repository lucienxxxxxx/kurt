# CLAUDE.md — kurt (monorepo root)

A single git repo, bun-workspace monorepo (`workspaces: ["packages/*"]`). Two packages:

- `packages/kurt-agent/` — the agent **engine** (library). Read `packages/kurt-agent/CLAUDE.md` + `PROJECT_INDEX.md` before working there.
- `packages/kurt-tui/` — **Ink** terminal front-end + the `kurt` CLI; consumes `kurt-agent` via the workspace. Read `packages/kurt-tui/CLAUDE.md` + `PROJECT_INDEX.md`.

## Layout & rules
- One repo (this one). `bun install` **here** at the root links the workspace and owns `bun.lock`.
- Dependency edge is one-way: `kurt-tui` → `kurt-agent`. kurt-agent exposes its public API via `packages/kurt-agent/src/lib.ts`; kurt-tui imports `from "kurt-agent"`. Never make the engine depend on a front-end.
- UI deps (ink/react/marked) live only in `kurt-tui`; the engine core stays dependency-free (the "zero runtime deps" property is per-package — check `packages/kurt-agent/package.json`).

## Workflow (applies to this repo)
- Primary workflow = the `project-module-workflow` skill: read the relevant package's `PROJECT_INDEX.md` first; develop on a `feat/…` (or `fix/…`) branch **in this repo**; gate green before merge; integrate via rebase → `--ff-only`; refresh the touched package's `PROJECT_INDEX.md` / `WORKLOG.md`.
- Gate = `bun run typecheck && bun test` **in each package you touched**.
- Commit trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. main holds integrated, passing work.
- The three iron rules (engine zero-I/O · protocol-agnostic · add-shells-don't-change-core) are defined in `packages/kurt-agent/CLAUDE.md` — they govern the engine.
