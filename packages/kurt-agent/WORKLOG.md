# 工作日志 (WORKLOG)

> 每完成一期,在此追加记录:交付物、关键决策、验收结果、踩坑。最新在上。

---

## 第N期 · 权限 + 沙盒工作路径 — 🚧 进行中

**Step 1:沙盒工作路径 — ✅ (2026-06-09)**
- 决策(用户确认):WORKSPACE/IMPORT/EXPORT 为工作区子目录;`--workspace`/`--workplace` 设工作路径(默认 cwd);白名单走项目本地 `.kurt/`(Step 2);分两步推进。
- 交付:`kurt-agent` 的 `ShellTool`/`CodeTool` 增加 `env` + `writablePaths` 选项(additive,引擎未动);`kurt-tui` 的 `agent.ts` 加 `resolveWorkspace`/`workspaceEnv`/`systemPrompt(ws)`/`parseLaunchFlags`,`makeTools` 改为 `(sandbox, codeTemp, ws, allowWrite)`;`cli.ts` 解析 `--workspace`/`--workplace`/`--allow-write`;run-tui/run-chat 接 LaunchOptions。
- 行为:agent 默认在工作路径(可写),`WORKSPACE_DIR/IMPORT_DIR/EXPORT_DIR` 注入 system prompt + 子进程 env;沙盒只允许写工作区(+ allowWrite),其余被拒。"路径协议优先于路径发现"写进 system prompt。
- 验收:kurt-agent 34 / kurt-tui 30 测试通过;端到端探针确认 `$EXPORT_DIR` 可写、工作区外写入被沙盒拒绝。
- **Step 2(待做):命令权限/授权系统**(rm/sudo/提权等需授权,accept/reject/always-allow→项目本地 `.kurt/allowlist.json`,提示带解释+风险)。

---

## 拆分:TUI → 兄弟项目 kurt-tui(monorepo)— ✅ (2026-06-09)

