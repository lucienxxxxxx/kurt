# CLAUDE.md — kurt (workspace root)

Bun-workspace monorepo. Two member packages, **each its own git repo**:

- `kurt-agent/` — the agent **engine** (library). Read `kurt-agent/CLAUDE.md` + `kurt-agent/PROJECT_INDEX.md` before working there.
- `kurt-tui/` — **Ink** terminal front-end; consumes `kurt-agent` via the workspace. Read `kurt-tui/CLAUDE.md` + `kurt-tui/PROJECT_INDEX.md`.

## This root repo
- Tracks **only** `package.json` (workspace config) + `bun.lock` (shared lockfile) + these docs. The member dirs are `.gitignore`d here — they are separate repos with their own history/branches.
- Run `bun install` **here** to link the workspace and refresh `bun.lock`; commit the updated `bun.lock` to this root repo when deps change.
- Do **not** commit member source from this repo — branch/commit inside each member's own repo (per their `project-module-workflow` rules).
- The dependency edge is one-way: `kurt-tui` → `kurt-agent` (front-ends consume the engine; never the reverse). kurt-agent exposes its public API via `kurt-agent/src/lib.ts`.
