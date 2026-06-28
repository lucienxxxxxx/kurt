# Kurt

Kurt is a local-first AI agent runtime with multiple front ends: a zero-I/O
TypeScript engine, an Ink terminal UI, a local HTTP/SSE bridge, and a macOS
desktop app built with Tauri.

The project is designed around a hard boundary: the engine drives reasoning and
tool orchestration, while all I/O, protocol handling, sandboxing, persistence,
and UI behavior live in injected adapters or front-end packages.

## What Kurt Provides

- **Protocol-agnostic agent engine**: `model -> tools -> model` loop, streaming
  events, thinking/usage events, compaction, typed tool contracts, and pluggable
  model providers.
- **Local tools with guardrails**: workspace-confined file tools, sandboxed shell
  and code execution, permission-gated host operations, memory, MCP tool loading,
  and skills with progressive disclosure.
- **Terminal UI and CLI**: an Ink-based `kurt` experience with sessions, model
  selection, provider configuration, MCP/skills discovery, approvals, and
  markdown rendering.
- **Desktop app for macOS**: a Tauri + React client that streams runs through a
  bundled local bridge, with sessions, settings, approvals, workspace tabs,
  previews, plans, and an embedded terminal.
- **Bridge for GUI clients**: a Bun HTTP/SSE service that runs the engine locally
  and maps the engine event stream into desktop-friendly steps.

## Repository Layout

| Package | Role |
| --- | --- |
| [`packages/kurt-agent`](./packages/kurt-agent) | Core agent engine and reusable library. Engine internals stay zero-I/O; side effects enter through injected model/tool/sandbox/session interfaces. |
| [`packages/kurt-tui`](./packages/kurt-tui) | Ink terminal front end and `kurt` CLI. Consumes `kurt-agent` through the workspace. |
| [`packages/kurt-bridge`](./packages/kurt-bridge) | Local Bun HTTP/SSE bridge for GUI clients. Runs the engine and exposes sessions, runs, approvals, file previews, plans, and config endpoints. |
| [`packages/kurt-app`](./packages/kurt-app) | Tauri v2 + React macOS desktop app. Not a Bun workspace member; it talks to `kurt-bridge` over localhost HTTP/SSE. |

Dependency direction is intentionally one-way:

```text
front ends -> kurt-bridge / kurt-agent -> engine seams
```

The engine never imports UI, desktop, protocol, filesystem, shell, or network
code. Public engine API exports live in
[`packages/kurt-agent/src/lib.ts`](./packages/kurt-agent/src/lib.ts).

## Requirements

- macOS for the desktop app build.
- [Bun](https://bun.sh/) for TypeScript packages and the TUI.
- Rust stable and the Tauri prerequisites for desktop builds.
- At least one model provider key, configured in the TUI/Desktop settings or via
  environment variables such as `DEEPSEEK_API_KEY`.

## Quick Start: Terminal UI

Install the latest prebuilt CLI:

```bash
curl -fsSL https://github.com/lucienxxxxxx/kurt/releases/latest/download/install.sh | sh
kurt
```

The installer downloads the matching `kurt-<platform>-<arch>` binary from the
latest GitHub Release and installs it to `~/.local/bin/kurt`. If that directory
is not on your `PATH`, the installer prints the shell line to add.

Inside the TUI, use `/provider` to configure model providers, `/model` to select
a model, `/mcp` to inspect connected MCP servers, and `/skills` to inspect loaded
skills.

### From Source

Install workspace dependencies from the repository root:

```bash
bun install
```

Run the TUI directly:

```bash
bun run --cwd packages/kurt-tui tui
```

Optional local `kurt` launcher:

```bash
mkdir -p "$HOME/.bun/bin"
printf '#!/bin/sh\nexec "$HOME/.bun/bin/bun" run "%s/packages/kurt-tui/src/cli.ts" "$@"\n' "$PWD" > "$HOME/.bun/bin/kurt"
chmod +x "$HOME/.bun/bin/kurt"

kurt tui
kurt chat "Summarize this repository"
```

### npm

An npm package is not published yet. Users do not need an npm account to install
a public package, but publishing one requires an npm account with access to the
package name. The unscoped `kurt` package name is already taken on npm, so the
practical route is a scoped package such as `@lucienxxxxxx/kurt`.

## Quick Start: macOS App

The desktop app has its own dependency graph and lockfile by design:

```bash
cd packages/kurt-app
bun install
bun run tauri dev
```

For a release build:

```bash
cd packages/kurt-app
bun run build:mac
```

The release build compiles `packages/kurt-bridge` into a bundled sidecar binary
and packages it with the Tauri app. The app can still be pointed at a custom
bridge binary with `KURT_BRIDGE_BIN`, or at bridge source with
`KURT_BRIDGE_ENTRY` during development.

Build outputs are written under:

```text
packages/kurt-app/src-tauri/target/release/bundle/
```

## Development

Run gates in each touched package:

```bash
cd packages/kurt-agent  && bun run typecheck && bun test
cd packages/kurt-tui    && bun run typecheck && bun test
cd packages/kurt-bridge && bun run typecheck && bun test
cd packages/kurt-app    && bun run build && bun run test
cd packages/kurt-app/src-tauri && cargo check
```

Useful desktop packaging commands:

```bash
cd packages/kurt-app
bun run build:bridge  # compile the kurt-bridge sidecar for this host target
bun run build:mac     # frontend build + sidecar + Tauri bundle
```

Useful CLI packaging command:

```bash
bun run build:cli     # writes dist/kurt-<platform>-<arch>
```

Before changing a package, read its `CLAUDE.md` and `PROJECT_INDEX.md`. Repository
status and roadmap are tracked in [`PROGRESS.md`](./PROGRESS.md).

## Safety Model

Kurt is built to keep risky capabilities explicit:

- File tools are workspace-confined unless access is granted.
- Shell and code tools run under sandbox controls where available.
- Network, host-terminal, external-open, and workspace-external write access are
  approval-gated.
- MCP tools are namespaced and non-read-only calls go through permission checks.
- API keys are read from local config or environment variables and are not
  committed to the repository.

## Status

Kurt is pre-1.0 software. The engine, TUI, bridge, and macOS desktop app are
usable locally; native Anthropic transport, broader platform packaging, and
multi-agent orchestration remain active roadmap items.

See [`PROGRESS.md`](./PROGRESS.md) for the current implementation state and known
debt.
