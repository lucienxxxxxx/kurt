# PROJECT_INDEX — kurt-agent

> Cached architecture map. **Read this first**; scan the tree only for the files
> this map points you to. Keep it fresh: update on every structural change.
> Maintained via the `project-module-workflow` skill (see CLAUDE.md §3).
> Last synced: 2026-06-09, after extracting the TUI to sibling **kurt-tui** and
> landing engine thinking/usage events + manual compaction.

## 1. Overview
A protocol-agnostic, **zero-I/O** AI agent engine (a **library**) in TypeScript on Bun.
An inner loop drives `model → tools → model → …` and emits an event stream; all side
effects live behind injected interfaces. Lives in the **`kurt/` bun-workspace monorepo**
alongside sibling **`kurt-tui`** (the Ink terminal front-end, its own git repo, depends
on this package). Public API is `src/lib.ts`.

## 2. Stack & commands
- Language / runtime: TypeScript on **Bun**. Engine core has **no runtime deps** (UI deps live in kurt-tui).
- Install: `bun install` **at the workspace root `kurt/`** (lockfile owned there).
- Per-package: `bun test` · `bun run typecheck` (`tsc --noEmit`).
- Run demos: `bun run dev` · `bun run demo:abort` · `bun run demo:error` · `bun run demo:sandbox`
- Live chat (stdout) vs a real LLM: `bun run chat ["prompt"]` (needs `DEEPSEEK_API_KEY`).
- Public API for consumers (kurt-tui): `src/lib.ts` (re-exports engine/providers/tools/sandbox/session/search + history/compaction/stdout).
- Gate before any merge: **`bun run typecheck && bun test`** (currently 33 tests pass, all offline).

## 3. Architecture & invariants
Three layers, three iron rules (full text in `CLAUDE.md` §2 — do not break them):
1. **Engine zero I/O** — `src/engine/` touches no fs/net/console/process.
2. **Protocol-agnostic** — engine doesn't know its consumer; modes only map events↔commands.
3. **Add shells, don't change the core** — new capability = injected impl or outer
   orchestration, never an engine edit. Verify with `git diff main -- src/engine src/modes`.

Event contract (locked by `src/engine/loop.test.ts`):
`turn_start → llm_delta* → (tool_call, tool_result)* → turn_end`, repeated per loop;
abnormal end = `aborted`/`error`. Also display-only `thinking` + `usage` events
(forwarded from provider reasoning/usage). Invariant: every `tool_call` is paired with
exactly one `tool_result` (even on abort/throw); a throwing tool → `tool_result(isError)`
and the loop continues.

## 4. Module map
| Path | Responsibility | Key exports / entry points | Depends on |
|------|----------------|----------------------------|------------|
| `src/engine/` | The core loop + contracts. **Zero I/O.** | `runLoop` (`loop.ts`); types `Event`/`Message`; ifaces `Tool`/`ModelProvider`/`CompactionPolicy`; `AsyncEventQueue` | — (pure) |
| `src/engine/loop.ts` | Agentic loop; pairs tool_call/result; abort handling | `runLoop`, `RunLoopOptions` | types, tool, model, compaction, async-queue |
| `src/engine/async-queue.ts` | Single-consumer channel powering `ToolContext.emit` | `AsyncEventQueue` | — |
| `src/providers/` | `ModelProvider` impls | `MockModel` (scripted, no deps); `OpenAICompatModel` (DeepSeek/OpenAI Chat Completions over SSE, key injected) | engine types |
| `src/tools/` | `Tool` impls — **all side effects live here** | `ReadFileTool`, `WriteFileTool`, `ShellTool`, `CodeTool`, `WebSearchTool` | engine, sandbox, session, search |
| `src/sandbox/` | Subprocess isolation behind `SandboxProvider` | `SeatbeltSandbox`, `DirectSandbox`, `buildProfile`; `run-process.ts` (spawn+timeout+cap+abort) | — |
| `src/session/` | Per-session scratch dir lifecycle | `SessionWorkspace` (`.root`, `.dir()`, `.dispose()`) | — |
| `src/search/` | Pluggable web-search backend | `SearchProvider`, `DuckDuckGoSearch` | — |
| `src/modes/` | Modal layer + reusable orchestration helpers | `runStdoutMode` (`stdout.ts`); `messagesFromEvents` (`history.ts`); `compactHistory`/`compactionSplit`/`serializeForSummary` (`compaction.ts`, cuts only at user boundaries → preserves tool pairing) | engine types |
| `src/lib.ts` | **Public API barrel** (what kurt-tui imports via `"kurt-agent"`) | re-exports the above | all |
| `src/demos/` | Runnable scenarios | `abort.ts`, `error.ts`, `sandbox.ts` | everything |
| `src/index.ts` | Composition root (happy-path demo, `bun run dev`) | — | everything |
| `src/chat.ts` | Composition root: live stdout REPL/one-shot vs a real LLM + sandboxed tools | `bun run chat` | lib surface |

