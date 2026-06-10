# 工作日志 (WORKLOG)

> 每完成一期,在此追加记录:交付物、关键决策、验收结果、踩坑。最新在上。

---

## 简化:去掉 import/export 目录,工作区默认可写 — ✅ (2026-06-10)

**用户要求**:不要再产生 `import/`、`export/` 文件夹;agent 对工作目录默认拥有写权限、无需申请;但敏感 bash 命令仍走用户授权。**文件写入与命令授权两者不相干**。

**改动(全在编排/前端层,引擎未动)**:
- `kurt-tui/src/agent.ts`:`Workspace` 简化为 `{ root }`;`resolveWorkspace` 只 `mkdir` 工作区本身、**不再建 import/export 子目录**;`workspaceEnv` 只注入 `WORKSPACE_DIR`;`systemPrompt` 删除 IMPORT_DIR/EXPORT_DIR 与"路径协议"措辞,改为"WORKSPACE_DIR 全程可写,要写外部先 `request_write_access`"。
- 澄清边界:工作区内写文件**永不弹窗**(沙盒直接放行 `WORKSPACE_DIR`);敏感命令(rm/sudo/…)**永远**弹授权。两条独立。
- 文档/措辞同步:`cli.ts` USAGE、`README.md`「Working directory & sandbox」、`PROJECT_INDEX.md`、`shell.ts`/`code.ts` 注释、`classify.test.ts` fixture(`$EXPORT_DIR`→`$WORKSPACE_DIR`)。
- 历史教训延续:之前误删用户在 `export/` 的文件,现在干脆不造这些目录——但凡 agent 工作区里的用户/产物文件,绝不自动删。

**验收**:kurt-agent **48** / kurt-tui **37** 通过;typecheck 干净;`git diff main -- packages/kurt-agent/src/engine` 为空(铁律 #3 成立)。

---

## 修复:大文件写入失败(tool 参数被截断)— ✅ (2026-06-10)

**现象**:让 agent 写一个大 HTML(PPT)时,`write_file` 报 `Invalid input: "path" must be a non-empty string`,看似参数 bug。

**根因**:模型把整份 HTML 放进 tool-call 的 `content` 参数,**`max_tokens`(默认 4096)在 JSON 参数中途截断** → `JSON.parse` 失败 → `parseArgs` 把残串塞进 `{_raw}` → `write_file` 拿不到 `path`。

**修复**:① 默认 `max_tokens` 4096→**8192**,且可配(`DEEPSEEK_MAX_TOKENS`/env/config,经 `resolveSettings.maxTokens` 注入)。② provider 解析失败时打 `MALFORMED_ARGS` 标记(并在 `finish_reason==="length"` 时标 `truncated`)。③ `write_file`/`shell`/`run_code` 检测到该标记 → 返回**清晰可操作**的错误("参数非法 JSON,常因输出 token 上限被截断;请调高 DEEPSEEK_MAX_TOKENS 或分多次写")。新增 `src/tool-args.ts`。

**验收**:kurt-agent 48 / kurt-tui 37 通过(含 provider 截断标记、write_file 清晰报错、maxTokens 优先级)。

---

## 超时 + 实时输出 + 中断修复 — ✅ (2026-06-10)

**起因(用户反馈)**:跑 `npm install` 时按 Esc 无反应、且固定 30s 超时会砍掉长命令。

- **中断修复(fix)**:旧代码只 SIGKILL bash 父进程,子进程(npm)存活并撑着管道 → `runProcess` 卡在读流 → 工具不返回 → UI 假死。现改为**子进程独立进程组启动(`detached`)+ 杀整组(`process.kill(-pid)`)**,管道关闭、立即返回。回归测试:后台子进程不再拖住 abort(<2s)。
- **超时模型(用户选:空闲+硬上限)**:`runProcess` 改为**空闲超时(默认 90s 无输出即杀)+ 硬上限(默认 10min)**;有输出的长命令不被砍。`SandboxResult.timeoutReason` 区分 idle/cap。`shell`/`run_code` 增加每命令 `timeout`(秒)入参抬高硬上限。
- **实时输出(用户选:+实时输出)**:引擎加 `tool_output` 事件 + `ToolContext.toolCallId`;`run-process` 的 `onOutput` 流式回调 → 工具 `ctx.emit({type:"tool_output",id,text})`;TUI 在工具卡片实时显示输出尾部(`⠿` 运行中标记),结束后显示最终结果。chat(stdout)忽略 `tool_output` 以免重复打印。
- **running 指示**:TUI 输入行运行时显示 `⠙ running 12s · press Esc to interrupt`(每秒 ticker)。
- 验收:kurt-agent **46** / kurt-tui **36** 通过;探针确认流式 3 段、idle 杀安静命令、活跃命令不被误杀、abort 即时。

---

## 第N期 · 权限 + 沙盒工作路径 — ✅ 完成

**Step 2b:沙盒写权限提权 — ✅ (2026-06-09)**
- 用户反馈:执行任务时 agent 无法发起授权去写工作区外(如 ~/Downloads)——之前只做了命令分类,漏了"沙盒提权"。
- 新增 `RequestWriteAccessTool`(`request_write_access`):走同一 `PermissionProvider`,批准后把目录推入 `makeTools` 里**共享可变的 writable-roots 数组**;`write_file`/`shell`/`run_code` 都在执行时实时读取该数组,于是后续写入该目录即生效。`WriteFileTool` 改为执行时解析 roots(拾取新授权),拒绝信息提示用 `request_write_access`;三个工具描述与 system prompt 都加了提示。
- 验收:kurt-agent 42 / kurt-tui 35;端到端探针:写工作区外被拒→`request_write_access`→批准→`write_file` 与 `shell` 都能写入该目录。

**Step 2:命令权限/授权系统 — ✅ (2026-06-09)**
- `kurt-agent`:`src/permission/`(`PermissionProvider` 接口 + `classifyCommand` 纯规则:rm/sudo/disk/pipe-to-shell/power/chmod/kill/git-destruct/fork-bomb,各带 key+解释+风险 + allowAll/denyAll);`ShellTool` 加可选 `permission`,敏感命令先分类→请求授权(deny=不执行返回干净错误;安全命令不拦截)。tool 层,引擎未动;`lib.ts` 导出。
- `kurt-tui`:`allowlist.ts`(项目本地 `<ws>/.kurt/allowlist.json`,按 rule key);`tui/permission.ts` `PermissionBridge`(把工具 loop 内的 `request()` 桥接到 TUI 提示,`useSyncExternalStore`;"always"→写 allowlist 并以后自动放行);`tui/approval.tsx` 黄框提示(命令/解释/风险 + [y]/[a]/[n]);App 在 pending 时拦截按键并渲染提示;stdout chat 用 stdin 提示;`--yes`/`-y` 自动放行。
- 验收:kurt-agent 40 / kurt-tui 35 测试;端到端探针:`rm` 触发提示→deny 不执行、always 执行并写入 allowlist、之后自动放行。
- **踩坑(教训)**:`resolveWorkspace` 默认在 cwd 建 `import/`/`export/`;助手在 repo 内误把一个用户在 `export/` 生成的文件当"残留"`rm` 掉(不可恢复)。已将 `import/`/`export/` 加入 `.gitignore` 并明确这些是运行时用户数据、绝不自动删除。

**Step 1:沙盒工作路径 — ✅ (2026-06-09)**

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
