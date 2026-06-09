# kurt — monorepo

Bun-workspace root for the kurt agent project.

| Package | What | Git |
|---------|------|-----|
| [`kurt-agent/`](./kurt-agent) | The protocol-agnostic, zero-I/O agent **engine** (a library). | own repo |
| [`kurt-tui/`](./kurt-tui) | **Ink** terminal front-end; consumes `kurt-agent` via the workspace. | own repo |

This root repo intentionally tracks **only** the workspace config (`package.json`)
and the shared **lockfile** (`bun.lock`). The two member packages are independent
git repositories and are `.gitignore`d here — clone/version them separately.

## Setup

```bash
bun install        # run here at the root: links the workspace + writes bun.lock
```

## Run

```bash
cd kurt-tui  && bun run tui            # Ink TUI (needs DEEPSEEK_API_KEY, a real terminal)
cd kurt-agent && bun run chat          # stdout REPL
# in either package: bun test · bun run typecheck
```
