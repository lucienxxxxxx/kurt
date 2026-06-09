# kurt-agent

A protocol-agnostic, zero-I/O AI agent engine, built in TypeScript on [Bun](https://bun.sh).

This repo is being built in phases (see [`WORKLOG.md`](./WORKLOG.md) for progress,
[`CLAUDE.md`](./CLAUDE.md) for the rules):

- **Phase 1 ✅ — minimal closed loop.** The full `model → tool → model → end` event
  flow with no API key and no sandbox; validates the three-layer contracts.
- **Phase 2 ✅ — real tools + sandbox.** Four side-effecting tools (read/write
  file, shell, code execution, web search) with subprocess isolation sealed behind
  a `SandboxProvider` (macOS Seatbelt), plus a per-session temp dir. The engine and
  modes did not change a line.
- **Phase 4 🚧 — real models.** `OpenAICompatModel` drives the agent against any
  OpenAI-compatible API (live-verified on DeepSeek via `bun run chat`). Remaining:
  more vendors + an auth provider.

## The three iron rules (铁律)

Every design decision is checked against these:

1. **引擎零 I/O — the engine does no I/O.** No files, network, console, or
   processes in `src/engine/`. All side effects live behind the `Tool` interface
   or in the orchestration layer (the composition root).
2. **协议无关 — the engine is protocol-agnostic.** It doesn't know if a TUI or a
   WebSocket is consuming it. A "mode" only does two things: subscribe to events →
   serialize, and listen for input → issue commands.
3. **加壳不改核 — add shells, don't change the core.** New capabilities (memory,
   compaction, MCP, sub-agents, multi-vendor models) are added as *injected
   interface implementations* or *orchestration wrapped around the engine* — never
   by editing the engine.

> After every phase, ask: *to swap the sandbox / swap the LLM vendor / add a new
> mode, would I need to touch `src/engine/`?* The answer must be **no**.

## Layout

```
src/
  engine/            ← the core. Zero I/O. Pure orchestration of injected interfaces.
    types.ts           Message model + the Event stream (the engine's only output).
    tool.ts            Tool / ToolContext / ToolResult        ┐
    model.ts           ModelProvider / ModelStreamEvent       ├ the 3 finalized
    compaction.ts      CompactionPolicy (Phase 3 seam)        ┘ contracts
    async-queue.ts     Single-consumer channel (powers ToolContext.emit).
    loop.ts            runLoop — the agentic loop.
    index.ts           Public surface.
  providers/
    mock-model.ts    ← a scripted ModelProvider, zero external deps.
  tools/             ← Tool implementations (all side effects live here)
    read-file.ts  write-file.ts  shell.ts  code.ts  web-search.ts
  sandbox/           ← SandboxProvider interface + Seatbelt/Direct impls
    types.ts  run-process.ts  seatbelt.ts  direct.ts   (sandbox-exec sealed here)
  session/
    workspace.ts     ← per-session temp dir with cleanup.
  search/            ← pluggable web-search backend (DuckDuckGo, no key).
  modes/
    stdout.ts        ← the reference runMode() template (events → stdout).
  demos/             ← runnable scenarios (abort, error, sandbox).
  index.ts           ← happy-path demo (the composition root).
```

## Run it

```bash
bun install      # only dev type deps; the runtime has no dependencies
bun run dev      # happy path: model → read_file → model → end
bun run demo:abort   # abort() lands mid-stream, clean interrupt
bun run demo:error   # a failing tool → error result → recovery
bun run demo:sandbox # real sandboxed tools; a blocked escape attempt
bun run chat         # live chat against a real LLM (see below)
bun test         # the acceptance suite (offline)
bun run typecheck    # tsc --noEmit
```

## Live test against a real model

`OpenAICompatModel` talks to any OpenAI-compatible Chat Completions endpoint
(DeepSeek, OpenAI, local servers). The key lives only in your environment — never
in the engine or committed anywhere:

```bash
export DEEPSEEK_API_KEY=sk-your-key                  # required
export DEEPSEEK_BASE_URL=https://api.deepseek.com    # optional (default)
export DEEPSEEK_MODEL=deepseek-v4-flash              # optional (default)

bun run chat                      # interactive REPL
bun run chat "read package.json and summarize it"   # one-shot
```

The agent gets `read_file`, `write_file`, `shell`, `run_code`, and `web_search` —
all sandboxed (shell/code are filesystem-read-only except a temp workspace, and
have no network), so letting the model drive the tools is safe. If a model id is
rejected, just change `DEEPSEEK_MODEL`. Errors surface as `✗ error: deepseek HTTP …`.

## Phase 2: the sandbox

Subprocess tools (`shell`, `run_code`) never spawn directly — they go through an
injected `SandboxProvider`:

- **`SeatbeltSandbox`** generates a deny-by-default macOS SBPL profile: read most
  of the FS, write only to the session workspace, network only if the policy
  grants it. `sandbox-exec` is sealed in this one file — nothing else references
  it, so swapping to Firecracker / gVisor / a remote container is a one-class
  change.
- **`DirectSandbox`** runs with no isolation. Swapping a tool between the two
  requires **zero** changes to the engine or modes — proven in
  `src/tools/tools.test.ts`, where the same `runLoop` drives both.

Every subprocess gets a wall-clock timeout (SIGKILL) and output truncation.
Scripts and scratch files live in a `SessionWorkspace` temp dir that is deleted
when the session ends.

## The event contract

A run emits an ordered `AsyncIterable<Event>`. Canonical ordering:

```
turn_start
  llm_delta*                      streamed assistant text
  (tool_call  tool_result)*       every tool_call is ALWAYS paired with a result
turn_end
… repeats per loop iteration until the model stops requesting tools …
```

Abnormal endings emit `aborted` or `error` immediately before the stream completes.

### Guaranteed invariants (Phase 1 acceptance criteria)

- **Ordering** is as above; `turn_start` opens and `turn_end`/`aborted`/`error`
  closes each run.
- **Pairing**: every `tool_call` is followed by exactly one matching
  `tool_result` — even on abort or tool failure. No dangling `tool_call`s, so
  `tool_use`/`tool_result` history never breaks (this is what would otherwise make
  a real LLM error out).
- **Resilience**: a throwing tool becomes `tool_result(isError: true)` and the
  loop continues; it never crashes the engine.

All three are asserted in `src/engine/loop.test.ts`.

## Seams reserved for later phases

- **Phase 3 (compaction):** `CompactionPolicy` is injected; the engine only
  decides *when* to compact (token threshold), never *how*.
- **Phase 7 (sub-agents):** a `Tool` can push events via `ToolContext.emit`, so a
  future `SubAgentTool` runs its own `runLoop` and bubbles child events up — the
  engine stays untouched. Session management is intended to be
  `Map<sessionId, EngineInstance>` from the start.
