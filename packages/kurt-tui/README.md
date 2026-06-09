# kurt-tui

An [Ink](https://github.com/vadimdemedes/ink) terminal UI for
[`kurt-agent`](../kurt-agent). It's a **front-end consumer** of the engine — it
subscribes to the engine's event stream and renders it, and turns keystrokes into
engine commands. The engine knows nothing about it (kurt-agent 铁律 #2).

Part of the `kurt/` bun-workspace monorepo; depends on `kurt-agent` via the
workspace. UI dependencies (ink/react/marked) live here, so the engine core stays
dependency-free.

## Run

```bash
cd ../.. && bun install           # once, at the repo root (kurt/)
export DEEPSEEK_API_KEY=sk-your-key

bun run tui                       # interactive TUI
bun run chat "summarize README"   # stdout chat (one-shot or REPL)
```

### The `kurt` command

Install a global `kurt` launcher (a tiny wrapper that runs this CLI via bun):

```bash
printf '#!/bin/sh\nexec "$HOME/.bun/bin/bun" run "%s/src/cli.ts" "$@"\n' "$PWD" > "$HOME/.bun/bin/kurt"
chmod +x "$HOME/.bun/bin/kurt"      # ~/.bun/bin is already on PATH
```

Then from anywhere:

```bash
kurt                    # launch the TUI (works on the current directory)
kurt --workspace ~/proj # set the agent's working dir explicitly (alias: --workplace)
kurt chat [prompt]      # stdout chat
kurt config             # show saved settings + path
kurt help
```

### Working directory & sandbox

The agent works **inside a workspace** (default: the dir you run `kurt` in, or
`--workspace <path>`):

- `WORKSPACE_DIR` — writable working dir (do all work here).
- `IMPORT_DIR` (`<ws>/import`) — inputs you drop in; read-only by convention.
- `EXPORT_DIR` (`<ws>/export`) — where the agent writes deliverables.

These are injected into the system prompt **and** as env vars for `shell`/`run_code`.
The sandbox **blocks writes outside the workspace** — open extra dirs with
`--allow-write <path>` (repeatable). "Path protocol over discovery": the agent
acts on these injected paths instead of exploring the filesystem.

### Command approval

Sensitive commands (`rm`, `sudo`, disk writes, `curl … | sh`, force-push, …) pause
for approval — **[y] allow once · [a] always allow · [n/esc] deny** — with the
command, a short explanation, and the risk shown. "Always allow" is remembered per
project in `<workspace>/.kurt/allowlist.json` (commit it to share with your team).
`--yes`/`-y` auto-approves; non-interactive runs default to deny.

### Remembered settings

What you pick in the TUI (`/model`, `/effort`, `/think`, `/mode`) is saved to
`~/.kurt/config.json` and restored next launch — no need to reconfigure each time.
Precedence: saved config → env var → default. Env (optional): `DEEPSEEK_BASE_URL`,
`DEEPSEEK_MODEL`, `DEEPSEEK_CONTEXT`, `DEEPSEEK_EFFORT`, `DEEPSEEK_THINKING=1`.
The API key is read from the env only — never written to the config file.

## Layout

```
┌ logo (centered) ─────────────────────────┐
│ conversation viewport (scrollable):       │
│   you / kurt (markdown) / ✿ thinking /    │
│   ⚙ tool cards (IN:/OUT:, clipped) /      │
│   notices; turns split by a divider rule  │
├ command palette (type /) ────────────────┤
│ › input                                   │
└ status bar: model · ctx 145k/1M ● · effort · think · [mode] ┘
```

- **Scroll** history with your terminal's native mouse wheel (no alt-screen — finished
  turns flow into normal scrollback via Ink `<Static>`).
- **Slash commands** (type `/`): `/help /model /mode /effort /think /compact /clear /new /exit`.
- `bun test` · `bun run typecheck`.