## 5. Navigation — "to do X, look at Y"
- **Add a tool** → create `src/tools/<name>.ts` implementing `Tool` (mirror `shell.ts`); export from `src/tools/index.ts`. Side effects go here, never in engine.
- **Add a model vendor** → `src/providers/<vendor>.ts` implementing `ModelProvider`; digest wire/stream/token differences inside it. Reference impl: `openai-compat.ts` (any OpenAI-compatible endpoint). Auth/keys stay in the composition root (e.g. `chat.ts`), never in the engine.
- **Add a sandbox backend** → `src/sandbox/<name>.ts` implementing `SandboxProvider`; only `seatbelt.ts` may reference `sandbox-exec`.
- **Front-end / TUI** → lives in the **sibling `kurt-tui`** package (Ink), which consumes this lib. A minimal in-repo mode lives at `src/modes/stdout.ts` (clone its shape for new built-in modes).
- **Compaction** (Phase 3) → implement `CompactionPolicy`; the seam is already wired in `loop.ts` (engine decides *when* via `thresholdTokens`, policy decides *how* via `compact`).
- **Sub-agents** (Phase 7) → a `SubAgentTool` that runs its own `runLoop` and bubbles events via `ToolContext.emit`; no engine change.
- **Tests** live next to code as `*.test.ts` (`src/engine/loop.test.ts`, `src/sandbox/seatbelt.test.ts`, `src/tools/tools.test.ts`). Run all: `bun test`.

## 6. Conventions
- **Side effects only in tools / sandbox / session / search**, never in `src/engine/` or `src/modes/`.
- Each package has an `index.ts` barrel; import across packages via the barrel.
- Imports use explicit `.ts` extensions (tsconfig `allowImportingTsExtensions`).
- Private class fields use `#name`. Strict TS (`noUnusedLocals`, `noUncheckedIndexedAccess`, etc.).
- **Git/workflow:** per-module commits on `feat/…` (or `fix/…`) branches; gate green before merge; integrate via rebase → ff-merge; commit trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. See CLAUDE.md §3.
- Docs: `CLAUDE.md` = rules + roadmap; `WORKLOG.md` = per-phase log; **this file** = architecture map.

## 7. Status / roadmap
- **Done:** Phase 1 (minimal closed loop), Phase 2 (real tools + sandbox).
- **In progress:** Phase 4 — `OpenAICompatModel` live-verified vs DeepSeek; engine gained thinking/usage events. Phase 3 — manual compaction core landed (`compactHistory`). Phase 6 — TUI shipped as sibling **kurt-tui**.
- **Remaining:** Phase 3 (preload + Memory.md + auto-compaction) · Phase 4 (more vendors + AuthProvider) · Phase 5 (Skills + MCP) · more Phase-6 frontends · Phase 7 (multi-agent).
- Full roadmap + per-phase constraints: `CLAUDE.md` §4 and §8.