**动机**:TUI 是引擎的前端消费者(铁律 #2),与引擎核心解耦。用户要求把 TUI 独立成与 kurt-agent 平级的项目 `kurt-tui`。

**结果**
- 新建 bun workspace monorepo:`myProjects/kurt/`(根 `package.json` 含 `workspaces`),下辖 `kurt-agent`(本包,移动至此)与 `kurt-tui`(Ink 前端,独立 git 仓库,`"kurt-agent": "workspace:*"`)。
- kurt-agent **暴露 public API `src/lib.ts`**(re-export engine/providers/tools/sandbox/session/search + history/compaction/stdout);`package.json` 加 `exports`。
- TUI 全部代码移入 kurt-tui;kurt-agent 去掉 ink/react/marked 等 UI 依赖 → **引擎核心恢复零运行时依赖**。
- 引擎侧改动(thinking/usage 事件、provider reasoning/usage、history helper、手动 compaction)**保留在 kurt-agent main**(从 feat/tui cherry-pick 4 个提交;TUI 提交未并入,随 feat/tui 删除,在 kurt-tui 新仓库重生)。
- lockfile 由 workspace 根持有;成员 `.gitignore` 忽略 `bun.lock`。

**验收**:`kurt/` 根 `bun install` 链接成功;kurt-agent typecheck 干净 + `bun test` **33 pass**;kurt-tui typecheck 干净 + **21 pass**(跨包 `import … from "kurt-agent"` 在 tsc 与运行时均解析正常)。

**踩坑/决策**:monorepo + 成员各自独立 git 仓库本有张力 —— 取舍为:`kurt/` 根(workspace 配置 + lockfile)**不纳入 git**(本地开发文件),kurt-agent / kurt-tui 各自独立仓库。若日后要可单独克隆 kurt-tui,需把 `workspace:*` 换成 `file:` 或把根也纳入版本管理。

---

## 第四期(起步):多厂家模型 — 🚧 进行中 (2026-06-09)

**背景**:用户提供 DeepSeek 测试账号(OpenAI 兼容,`https://api.deepseek.com`),要真机测试。此前只有 `MockModel`,遂落地第一个真实 `ModelProvider`。走 `project-module-workflow` skill:`feat/openai-provider` 分支 → 门禁绿 → 用户真机验证"可以使用" → rebase→ff-merge→删分支→刷新索引。

**交付物**
- `src/providers/openai-compat.ts`:`OpenAICompatModel`,讲 OpenAI Chat Completions(DeepSeek 兼容)。SSE 流式文本 deltas、把流式分块的 tool-call 参数拼回完整 `tool_use`、token 估算(~4 char/tok)、HTTP 错误透传。**厂商差异全封在此文件,引擎只见归一化事件**(铁律 #2)。
- `src/chat.ts`:真机测试编排根。`bun run chat [prompt]`(交互 REPL / one-shot)。拼 `OpenAICompatModel` + 5 工具(read/write/shell/code/web_search,均沙盒)+ stdout 模态。key 从 env(`DEEPSEEK_API_KEY` 等)读,编排层持有(铁律 #1)。多轮历史从事件流重建,引擎零改动。
- `src/providers/index.ts`(barrel)、`src/providers/openai-compat.test.ts`(离线:注入 fake fetch 测翻译 + SSE 解析,含工具调用累积与 401 错误)。

**关键决策 / 踩坑**
- provider 命名为通用 `OpenAICompatModel`(非 `DeepSeekModel`):DeepSeek 只是配置(baseURL+model+key),OpenAI/Together/本地服务器同一类复用。
- key 永不进引擎、永不硬编码、不向 AI 索要 —— 走环境变量。
- 离线门禁:`fetchImpl` 可注入(类型用宽松的 `FetchLike`,避开 Bun `typeof fetch` 的 `preconnect` 约束),测试不联网;真机由用户自带 key 跑。
- 模型名 `deepseek-v4-flash/pro` 由用户给定,做成 `DEEPSEEK_MODEL` 可配置,错了改 env 即可。

**验收结果**:`bun run typecheck` 干净;`bun test` **28 pass / 0 fail**(全离线)。引擎/模态零改动(`git diff` 验证)。用户真机 `bun run chat` 对 DeepSeek **验证可用**。

**后续(第四期剩余)**:更多厂家(Anthropic/本地)、`AuthProvider` 登录授权。

---

## 第二期:真实工具 + 沙盒 — ✅ 完成 (2026-06-09)

**目标**:四个有副作用的工具落地,沙盒封在 provider 后面,引擎层/模态层一行不动。

**交付物**
- [x] `src/sandbox/`:`SandboxProvider` 接口 + `run-process.ts`(共享 spawn+超时SIGKILL+输出截断+abort)+ `SeatbeltSandbox`(`sandbox-exec`,deny-default SBPL profile)+ `DirectSandbox`(裸执行)。
- [x] `src/session/workspace.ts`:`SessionWorkspace`,会话私有临时目录,`dispose()` 清理(支持 `using`)。
- [x] 工具:`WriteFileTool`(直接 I/O + 路径越界拦截)、`ShellTool`(过沙盒,prompt 鼓励管道)、`CodeTool`(脚本写会话临时目录跑,过沙盒,跑完删脚本)、`WebSearchTool`(可插拔 `SearchProvider`,`DuckDuckGoSearch` 无 key)。
- [x] `.sb` profile 生成器:临时目录可写,其余只读,网络按工具区分。
- [x] 测试 `seatbelt.test.ts` + `tools.test.ts`;演示 `demos/sandbox.ts`(`bun run demo:sandbox`)。

**环境探针(开工前)**:`/usr/bin/sandbox-exec` 存在;deny-default profile 下 `echo` 可跑、对非授权路径 `touch` 被拒(exit≠0)→ Seatbelt 可真实验证。

**关键决策 / 踩坑**
- `sandbox-exec` 只封在 `seatbelt.ts` 一处;别处零引用(grep 验证)。换 Firecracker/gVisor/docker 只改这一类。
- **踩坑(macOS 符号链接)**:Seatbelt 按规范化(real)路径匹配,而 `/var→/private/var`、`/tmp→/private/tmp`。会话临时目录在 `/var/folders/...`,直接用原路径授权写会被拒。解决:`SeatbeltSandbox` 用 `realpathSync` 把 writablePaths 解析后(原路径+real 路径都写进 profile)。
- 子进程工具统一走 `run-process.ts`:超时 SIGKILL、按字节增量读取并在超限处截断+杀进程(防刷屏)、外部 abort 抛 AbortError(超时不算错,返回 `timedOut:true`)。
- 网络按工具区分:shell/code 的 sandbox policy 默认 `allowNetwork:false`;`WebSearchTool` 走进程内 fetch(唯一联网路径),后端可换可 mock。
- code 工具脚本写 `workspace.dir("code")`,跑完单独删,会话结束 `workspace.dispose()` 整体清。

**验收结果**
- `bun run typecheck` 干净;`bun test` **22 pass / 0 fail**(含真实 Seatbelt:授权写通过、越权写被拒、网络被拒、超时、截断)。
- **换实现零改动**:同一 `runLoop` 同时驱动 `ShellTool` over `DirectSandbox` 与 `SeatbeltSandbox`,两条都过(`tools.test.ts`)。
- **引擎/模态零改动**:`git diff main -- src/engine src/modes` 为空 → 铁律 #3 成立。
- demo 实跑:shell 管道、Python、写文件(允许)、越权写(被沙盒拒)、会话目录清理,全程引擎/模态未动。

---

## 第一期:最小闭环(承重墙) — ✅ 完成 (2026-06-09)

**交付物**
- `src/engine/`:`types.ts`(归一化消息 + Event 流)、`tool.ts`/`model.ts`/`compaction.ts`(三接口定稿)、`async-queue.ts`(单消费者通道,支撑 `ToolContext.emit`)、`loop.ts`(`runLoop`)、`index.ts`(公共面)。
- `providers/mock-model.ts`(脚本化、零依赖)、`tools/read-file.ts`(真 I/O 无沙盒,用 `Bun.file`)、`modes/stdout.ts`(`runMode` 模板)。
- demos:`index.ts`(happy path)、`demos/abort.ts`、`demos/error.ts`。
- 测试:`src/engine/loop.test.ts`(6 用例 33 断言)。

**关键决策**
- 消息归一化为中立表示(`user`/`assistant`/`tool` + 内容块),各厂家 wire 格式差异留给 Phase 4 的 provider 翻译,引擎不感知。
- 引擎用 `AsyncEventQueue` 单消费者通道,让工具能通过 `ToolContext.emit` 把事件按序注入引擎流 —— 这是 Phase 7 子 Agent 事件冒泡的预留缝。
- 压缩职责切分:`CompactionPolicy` 暴露 `thresholdTokens`(何时,引擎判断)+ `compact()`(如何,策略决定),seam 已接好但不实现真摘要。
- 配对不变式:每个 `tool_call` 恒配对一个 `tool_result`(含 abort / 报错路径),保证 tool_use/tool_result 历史永不断裂。

**验收结果**:`bun run typecheck` 干净;`bun test` 6 pass / 0 fail;三个 demo 输出符合预期(完整有序事件流 / 干净中断无悬挂 / 工具报错后恢复)。
