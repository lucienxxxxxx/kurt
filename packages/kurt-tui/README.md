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
`--workspace <path>`). The whole workspace (`WORKSPACE_DIR`, injected into the
prompt and as an env var) is **fully writable — no permission needed**; the
sandbox just **blocks writes outside it**. Open extra dirs with `--allow-write
<path>` (repeatable), or the agent can `request_write_access` at runtime (you
approve). No `import/`/`export/` folders are created.

> File writes and **command approval are independent**: writing in the workspace
> never prompts, while sensitive bash commands (below) always do.

### Command approval

Sensitive commands (`rm`, `sudo`, disk writes, `curl … | sh`, force-push, …) pause
for approval — **[y] allow once · [a] always allow · [n/esc] deny** — with the
command, a short explanation, and the risk shown. "Always allow" is remembered per
project in `<workspace>/.kurt/allowlist.json` (commit it to share with your team).
`--yes`/`-y` auto-approves; non-interactive runs default to deny.

### Sessions & memory (`~/.kurt/`)

Conversations are **saved automatically** (after each turn) to `~/.kurt/sessions/`
and titled on the first exchange (a short LLM-generated topic, with a fallback to
the first message). `/sessions` opens a picker — **↑/↓** move · **↵** open ·
**d** delete · **esc** close — listing the sessions for the **current workspace**.
`/new` and `/clear` begin a fresh conversation (the previous one stays saved and
resumable). `/clear` keeps the sandbox temp dir; `/new` also resets it.

Two optional files are **preloaded into the system prompt** if present:
`~/.kurt/memory.md` (global, long-term notes) and `<workspace>/.kurt/rules.md`
(project-specific rules). They're read-only for now — the agent updating memory
itself comes later. The whole `~/.kurt` home can be relocated with `KURT_HOME`.

### Remembered settings

What you pick in the TUI (`/model`, `/effort`, `/think`, `/mode`) is saved to
`~/.kurt/config.json` and restored next launch — no need to reconfigure each time.
Precedence: saved config → env var → default. Env (optional): `DEEPSEEK_BASE_URL`,
`DEEPSEEK_MODEL`, `DEEPSEEK_CONTEXT`, `DEEPSEEK_EFFORT`, `DEEPSEEK_THINKING=1`,
`DEEPSEEK_MAX_TOKENS` (output-token cap; **defaults to the model's own max output**
from its capability metadata — e.g. 384K for DeepSeek V4 — so large writes aren't truncated).
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
- **Slash commands** (type `/`): `/help /model /mode /effort /think /compact /sessions /clear /new /exit`.
- `bun test` · `bun run typecheck`.
