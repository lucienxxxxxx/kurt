# PROGRESS — kurt 项目进度

> **单一"活进度"文档。** 每次有改动落到 `main`,收尾都必须回头更新这里
> (阶段状态 / 功能清单 / 未完成项 / 已知债务 / "最后更新")。开工前先读它对齐现状。
> 路线图的**定义**在 `packages/kurt-agent/CLAUDE.md` §4;这里是它的**实时状态**。

- **最后更新**:2026-06-22 · `main`(**并发授权/询问改顺序队列(一个一个处理)**;**显示当前执行步骤(底部活动 + 工具 spinner)+ 回复结束重对账(防被吃)**;**上下文用量改用接口返回 token(双环 % 用真实 inputTokens,估算仅兜底)**;**通用授权 request_access(write/network/open,不再写死写目录)**;**修沙盒过窄 + 模型不会申请授权:可写根加系统临时目录、shell 写拒错追加 request_write_access 提示、prompt 明确沙盒规则**;**修 SSE「Load failed」:心跳保活 + bridge 崩溃兜底(LLM 重试已确认存在)**;**多模型提供商 阶段1(OpenAI/Claude/DeepSeek/自定义 + 启用开关 + 分组下拉;Claude 原生留阶段2)**;**markdown 改用 react-markdown + remark-gfm(支持 `>`/`*斜体*`/删除线/嵌套列表等)**;**workspace 按会话(composer 底部目录选择器,引擎工具/提示/文件树/终端全部 rooted 到会话目录)**;**会话全局统一列表(不再按 workspace 过滤)+ 标签最小宽度/禁横向滚动条**;**引擎并行工具调用(同一轮多个独立调用并发执行)**;**发送/完成音效 + 后台完成系统通知**;**system prompt 注入当前时间+系统信息(每轮)**;**对话条件式底部跟随 + 回到最新 + 流式淡入**;**工作区标签栏 Phase A+B+C + 分屏标签组 + 按会话独立 + 下拉层级**:分屏=两个编辑器组(每屏自带标签条);标签/分屏按会话各存一份;模式/模型/强度持久化;下拉菜单改 fixed 不被分屏裁切 + z-index 规范;单屏铺满宽度修复。**工作区标签栏 Phase A+B+C 全部完成**:标题下标签栏 + 自研左右分屏；会话/文件/预览/计划/**终端**标签，DetailPanel 统一进标签系统；bridge `/fs`·`/file`·`/raw` + `/info` 暴露 workspace + `plan` 帧；**自动触发**:计划→自动开计划标签、run 产出文档→自动开预览；**终端** = Rust portable-pty + xterm.js(懒加载)。前置:新 app 图标、统一步骤头、IN/OUT 截断、文件名点击预览、隐藏输入框滚动条、已思考 N秒)
- **门禁**:kurt-agent **150** · kurt-tui **70** · kurt-bridge **27** · kurt-app build+**Vitest 69**+cargo ✓ · 全 typecheck 干净(GUI 人工核对 `MANUAL_TESTS §6.3–§6.4`)

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
| 授权/询问排队 | **并发审批/询问改为顺序队列**:并行工具调用会同时弹多个 request_access/审批/ask_user;原来每会话只存一个 → 后到的覆盖先到的(先到那个就卡住、OUT 空)。改为**每会话 FIFO 队列**:只显示队首(审批或询问),处理后弹出下一个,并显示「还有 N 个待处理」。bridge 本就按唯一 id 追踪每个请求,无需改。 | ✅ 完成（app 106） |
| 当前步骤显示 + 回复不被吃 | **① 显示当前执行步骤**:底部运行条标注当前动作(正在思考 / 正在执行 <工具> / 正在读取 <文件> / 正在回复)+ 用时;进行中的工具/技能步骤头显示 spinner。**② 回复被吃掉**:run 结束时用该 run 的权威缓冲重对账可见线程(`setThread(run.buf)`),确保最终回复一定显示(主因——SSE 丢帧——已由心跳缓解)。steps.test +1。 | ✅ 完成（app 106） |
| token 用量以接口为准 | **上下文用量改用接口返回值,不再手动估算**:从 usage 帧捕获最近一次调用的 `inputTokens`(=当前上下文大小)存入 run/viewStats;ContextMeter 的双环百分比 + 标题用此**真实值**,估算(chars/4)仅在没有 usage 时兜底(如刚重载的会话)。分类明细仍为估算(接口不给分项,已注明)。底部 run 读数本就用接口累计。ContextMeter.test +1。 | ✅ 完成（app 105） |
| 通用授权 request_access | **放宽授权:不再写死「写目录」**——统一 `request_access({kind,target?})`,kind ∈ **write / network / open**(写目录 / 让 shell·run_code 联网 / 用系统默认程序打开文件·URL),经审批弹框,授权**整会话持续**。引擎:`RequestAccessTool` + 会话级 `AccessGrants`(file/exec 工具实时读);shell/code 的 `allowNetwork` 改 `()=>boolean`(中途授权下一条即生效);open 走注入的 opener(引擎零 I/O)。保留 `request_write_access` 别名(TUI/兼容)。bridge:会话 grants(可写根=workspace+temp+已授权目录、`network`、`open`)+ `openInDefaultApp` + prompt 说明三类申请。tools.test +5。 | ✅ 完成（agent 160 · bridge 47 · tui 70） |
| 修-沙盒授权 | **沙盒太窄 + 模型不会申请授权**:① bridge 的可写根从「仅 workspace」放宽为 **workspace + 系统临时目录**(shell/run_code 常需 `$TMPDIR`,临时、安全);其余仍需 `request_write_access`。② `ShellTool`:命令因沙盒写入被拒(Operation not permitted/Read-only/EPERM/EACCES)时,结果**追加可操作提示**——叫模型 `request_write_access` 后重试(普通非零退出不加)。③ system prompt 明确沙盒规则:随处可读、写仅限 workspace+temp、写别处前先申请、遇权限错即申请。tools.test +2。读权限本就不受限(`allow file-read*`)。 | ✅ 完成（agent 155 · bridge 47） |
| 修-SSE韧性 | **修「Load failed」**:根因是 webview 流式 fetch 在长静默期被 WebKit 客户端超时断开(服务端 idleTimeout 已关,但客户端有自己的超时)。① `runSSE` 每 ~15s 发 `: ping` 心跳(`KURT_SSE_HEARTBEAT_MS`),流不再静默;② `runTurn(...)` 加 `.catch`→优雅 error 帧(不再未处理拒绝);③ bridge 入口加 `uncaughtException/unhandledRejection` 兜底(记录+存活),单次出错不再掐断所有会话。另:确认 LLM 调用**已有重试**(`withRetry`:3 次、指数退避+抖动、仅瞬时错误、未产出前才重试)。server.test +1。 | ✅ 完成（bridge 47 测） |
| 多模型提供商-阶段1 | **多 provider 模型配置(OpenAI/Claude/DeepSeek 内置 + 自定义 + 启用开关)**:bridge 新 `providers.ts`——4 个 provider(3 内置只需填 key,baseURL/模型有默认;custom 为原自由构造),各有启用开关;`runTurn` 按 model id 路由到对应 provider 建客户端(openai/deepseek/custom→OpenAI 兼容;**claude 原生直连留阶段2**,暂流式提示)。`/info` 返回分组 providers + 扁平模型并集;`/config` GET/POST 走多-provider desktop.json(旧单 provider 文件 + env key 自动迁移)。桌面:设置→每 provider 一张卡(开关/key/模型;custom 含 baseURL+格式)+ 原始 JSON;**对话框模型下拉按 provider 分组**;保存即刷新下拉。providers.test +7、server.test 改、app bridge.test 改。 | ✅ 完成（agent 153 · bridge 46 · app 103） |
| Markdown 第三方库 | **改用 react-markdown + remark-gfm 渲染 markdown**:替换手写 `MdBlock`(原仅支持 **粗体**/行内码/#标题/列表/表格),现支持引用块 `>`、`*斜体*`、`~~删除线~~`、嵌套列表、任务列表、自动链接等;React 节点渲染、无 `dangerouslySetInnerHTML`(XSS 安全)。保持 `MdBlock(text,lang)` API + 元素→className 映射(样式不变)+ 代码块语言标签与复制按钮 + 链接仍走系统浏览器。Markdown.test +4。 | ✅ 完成（app build + 102 测） |
| 按会话工作目录 | **workspace 按会话(而非 app 启动)+ 底部选择按钮**:会话拥有自己的 workspace——`runTurn` 解析 `opts.workspace‖session.workspace‖默认`,持久化到记录,**工具/系统提示/文件树/终端 cwd/预览全部 rooted 到该目录**;`makeTools(p,a,ws)`、`Runtime.systemFor(ws)`;`/run`+`/fs·/file·/raw`+`GET /sessions/:id` 带 workspace。桌面:composer 底部 workspace 按钮(folder 图标+basename)→ 原生选择目录(tauri-plugin-dialog + dialog 能力);新会话默认上次所选(持久化 `kurt-workspace`,回退桥默认),切会话恢复各自 workspace。server.test +1、cargo check 绿。 | ✅ 完成（agent 153 · bridge 39 · app 98） |
| 引擎-并行工具 | **并行工具调用**:模型在同一轮发出多个工具调用即视为彼此独立,`runLoop` 改为**并发执行**(`mapPool`,`maxParallel` 默认 8),取代原顺序执行;单个调用=池容量 1,行为不变。铁律不变量全保:tool_call 仍先全量公布、每个调用恰好配对一个 tool_result(报错/中断也是)、工具 `ctx.emit` 仍先于自身结果;result **事件**按完成先后实时冒泡,history 里的 result **块**保持原调用顺序。下游(bridge StepAccumulator 按 id 映射、TUI)无需改动且全绿。loop.test +3、bridge events.test +1。 | ✅ 完成（agent 153 · bridge 38 · tui 70） |
| 音效+通知 | **发送音效 + 完成提示音/通知**:发送消息播放 `send.mp3` 短提示;agent 完成回复播放 `done.mp3`;窗口未聚焦时额外弹系统通知(`tauri-plugin-notification`,新增 `notification:default` 能力 + lib.rs 注册)。全部 best-effort(自动播放被拦/非 Tauri/未授权 静默忽略)。`lib/notify.ts` 封装音频+通知,两段 mp3 入 `assets/sounds`。cargo check 绿。 | ✅ 完成（app build + cargo check + 98 测） |
| 系统提示-环境 | **system prompt 注入环境信息**:每轮运行在系统提示后追加「# Environment」块——当前时间+时区、操作系统/版本/架构、用户名、主机名,让模型对"此时此地"有感知、能按用户 OS 调整命令/路径。在编排层(`runtime.ts` `runTurn` 每轮重建 system)实现,获取系统信息属 I/O,**引擎零 I/O 不动**。server.test +1。 | ✅ 完成（bridge 37 测） |
| 对话滚动-跟随 | **条件式底部跟随 + 回到最新 + 流式淡入**:thread 不再无条件置底——仅当用户在底部阈值(72px)内时跟随流式最新内容;上滑即退出跟随、保留位置不被抢占;上滑且有新内容时显示浮动「回到最新」胶囊(点按平滑滚底/滚回阈值内/发送 → 恢复跟随);切会话恢复各自位置(首开置底)。流式回复用底部渐隐遮罩(纯 mask、无逐字 JS、不破坏 md/代码/表格布局)让新 token 自然浮现 + 一次性淡入衔接 thinking→正文。抽出 `lib/scroll.ts`(isNearBottom/distanceFromBottom)+ scroll.test 5。 | ✅ 完成（app build + 98 测） |
| 工作区标签-按会话+层级 | **标签/分屏按会话独立 + 下拉层级修复**:① 工作区标签与分屏布局改为**每个会话各存一份**(`Record<sessionId,TabsState>`,未保存的新会话用 `"new"` 槽,首次回复迁移到真实 id;新建清空、删除会话丢弃其标签),切换会话显示各自的标签/分屏。② composer 的 模式/模型/强度 下拉(以及 `+` 标签下拉)之前 `position:absolute` 被分屏 pane 的 `overflow:hidden` 裁切——改为 `fixed` 锚定按钮(超出视口夹取),并加 `--z-dropdown(1000)/--z-modal` 层级规范,`.menu`/`.ws-menu` 统一用之,稳定盖在分屏之上。 | ✅ 完成（app build + 93 测） |
| 工作区标签-分组 | **分屏=两个标签组(editor groups)**:把标签模型从「单栏 + 主/副指针」重构为**两个编辑器组**,每个 pane 拥有自己的标签条 + 活动标签 + `+` 菜单(IDE 式)。分屏=把某标签移入新右组(自带标签条);再分屏=在两组间移动;关掉某组最后一个标签→自动合屏;取消分屏=合并回单组。文件/工具输出/计划自动打开改用 `addSplit`(在第二组旁开)。`tabsReducer` 重写(tabs.test 15)、`WorkspaceTabsBar` 每组一条(WorkspaceTabs.test 5)。 | ✅ 完成（app build + 93 测） |
| 工作区标签-C | **终端标签(阶段 C)**:Rust `pty.rs`(portable-pty)每个终端标签起一个真实 PTY——命令 `pty_spawn`/`pty_write`/`pty_resize`/`pty_kill`,输出经 Tauri 事件 `pty:data:<id>`/`pty:exit:<id>` 推给前端;shell=`$SHELL` 登录壳、cwd=workspace(`/info` 暴露)。前端 `TerminalTab`(`@xterm/xterm`+`addon-fit`,**懒加载**成独立 chunk,主题取自 CSS 变量,resize 同步 PTY);关标签杀进程、退出杀全部。`cargo check` 绿。终端/计划占位移除(均已落地)。 | ✅ 完成（cargo check + app build(xterm 独立 chunk) + 91 测） |
| 工作区标签-B | **计划标签 + 自动触发(阶段 B)**:bridge 在 `update_plan` 工具调用时发 `plan` 帧(`planFromInput` 解析 `{steps:[{title,status}]}`→`PlanStep[]`);桌面 `PlanTab` 渲染清单(进度/完成划线/进行中高亮),计划按会话存(本启动周期、live)。**自动触发**:① 某会话首次出现计划→自动分屏开「计划」标签;② 一轮 run **结束**且本轮用 `write_file` 写过可预览文档(md/html/pdf)→自动分屏开该文档「预览」(仅对正在查看的 run,不抢占其它会话视图)。client 加 `plan` 帧/`onPlan`/`PlanStep`。events.test +2、server.test +1、PlanTab.test +2。 | ✅ 完成（app build + 91 测 · bridge 36 测） |
| 工作区标签-A | **会话标签栏 + 分屏框架(阶段 A)**:标题下新增标签栏——默认「会话」标签(不可关)+ `+` 下拉(终端/文件/计划/预览)+ 标签右键菜单(分屏/取消分屏/关闭);自研左右双屏(`Workspace`，可拖拽分隔条 20–80%)。**统一**:标签系统取代 `DetailPanel`，点文件名/工具输出→开「预览」标签并分屏到会话右侧。文件标签=workspace 文件树(新桥接端点）；预览支持 md/代码/工具输出/html(沙箱 iframe)/pdf(原生)。bridge 新增 `GET /fs`、`/file`、`/raw`（限定 workspace 子树、防越界）+ `/info` 暴露 `workspace`。纯 reducer `tabsReducer`（tabs.test 13）+ WorkspaceTabs.test 5 + bridge fs.test 4/server.test workspace 断言。终端/计划暂为「即将推出」占位（留待阶段 C/B）。 | ✅ 完成（app build + 89 测 · bridge typecheck + 33 测） |
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
| 6.4-打磨19 | **回车不发送 + API 配置编辑器**:① composer 取消 Enter 直接发送,改 Cmd/Ctrl+Enter 发。② bridge config 升级为 `{apiKey,baseURL,models[],format}`(旧 `model` 迁移到 `models[0]`),新增 `GET /config` 返回完整 desktop.json(含 key,localhost),`POST /config` 仍回状态;format 仅存储(实际仍 OpenAI 兼容,真 Anthropic provider 留后续)。③ 设置页:BaseURL/密钥/模型(逗号)/OpenAI·Claude 格式开关 表单 + desktop.json 原始 JSON 编辑器(默认只读,编辑→确认、实时校验、确认保存并回只读、表单同步)。server.test config 往返 +1。 | ✅ 完成 |
| 6.4-修6 | **「已思考 0s」+ 消息细节淡化**:① bridge `StepAccumulator.#closeThinking` 只在内部数组写了 `sec` 没回传,故客户端拿不到最终秒数→显示 0s;改为关闭时连思考步一起重发(回归测试断言返回帧含带 sec 的思考步)。② 复制/时间页脚只给每个 segment 的**最后一条文本**(`lastTextId`),中间文本不显示,避免把文本和工具卡割裂。③ 思考/工具/技能统一淡化(tool/skill-name→muted 无 serif、skill 徽章去 accent);重载会话无 sec 显示「已思考」而非 0s。 | ✅ 完成 |
| 6.4-打磨18 | **授权/询问框连体外壳**:approval/ask 改为 composer 顶部 banner——`{approval}`+`.composer` 包进 `.composer-shell`,`.has-banner` 时画外层圆角容器+阴影、内层 `.composer` 去阴影内嵌(radius 13),无 banner 时 shell 透传(输入框不变);`.approval-inline` 改透明 banner、从顶部落入(approvalDrop)。 | ✅ 完成 |
| 6.4-打磨17 | **「默认折叠细节」设置**:设置→通用 加开关,开后思考/工具/技能卡默认收起、只留主回复文本;`collapsed` 集合重解释为「相对默认的反选」,`renderStep` 用 `open = collapseDetails ? collapsed.has : !collapsed.has`,单步切换仍可单独展开。持久化 `kurt-collapse-details`,切换即时重渲染。steps.test +2。 | ✅ 完成 |
| 6.4-打磨16 | **ask_user 接入前端**:沿用授权框那套——bridge `runTurn` 注入 per-run `AskProvider`,发 `ask` RunFrame(question/options),阻塞到 `POST /answer`(或中断→"");`Runtime.pendingAsks`/`resolveAsk`,`makeTools(permission, ask)` 加 `AskUserTool`,`ask_user` 进 READ_ONLY(全模式)。桌面端新 `Ask` 面板(输入框上方,问题+A/B 选项按钮+自由输入+跳过),按会话保留、答完/结束/停止清除;bridge 客户端加 `AskRequest`/`ask` 帧/`onAsk`/`answer()`。server.test ask 往返 +1、Ask.test +5。引擎未改(AskUserTool/AskProvider 早已导出)。 | ✅ 完成 |
| 6.4-修5 | **会话视图白屏 + 首开置底修复**:① 白屏根因—`loadSession` 异步取 steps、await 后才 setThread,慢/失败/竞态(尤其从新会话切入)回落到 empty-state。加每会话 `sessionCache`:切换即时显示缓存(无白屏/闪)、stale fetch 也写缓存、失败保留旧内容、首次打开显示中性加载区而非 logo;run 结束刷新缓存、回退/删除失效。② 置底根因—滚动恢复挂在 `[activeId]`,在异步内容提交前就量了旧高度。改 `wantScroll` 标志 + `[thread]` 内容到屏后再滚(首开到底/重访恢复位置)。 | ✅ 完成 |
| 6.4-打磨15 | **按会话记忆滚动位置 + Kurt 人设 prompt**:① thread 容器 onScroll 按会话(id,新会话用 "")记 scrollTop;切换时恢复该会话上次位置,首次打开(无记录)落到底部;按启动周期记忆。② 重写 bridge `defaultSystem`:身份→关系→原则→协作方式(认知伙伴,不替代判断;用户掌目标/价值/决策,Kurt 掌推理/连接/探索;抓本质、复杂题深入、要事列收益/风险/隐藏假设;用用户语言),保留工具/WORKSPACE_DIR/request_write_access 操作规则。 | ✅ 完成 |
| 6.4-打磨14 | **发送上箭头 + 跟随系统主题 + 智能体入底部 + 菜单标题**:① 发送按钮用上箭头图标(`arrowUp`);② 新增主题「跟随系统」——`Theme` 加 `system`,App 用 `matchMedia(prefers-color-scheme)` 解析并随系统实时切换,Settings 加第三张主题卡(浅/深对角预览);③ 模式(智能体/对话/计划)菜单从工具栏移入无边框 `.composer-footer`(左:模式/模型/effort,右:上下文环),工具栏留 +/麦克风/发送;④ 各下拉顶部加标题(`MenuPopover` title→`.menu-title`):模式/模型/强度/添加。 | ✅ 完成 |
| 6.4-打磨13 | **模型/effort 移到输入框下方一行**:model/effort 菜单从工具栏移入新 `.composer-footer`(输入框下方),改无边框(`.composer-footer .pill-btn` 透明边框/背景,hover 微底色),左侧 model+effort、右侧上下文双环同排;工具栏保留 +/模式/麦克风/发送。 | ✅ 完成 |
| 6.4-打磨12 | **上下文用量双环 + 明细卡**:composer 下方右侧 donut 双环显示上下文占比=估算上下文 token / 模型最大上下文(`modelContextWindow`,deepseek 128k),≥70% 琥珀、≥90% 红;点击弹卡按类别(你的消息/思考/工具/回复/系统)给比例条+计数,注明为估算(API 只报总量),有真实用量则附 API 合计。新 `lib/tokens.ts`(estimateTokens)、`lib/models.ts`、`ContextMeter`、Composer `meter` 槽。估算式,直播/重载/无 key 都可用。tokens.test +6、ContextMeter.test +3。 | ✅ 完成 |
| 6.4-修4 | **新会话即时入列表**:根因—`runTurn` 仅在运行结束才存会话,故新会话直到跑完才出现在侧栏。改为新会话先用消息开头作临时标题并**提前保存**(运行一开始即可列出),首轮后 LLM 总结替换标题(无总结器/失败/中断则保留临时标题)。server.test 调整(开场 frame 带临时标题、断言运行中即列出)。 | ✅ 完成 |
| 6.4-打磨11 | **模型厂商 logo**:新增 `ModelLogo`(按 model id 选厂商 logo——模型元数据的图标位):deepseek 模型显示 DeepSeek 填充图标(`fill:currentColor`,独立于描边 Icon 集),未知厂商退回 spark;模型菜单按钮 + 每个模型行改用 `ModelLogo`(思考行仍用 spark)。ModelLogo.test +3。 | ✅ 完成 |
| 6.4-打磨10 | **会话标题 LLM 自动总结 + 状态点不占位**:① bridge 新会话标题不再用首条消息原文——`runTurn` 先留空(开场 `session` frame title=""),首轮结束后调用可注入的 `rt.makeTitle(messages)` 生成简洁标题并保存(无总结器/失败/中断则退回首条消息截断);`productionRuntime` 接一次免工具模型调用(transcriptFor+cleanTitle),`createRuntime` 加可选 `makeTitle` 便于测试。app 侧 `refreshSessions` 保留空标题,侧栏把空标题本地化为「新会话」占位 → 新建时先显示「新会话」,首轮后替换为总结。② 侧栏状态点仅有状态(运行/未读)时才渲染,无状态不占 7px 槽位。bridge server.test +1、app Sidebar.test +1。 | ✅ 完成 |
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
