# PROJECT_INDEX — kurt-bridge

> Cached architecture map. Read this first. Keep fresh on structural change.
> Last synced: 2026-06-29, after desktop projects/skills UI support (`/sessions` returns workspace; `/skills` scans local skill dirs and injects the `skill` tool/catalog).

## 1. Overview
Local HTTP/SSE bridge (Bun) that runs the kurt engine for GUI front-ends — the
desktop app (`kurt-app`) spawns it as a sidecar. It folds the engine `Event` stream
into the desktop's `Step` shape and serves runs + sessions over `127.0.0.1`. A
consumer of `kurt-agent` (铁律 #2), no engine logic of its own. `packages/kurt-bridge`.

## 2. Stack & commands
- TypeScript on **Bun**; bun-workspace member; depends on `kurt-agent` (workspace).
- `bun run start` (env: KURT_WORKSPACE, KURT_BRIDGE_PORT, DEEPSEEK_API_KEY/_BASE_URL/_MODEL).
- Desktop packaging compiles this entry from `packages/kurt-app` via `bun run build:bridge`.
- **Gate** = `bun run typecheck && bun test` (50 tests: pure mapper + real HTTP/SSE integration with MockModel).

## 3. Architecture
```
kurt-app (Tauri webview) ──fetch/SSE──▶ 127.0.0.1:<port>  (this pkg)
                                          server.ts (Bun.serve)
                                            POST /run → runTurn → runLoop(kurt-agent)
                                              Event stream ──StepAccumulator──▶ RunFrame (SSE)
                                            GET/POST/DELETE /sessions → SessionStore (kurt-agent, ~/.kurt/sessions)
                                            GET /skills → local skill discovery + SkillTool catalog
```
- The wire contract (`types.ts`) is mirrored by `kurt-app` (HTTP boundary, not a TS import).
- `step` frames are full snapshots per `_id`; client upserts by `_id`.

## 4. Module map
| Path | Responsibility | Key exports |
|------|----------------|-------------|
| `src/types.ts` | Wire contract: `Step` union, `RunFrame` (session/step/usage/done/aborted/error), `SessionInfo` (incl. workspace for desktop project grouping), `SkillInfo` | (types) |
| `src/events.ts` | **StepAccumulator** — pure fold of engine `Event` → desktop `Step` (read_file→read, skill→skill, else→tool; thinking elapsed-seconds); `planFromInput` (update_plan input → `PlanStep[]` for the `plan` frame) | `StepAccumulator`, `planFromInput` |
| `src/runtime.ts` | Engine composition: `createRuntime` (generic, injectable model/tools/**makeTitle**/**loadSkills** — testable) + `productionRuntime` (DeepSeek + core tools + sandbox + shared SessionStore + auto-title model call + local skill discovery); `runTurn` (load/create session → stream events as frames → persist; appends per-workspace `# Skills` catalog + fresh **`# Environment`** block; a **new** session gets an immediate temp title and is saved right away so it lists in the sidebar mid-run, then `rt.makeTitle` replaces it with an auto-summary after the turn) | `createRuntime`, `productionRuntime`, `runTurn`, `Runtime` |
| `src/server.ts` | `Bun.serve` on localhost (`idleTimeout:0`): `POST /run` (SSE), `POST /approve`, `GET/POST /config`, `GET /info`, **`GET /fs` / `/file` / `/raw`**, **`GET /skills` / `/skills/:name`**, `GET /sessions` (incl. workspace), `GET /sessions/:id`, `POST /sessions/:id/truncate`, `POST /answer`, `POST/DELETE /sessions`, `/health`; client-close aborts the run. **SSE keep-alive `: ping` heartbeat** + graceful error frame | `startServer`, `ServerHandle` |
| `src/fs.ts` | Workspace file access for the desktop (Files tab + preview), confined to `rt.workspace` (path-escape rejected): `listDir`, `readTextFile`, `resolveInWorkspace`, `contentType` | (helpers) |
| `src/skills.ts` | Local skill discovery for desktop bridge: scans `~/.kurt/skills`, `<workspace>/.kurt/skills`, `~/.codex/skills`, Codex plugin cache, `~/.agents/skills`, `~/.claude/skills`, plus `KURT_SKILL_PATHS`; parses frontmatter, disambiguates duplicate names, returns `SkillProvider` + app `SkillInfo[]` | `loadSkills`, `parseSkill` |
| `src/providers.ts` | **Multi-provider model config** (openai/claude/deepseek built-ins + custom, each with an enable toggle): `DesktopConfig`/`ProviderConfig`, `normalizeConfig` (legacy + env migration), `resolveModel` (id→provider), `allModels`/`providerGroups`/`defaultModel`, `mergeConfig`. `runTime` routes a model id to its provider's client | (pure helpers) |
| `src/index.ts` | Bin the Tauri sidecar spawns or compiles; prints `KURT_BRIDGE_PORT=<n>` to stdout; when stdin is piped (sidecar) exits on EOF (parent died → no orphan); **global uncaughtException/unhandledRejection guards keep the process alive** | — |
| `src/*.test.ts` | `events.test.ts` (pure) · `server.test.ts` (real HTTP/SSE + MockModel + fake tool; truncate/modes/config/info) · `fs.test.ts` (workspace listing/read/escape-guard) — 33 total | — |

## 5. Navigation — "to do X, look at Y"
- **Change the wire shape** → `types.ts` (and mirror in `kurt-app/src/types.ts`).
- **Map a new engine event / tool to a step** → `events.ts` (`StepAccumulator`).
- **Add an endpoint / change run semantics** → `server.ts` / `runtime.ts` (`runTurn`).
- **Change which tools/model the bridge uses** → `runtime.ts` `productionRuntime`.
- **Change skill discovery** → `skills.ts`; keep it behind `Runtime.loadSkills` so engine remains I/O-free.

## 6. Status / debt
- **6.2/6.3/6.4a/6.4b done** — `kurt-app` drives it live (auto-spawned sidecar; no orphan); reload reconstructs steps; **sensitive commands gated** via per-run permission → `approval` frame → `POST /approve` (the safety gap is closed).
- **ask_user wired (6.4)**: per-run `AskProvider` → `ask` frame → `POST /answer` (mirrors approval); ask_user is in every mode.
- **Desktop skills wired**: local skill dirs are discoverable through `/skills`, injected into the run prompt catalog, and callable through `SkillTool` in every mode.
- Remaining: MCP / memory-preload not yet in the bridge's tool set; auth = env/desktop config (Keychain later); signing/notarization is distribution-specific.
