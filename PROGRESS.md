# PROGRESS — kurt 项目进度

> **单一"活进度"文档。** 每次有改动落到 `main`,收尾都必须回头更新这里
> (阶段状态 / 功能清单 / 未完成项 / 已知债务 / "最后更新")。开工前先读它对齐现状。
> 路线图的**定义**在 `packages/kurt-agent/CLAUDE.md` §4;这里是它的**实时状态**。

- **最后更新**:2026-06-17 · `main` @ `646b221`(思考开关移入模型菜单:分隔线+「思考」行+苹果风椭圆开关;前置 `aa43f74` 用户消息留白)
- **门禁**:kurt-agent **150** · kurt-tui **70** · kurt-bridge **24** · kurt-app build+**Vitest 48**+cargo ✓ · 全 typecheck 干净(GUI 人工核对 `MANUAL_TESTS §6.3–§6.4`)

---

## 一句话定位

main 处在「**单机 TUI Agent 主线完整可用 + 正在做 macOS 桌面端(Phase 6)**」的阶段:
七期里 1、2、3、**5 全部完成**,4 主线完成;**6 功能完整**(macOS 桌面端 kurt-app:配置 key、选模型/effort、真实流式运行、真实会话列表/重载、敏感命令审批;停在 `tauri dev`,打包暂缓);7 尚未开始。

## 七期路线图状态(main)

| 期 | 内容 | 状态 |
|---|---|---|
| 1 | 最小闭环:runLoop / 事件流 / 三接口 / MockModel / stdout | ✅ 完成 |
| 2 | 真实工具 + 沙盒:Seatbelt/Direct、文件读写/shell/代码/搜索、会话临时目录 | ✅ 完成 |
| 3 | 预加载 + 记忆 + 压缩 | ✅ 完成:预载 ✓ · agent 可写记忆 ✓ · 手动 `/compact` ✓ · **自动压缩 ✓**(`autoCompaction`,超 ~75% 上下文上限自动触发) |
| 4 | 多厂家模型 + 授权 | 🚧 DeepSeek/OpenAI 兼容 ✓ · 能力元数据 ✓ · reasoning 回填 ✓ · **缺:更多厂家 + AuthProvider 登录** |
| 5 | Skills 生命周期 + MCP 接入 | ✅ 完成:**MCP 接入 ✓**(官方 SDK,stdio + Streamable HTTP,远程工具入 ToolHub,审批门控) · **Skills ✓**(渐进披露:预载 description,`skill` 工具按需加载正文) |
| 6 | 多模态前端(WebUI/TUI/桌面/移动) | 🚧 TUI 成熟 · **macOS 桌面端进行中**(`kurt-app`,Tauri v2,见下方子阶段表)· 缺:Windows/WebUI/移动 |
| 7 | 多 Agent(SubAgentTool) | ⬜ main 未开始(雏形见 `feat/beehive`) |

### Phase 6 子阶段进度(桌面端 `packages/kurt-app`,macOS 优先)

