# PROJECT_INDEX — kurt-bridge

> Cached architecture map. Read this first. Keep fresh on structural change.
> Last synced: 2026-06-15, after Phase 6.2 (HTTP/SSE bridge complete).

## 1. Overview
Local HTTP/SSE bridge (Bun) that runs the kurt engine for GUI front-ends — the
desktop app (`kurt-app`) spawns it as a sidecar. It folds the engine `Event` stream
into the desktop's `Step` shape and serves runs + sessions over `127.0.0.1`. A
consumer of `kurt-agent` (铁律 #2), no engine logic of its own. `packages/kurt-bridge`.

## 2. Stack & commands
- TypeScript on **Bun**; bun-workspace member; depends on `kurt-agent` (workspace).
- `bun run start` (env: KURT_WORKSPACE, KURT_BRIDGE_PORT, DEEPSEEK_API_KEY/_BASE_URL/_MODEL).
- **Gate** = `bun run typecheck && bun test` (13 tests: pure mapper + real HTTP/SSE integration with MockModel).

## 3. Architecture
```
kurt-app (Tauri webview) ──fetch/SSE──▶ 127.0.0.1:<port>  (this pkg)
                                          server.ts (Bun.serve)
                                            POST /run → runTurn → runLoop(kurt-agent)
                                              Event stream ──StepAccumulator──▶ RunFrame (SSE)
                                            GET/POST/DELETE /sessions → SessionStore (kurt-agent, ~/.kurt/sessions)
```
- The wire contract (`types.ts`) is mirrored by `kurt-app` (HTTP boundary, not a TS import).
- `step` frames are full snapshots per `_id`; client upserts by `_id`.

## 4. Module map
| Path | Responsibility | Key exports |
|------|----------------|-------------|
| `src/types.ts` | Wire contract: `Step` union, `RunFrame` (session/step/usage/done/aborted/error), `SessionInfo` | (types) |
| `src/events.ts` | **StepAccumulator** — pure fold of engine `Event` → desktop `Step` (read_file→read, skill→skill, else→tool; thinking elapsed-seconds) | `StepAccumulator` |
| `src/runtime.ts` | Engine composition: `createRuntime` (generic, injectable model/tools — testable) + `productionRuntime` (DeepSeek + core tools + sandbox + shared SessionStore); `runTurn` (load/create session → stream events as frames → persist) | `createRuntime`, `productionRuntime`, `runTurn`, `Runtime` |
| `src/server.ts` | `Bun.serve` on localhost: `POST /run` (SSE), `POST /approve` (answer an approval), `GET /sessions` (this workspace), `GET /sessions/:id` (→ reconstructed steps), `POST/DELETE /sessions`, `/health`; client-close aborts the run | `startServer`, `ServerHandle` |
| `src/index.ts` | Bin the Tauri sidecar spawns; prints `KURT_BRIDGE_PORT=<n>` to stdout; when stdin is piped (sidecar) exits on EOF (parent died → no orphan) | — |
| `src/*.test.ts` | `events.test.ts` (8, pure) · `server.test.ts` (5, real HTTP/SSE + MockModel + fake tool) | — |

## 5. Navigation — "to do X, look at Y"
- **Change the wire shape** → `types.ts` (and mirror in `kurt-app/src/types.ts`).
- **Map a new engine event / tool to a step** → `events.ts` (`StepAccumulator`).
- **Add an endpoint / change run semantics** → `server.ts` / `runtime.ts` (`runTurn`).
- **Change which tools/model the bridge uses** → `runtime.ts` `productionRuntime`.

## 6. Status / debt
- **6.2/6.3/6.4a/6.4b done** — `kurt-app` drives it live (auto-spawned sidecar; no orphan); reload reconstructs steps; **sensitive commands gated** via per-run permission → `approval` frame → `POST /approve` (the safety gap is closed).
- Remaining: per-run model/effort config (menus still cosmetic); MCP / skills / ask_user / memory-preload not yet in the bridge's tool set; auth = env (Keychain in 6.4c); compiled sidecar + signing (6.4d).
