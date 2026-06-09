# kurt

A protocol-agnostic, zero-I/O AI agent — engine + terminal UI, in TypeScript on
[Bun](https://bun.sh). A single repo (bun workspace) with two packages:

| Package | What |
|---------|------|
| [`packages/kurt-agent`](./packages/kurt-agent) | The agent **engine** (a library): an inner loop that drives `model → tools → model …` and emits an event stream. Zero I/O in the core; everything else is an injected interface (tools, model providers, sandbox, compaction). No runtime deps. |
| [`packages/kurt-tui`](./packages/kurt-tui) | An **Ink** terminal front-end + the `kurt` CLI. Consumes the engine via the workspace. UI deps (ink/react/marked) live here. |

The dependency edge is one-way: `kurt-tui` → `kurt-agent` (front-ends consume the
engine, never the reverse). The engine exposes its public API via
`packages/kurt-agent/src/lib.ts`.

## Quickstart

```bash
bun install                         # at this root — links the workspace
export DEEPSEEK_API_KEY=sk-your-key # any OpenAI-compatible endpoint works

# install the global `kurt` command (a wrapper that runs the CLI via bun):
printf '#!/bin/sh\nexec "$HOME/.bun/bin/bun" run "%s/packages/kurt-tui/src/cli.ts" "$@"\n' "$PWD" > "$HOME/.bun/bin/kurt"
chmod +x "$HOME/.bun/bin/kurt"

kurt            # launch the TUI
kurt chat "…"   # stdout chat (one-shot or REPL)
kurt config     # show saved settings; `kurt config set model …`
kurt help
```

Settings you change in the TUI (`/model`, `/effort`, `/think`, `/mode`) persist to
`~/.kurt/config.json`. The API key is read from the environment only.

## Develop

```bash
cd packages/kurt-agent && bun test && bun run typecheck   # engine
cd packages/kurt-tui   && bun test && bun run typecheck   # front-end
```

Each package has its own `CLAUDE.md` (rules) and `PROJECT_INDEX.md` (architecture
map) — read those before working in a package. The build is phased; see
`packages/kurt-agent/WORKLOG.md`.