> 架构:kurt-app(Tauri v2 + React + Vite + Tailwind + shadcn + Zustand + TanStack Query)= 引擎前端消费者(铁律 #2);
> 经 `kurt-bridge`(Bun,本地 HTTP+SSE)访问 kurt-agent —— 引擎零改动。kurt-app 不是 bun-workspace 成员(自带 deps+lock)。
> v1 范围 = 核心优先(对话+真实流式运行+会话+model/effort+主题+中英文+折叠/暂停/停止/排队);projects/skills 浏览、详情面板等随后。

| 子阶段 | 内容 | 状态 |
|---|---|---|
| 6.0 | 脚手架:Tauri v2 + React + Vite 起架;改名 kurt-app/Kurt;`kurt-app/{CLAUDE,PROJECT_INDEX,MANUAL_TESTS}.md`;Phase 6 进度机制 | ✅ 完成(GUI 开窗人工确认 PASS) |
| 6.1 | 静态 UI 对齐(mock 数据):复用原型 CSS、侧栏/线程5种步骤渲染器/输入区+菜单/设置/详情面板/主题/中英文/假流式;macOS 真原生交通灯叠加(无双框) | ✅ 完成(`bun run build` ✓ · Vitest 11 ✓ · `cargo check` ✓ · 视觉对齐人工核对 `MANUAL_TESTS §6.1`) |
| 6.2 | `packages/kurt-bridge`(Bun):`Event`→`Step` over HTTP/SSE、会话 CRUD、集成测试 | ✅ 完成(`StepAccumulator` + Bun.serve `POST /run`(SSE)/sessions;`SessionStore` 上提到 kurt-agent 共享;13 测试,含真实 HTTP/SSE+MockModel 往返) |
| 6.3 | app↔bridge 接通 | ✅ 完成:前端 `lib/bridge.ts`(SSE 客户端)+ `App` 真实流式(替换假流式、step _id 重映射、stop/queue/多轮)+ **Tauri 自动 spawn bridge sidecar**(读端口、stdin-EOF 防孤儿)+ `bridge_url` 命令。门禁绿;真实运行需 GUI 人工核对。(注:未引入 Zustand/TanStack Query —— 现用 useState + fetch 已足够,保留为后续可选重构;sidebar recents 仍是 mock demos,真实会话列表/重载留待后续) |
| 6.4a | 真实会话列表/重载:sidebar 列出 bridge 真实会话、点击重载(`messagesToSteps` 在 bridge 侧重建步骤)、去掉 mock demos | ✅ 完成(bridge 15 测 + app build/16 ✓) |
| 6.4b | **审批弹窗 ✓**:bridge 敏感命令经桌面弹窗门控(per-run `PermissionProvider` → `approval` SSE frame → `POST /approve` 回 allow/always/deny;always 入内存 allowlist)。**安全缺口已闭合。** | ✅ 完成(bridge 18 测含审批往返 + app 18 测) |
| 6.4c | **API key + 模型/effort ✓**:Settings →「模型 / API」面板配置 key(`~/.kurt/desktop.json` 0600,实时重建模型);composer 模型菜单列真实模型(`/info`)、模型/effort 随 `/run` 驱动真实 per-run 配置(`rt.modelFor`)。 | ✅ 完成 |
| 6.4-打磨 | composer 新增 **chat/agent/plan 模式**(bridge 按模式过滤工具 + per-mode prompt)、**thinking 开关**、bridge 加 **request_write_access** + update_plan;窗口可拖动(`core:window:allow-start-dragging`);用户↔回复间距加大 | ✅ 完成 |
| 6.4-修 | **request_write_access「无此工具」修复**:① 从 agent-only 移入全模式 READ_ONLY 基集(审批门控,只读模式下仅放开工作区外目录的**读**);② 接受模型常传的 `{"path":…}` 作为 `directory` 别名;③ prompt 去掉「仅 agent 模式」措辞。回归测试覆盖 path/directory/deny/invalid + 全模式可见。**注意:bridge 不热重载,需完全退出并重启 `tauri dev` 才生效。** | ✅ 完成 |
| 6.4-打磨2 | **用户消息支持 markdown**(用户气泡走与 agent 回复相同的 `MdBlock`:粗体/行内码/标题/列表/代码块);**授权框改内联面板**:不再是居中遮罩弹窗,而是渲染在 composer 内、输入框正上方,等宽、同 16px 圆角,从输入框背后向上升起(`approvalRise`),其余窗口保持可交互。Markdown.test + Approval.test(断言非 overlay)。 | ✅ 完成 |
| 6.4-打磨3 | **markdown 表格**(`MdBlock` 解析 GFM 表格:表头+`\|---\|`分隔+正文,列对齐 `:--/--:/:-:`,单元格内联 md;`.md-table` 描边/斑马纹/横向滚动);**切会话滚到底**(`activeId` 变化时 `scrollTop=scrollHeight`);**授权框按会话保留**:approval 以 run 的 sessionId 为键,切走不再 abort run、run 流入 `runBufRef` 每会话缓冲、仅当查看该会话时镜像到可见 thread,切回重新显示(`loadSession` 不再 `stopRun`;New Chat 仍结束 run);**授权框与输入框贴合**(`margin-bottom:0`+下方直角+无下边框)。Markdown.test +2(表格)。 | ✅ 完成 |
| 6.4-打磨4 | **侧栏会话状态点**(标题左侧一个状态槽:运行中=脉冲 accent 点;运行在非当前会话**完成**→实心未读点 + soft halo;点击会话清除未读;槽位预留宽度保持对齐)。App 用 `unread:Set<sessionId>`,仅当完成时 `runSid!==activeId` 标记;`loadSession` 清除。Sidebar.test +2(运行点/未读点+优先级)。 | ✅ 完成 |
| 6.4-修2 | **bridge SSE 空闲超时**:`Bun.serve` 默认 `idleTimeout:10s` 会掐断长时间无数据的 `/run` SSE 流(模型思考/工具运行/**审批弹窗等待人答**),触发 `cancel()`→abort run。设 `idleTimeout:0` 禁用。MANUAL_TESTS §6.4b 加「审批搁置>10s 仍可完成」核对点。 | ✅ 完成 |
| 6.4-打磨9 | **运行读数 + hover 操作行 + 限定文本选择**:① 查看中会话运行时,thread 底部显示 spinner+已运行时间(+usage 到达后 tokens,如「2m 44s · 1.5k tokens」),每秒跳;Run 加 startedAt/tokens、onUsage 累加、viewStats 镜像当前查看 run、切回运行中会话恢复。② agent/用户消息的 复制/回退/时间 行 `visibility:hidden` 占位、仅 hover 该消息时显示(`.step:hover`/`.query-row:hover`)。③ 全局 `.window user-select:none`,仅消息/预览内容(step-text/query-box/think-body/tool-content/skill-section-body/fp-*/md-pre)+输入框可选。format.test +5。 | ✅ 完成 |
| 6.4-修3 | **超链接走系统浏览器**:内容里的链接点击会让 Tauri webview 自身跳转、替换整个 UI 致软件不可用。改为全局捕获阶段拦截 `<a>` 点击、`preventDefault` 窗口内跳转、交给 opener 插件在系统浏览器打开(`vite` dev 退回 `window.open`)。新 `lib/external.ts`(isExternalHref/externalLinkFromClick/openExternal)。external.test +4。 | ✅ 完成 |
| 6.4-打磨8 | **按会话并发后台运行**:切换会话/新建对话/进设置都不再打断 run;每个会话独立后台运行(可同时多个),只有当前查看会话的停止按钮(或对其删除/回退)才结束它。运行状态从单 run(running/runningId/abortRef/runBufRef)重构为 `Map<runId,Run>`(各自 AbortController/缓冲/idMap 每轮重置/队列);渲染只镜像当前查看的 run;`runningIds:Set` 驱动侧栏点+发送/停止;send 对查看中的忙 run 排队、否则起新 run;loadSession 显示运行中会话的实时缓冲、在别处完成则标未读。bridge 本就支持跨会话并发(独立 runTurn/会话文件、无全局锁)。Sidebar 改收 `runningIds:Set`。 | ✅ 完成 |
| 6.4-打磨7 | **工具/技能整行点击展开折叠**:onClick 从小箭头按钮移到整个 `.tool-line` / `.skill-line` 行(对齐 thinking 的 `.think-head`),箭头变纯视觉(tabIndex -1/aria-hidden,点击冒泡到行),行加 cursor:pointer。steps.test +3。 | ✅ 完成 |
| 6.4-打磨6 | **会话删除**:侧栏 `…` 菜单的「删除」改为两步确认(首点变深红「确认删除」、再点执行、点别处取消),接已有 `DELETE /sessions/:id`;`App.removeSession` 删运行中会话先停 run、删当前查看会话回退到空聊天、清未读点、刷新列表。Sidebar.test +1(arm→confirm→onDelete)。 | ✅ 完成 |
| 6.4-打磨5 | **消息操作 + 代码块复制**:agent 回复底部无背景 **复制** 按钮 + **时间**(流式结束后才显示);用户气泡移入右对齐 `.query-row`,底部 **复制 + 回退 + 时间**;**回退** = 删除该用户消息及之后所有内容 + 文本填回输入框 + 截断后端会话(新 `POST /sessions/:id/truncate`,`SessionStore.truncate`/`truncateToUserTurns`),先停活动 run;**代码块** 右上角复制按钮(`MdBlock` 加 `lang`)。时间为客户端戳(`ts?` 仅客户端,重载会话无时间)。MessageActions.test +4、Markdown 代码复制 +1、agent truncate +5、bridge truncate +2。 | ✅ 完成 |
| 6.4d | 打包:`bun build --compile` bridge → Tauri sidecar 二进制 + 代码签名/公证 `.app` | ⏸ 暂缓(用户选择)—— 桌面端**功能已完整**,停在 `tauri dev` 形态;打包时再做(需 Apple 签名身份,或先出未签名本地构建) |

## 已实现(main)

- **引擎**:`runLoop` 事件流;`Tool`/`ModelProvider`/`CompactionPolicy` 三接口;
  thinking/usage 事件;`ThinkingBlock`(reasoning 回填,能力门控)。
- **模型**:DeepSeek(OpenAI 兼容,SSE);能力元数据 `capabilities.ts`
  (thinking 开关 / effort / max_tokens 默认取模型上限 / context);effort/thinking 真接入;
  `withRetry`(429/5xx/网络抖动退避重试,经 `modelFor` 包住所有模型调用)。
- **上下文管理**:手动 `/compact` + **自动压缩**(`autoCompaction`,超 ~75% 上限自动触发,保 tool 配对)。
- **工具**:read_file · ls · grep(纯 fs、限工作区) · write_file(串行队列) ·
  shell · run_code(沙盒,**以工作区为 CWD**) · brew(授权) · web_search · memory(可读写) ·
  ask_user · update_plan · request_write_access;`truncate` 截断库;`fs-access` 路径限定。
- **沙盒**:Seatbelt/Direct;空闲+硬上限超时;输出截断;进程组中断;实时流式输出。
- **并发安全(2026-06-15 硬化)**:全局状态(`config.json`/`sessions/<id>.json`/`memory.md`/`allowlist.json`)
  统一走**原子写**(temp+rename,`atomicWrite`),读者绝不会读到半截文件;会话有**占用锁**
  (`<id>.lock`,基于进程存活判定陈旧,崩溃自动回收)——同一 session 第二个终端打开会被拒(提示 `/new`),
  不再静默覆盖历史。
- **并发隔离**:`--worktree` → 每会话独立 git worktree + `kurt/<id>` 分支(在 `~/.kurt/worktrees/`),
  退出自动 commit 到该分支(绝不碰 main),打印合并提示。`WorktreeManager`(kurt-agent)为多 Agent 协同的复用地基;
  `kurt worktree list|prune` 管理/清理(prune 只删已合并且干净的,绝不丢未集成的工作)。
- **MCP 接入(Phase 5)**:`kurt-agent/src/mcp/`(官方 `@modelcontextprotocol/sdk`,stdio + Streamable HTTP)
  把远程 server 的工具包成 `McpTool`(实现 `Tool`)注入 ToolHub —— 引擎零改动。工具名命名空间化
  `mcp__<server>__<tool>`;非只读工具经 `PermissionProvider` 审批,只读(readOnlyHint)直接跑;
  单个 server 连接失败隔离降级(零工具,不阻塞启动)。配置在 `~/.kurt/mcp.json`(全局)+
  `<ws>/.kurt/mcp.json`(项目覆盖),`{ "mcpServers": {...} }` 通用 schema;`--no-mcp` 可跳过。
- **Skills(Phase 5)**:渐进披露。`kurt-agent/src/skills/`(`SkillProvider` seam + `skillCatalog`,
  只把 name+description 预载进系统提示)+ `tools/skill.ts`(`SkillTool`,只读,`skill({name})` 按需返回正文,
  全模式可用)。发现/解析在 kurt-tui:`~/.kurt/skills/`(全局)+ `<ws>/.kurt/skills/`(项目覆盖),
  每个 skill 是 `<name>/SKILL.md` 或扁平 `<name>.md`,带可选 name/description frontmatter。引擎不感知。
- **编排抽象**:`Agent`(包 runLoop)+ `ToolHub`(name→Tool 注册表);`AskProvider` seam。
- **TUI(kurt-tui)**:三模式 **chat/agent/plan**(按模式分配工具 + per-mode prompt);
  ask_user 选择题浮层;持久会话(`/sessions` 切换/删除/自动标题);命令审批 + 项目白名单;
  记忆/规则预载;markdown;原生滚动;状态栏;`/compact`/`/new`/`/clear`。

## 未实现 / 下一步(按价值排序)

1. **Phase 4 余项**:更多模型厂家(Anthropic / 本地);`AuthProvider`(登录授权,
   目前 API key 只能走环境变量)。**当前最大缺口。**
2. **Phase 6 余项**:WebUI / 桌面 / 移动前端(目前只有终端 TUI)。
3. **Phase 7 — 多 Agent 编排**:worktree 隔离地基(`WorktreeManager`)已就位;
   待:把 worktree 分配给并行 agent + 集成/合并编排(蜂群雏形在 `feat/beehive` 可复用)。

## 已修复(2026-06-15 Bug 修复轮 B1–B5)

- **B1 全局状态并发竞态 → 修复**:原子写 + 会话占用锁(见上方"并发安全")。数据丢失风险消除。
- **B2 MCP HTTP transport 未验证 → 修复**:加了真实 Streamable HTTP server fixture(Bun.serve + SDK web-standard transport),
  `tools/list`+`tools/call`+错误传播全过;路径本就正确,无潜伏 bug。
- **B3 MCP stdio env 白名单过窄 → 修复**:改用 SDK 的 `getDefaultEnvironment()`(平台感知)再叠加配置 env,
  不再因缺环境变量神秘 "connection closed"。
- **B4 自动压缩阈值 → 修复**:`autoCompactThreshold` 取 `min(contextLimit, 模型真实窗口)` 的 75%,绝不晚于真实窗口触发。
- **B5 worktree 残留 → 修复**:新增 `kurt worktree list|prune`(prune 只删已合并且干净的)。

## 已知债务 / 搁置项

- **`feat/beehive`(本地 + `origin/feat/beehive`)= 蜂群模式雏形(Phase 7),已从 main 回退、搁置。**
  含蜂王/工蜂/DAG 调度 + 四轮实测加固。**未合入 main**(用户要求隔离)。
  注:其中的 `withRetry` 与 `run_code` CWD 修复已单独捡回 main(见上方"已实现")。
- `~/.kurt/sessions` 的 `list()` 扫目录解析每个会话文件;会话很多时略慢(量大再加 index)。
- **kurt-agent 不再"零运行时依赖"**:为 MCP 引入 `@modelcontextprotocol/sdk`(用户 2026-06-14 明确批准),
  仅在 `src/mcp/` 使用,`src/engine/` 仍零依赖零 I/O。已记入 `kurt-agent/CLAUDE.md` §1/§8,**不要当违规删**。
- **MCP 工具只在 agent 模式可见**:chat/plan 取的是固定工具名单(`TOOLS_BY_MODE`),MCP 工具是动态名,
  目前不进 chat/plan —— 即便是只读 MCP 工具(readOnlyHint)。后续可让 `toolsForMode` 放只读 MCP 工具进 chat/plan。
- **无 TUI 内 `/mcp`、`/skills` 发现命令**(只在启动横幅打印);后续可加,列出已连服务器/工具与已加载 skill。
- **Skills v1 只加载正文(无捆绑资源/脚本)**:`skill` 工具只返回 `SKILL.md` 正文;若 skill 目录里还带脚本/模板,
  模型需自行 read(且它们在 `~/.kurt/skills/` 工作区外,要 request_write_access)。后续可让 `skill` 顺带列出捆绑文件+目录路径。
- Skills 与 MCP 工具都在每次启动时同步发现/连接,会话期间新增不会热加载(需重启);量大时启动略慢。
- `packages/kurt-app/`(未跟踪)= Phase 6 WebUI 高保真原型 + 对接文档(Tauri+React+Vite+Tailwind+shadcn),
  无 `package.json` 故 workspace 忽略、不影响构建;Phase 6 开工时落地。
