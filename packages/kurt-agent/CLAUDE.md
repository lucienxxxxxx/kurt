# CLAUDE.md — kurt-agent

> 给未来的 Claude / 协作者:开工前先读完本文件。本文件是 kurt-agent 的"宪法",
> 整理自项目方案与用户(shawnleo1900@gmail.com)的明确要求。任何决策与之冲突,以本文件为准。

## 1. 项目是什么

`kurt-agent` —— 一个**协议无关、引擎零 I/O** 的 AI Agent 核心引擎(**库**)。
- 语言/运行时:**TypeScript on Bun**(Bun 装在 `~/.bun/bin`)。开发期类型用 `@types/bun` + `typescript`。
  - **运行时依赖原则:仍然零依赖。唯一例外 = `@modelcontextprotocol/sdk`(MCP 客户端,Phase 5)**,
    用户 2026-06-14 明确批准放入本包(见 `src/mcp/`)。这是经过权衡的刻意决定(对比见 WORKLOG),
    **不要把它当成"违规"删掉**。该 SDK 只在 `src/mcp/` 使用,`src/engine/` 依然零依赖、零 I/O。
    再加新的运行时依赖前,先回到这条原则、先问用户。
- 优先使用 Bun 原生能力:`Bun.file` / `Bun.write` / `Bun.spawn` / `bun test` / `bun run`,不要退回 Node/npm 等价物,除非明确要求。
- **Monorepo(单一 git 仓库 `kurt`)**:本包在 `kurt/packages/kurt-agent`,兄弟包 `kurt/packages/kurt-tui`(Ink 终端前端 + `kurt` CLI)。前端是引擎的消费者(铁律 #2),依赖本包(workspace)。本包对外只暴露 `src/lib.ts`(public API);UI/Ink/React 等依赖只在 kurt-tui,引擎核心保持零运行时依赖。
- 工作区命令在 `kurt/` 根 `bun install`(根持有 `bun.lock`);各包内 `bun test` / `bun run typecheck`。开发走 `kurt` 仓库的 `feat/…` 分支。

## 2. 三条铁律(任何阶段任何决策都用它检验)

1. **引擎零 I/O** —— `src/engine/` 不碰文件、网络、控制台、进程。一切副作用藏在 `Tool` 接口背后,或下沉到编排层(composition root)。
2. **协议无关** —— 引擎不知道自己被 TUI 还是 WebSocket 消费。模态层(mode)只做两件事:订阅事件→序列化;监听输入→调命令。
3. **加壳不改核** —— 新能力(沙盒、记忆、压缩、MCP、子 Agent、多厂家模型)一律做成"注入引擎的接口实现"或"包在引擎外的编排逻辑",**绝不改引擎代码**。

> 每完成一个模块/阶段必须自问:**换沙盒 / 换 LLM 厂家 / 加新模态,需要改 `src/engine/` 吗?** 答案必须是"不需要"。
> 验证手段:`git diff` 看 `src/engine/` 和 `src/modes/` 是否被动过。被动了就是设计错了。

## 3. 开发工作流(用户的硬性要求)

> **主工作流 = `project-module-workflow` skill。** 在本项目里开发新模块/新阶段或修
> bug,一律走这个 skill,即使用户没点名。它的五步是本项目的默认节奏,下面的条目是它
> 在 kurt-agent 上的具体落地参数。

**索引优先(省 token)**:开工先读 [`PROJECT_INDEX.md`](./PROJECT_INDEX.md)(架构地图),
按它的导向只翻需要的文件,不要重扫整棵树。索引过期或缺失才重扫,扫完写回索引。

**遇疑必问,勿自作主张**:需求不清、或新模块与现有架构冲突/矛盾(要动承重接口或不变式、
有多个权衡不同的设计、模块边界不清),停下来提一个带选项和建议的问题,不要默默替用户拍板。
可逆的小决定(命名、文件位置随大流)直接做并说明即可。

**git 管理(分支 + rebase 集成)**:
- 新模块在 `feat/<模块名>` 分支上做;按模块粒度提交(一个模块一个有意义的 commit,写清"做了什么/为什么")。
- 完成且门禁全绿后**自动集成**:`git rebase main` → `git switch main && git merge --ff-only` →
  `git branch -d`(线性历史,不留 merge 泡)。rebase 出现非平凡冲突 = 集成/架构信号,谨慎处理,
  真冲突则先问用户。
- **bug 修复**走短生命周期分支 `fix/<bug名>`:先复现(最好加回归测试)→ 修根因 → 门禁绿 →
  rebase→ff-merge→**删分支**。结构没变就不动索引。
- 主分支(main)只放已集成、通过验收的工作。commit message 结尾带:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`。

**门禁**:每次改动后、合并前必须 `bun run typecheck` + `bun test` 全绿。

**收尾刷新地图**:模块合并后更新 `PROJECT_INDEX.md`(模块表/导向/命令/"last synced" SHA);
每完成一期再把过程与结果记入 [`WORKLOG.md`](./WORKLOG.md)(交付物、关键决策、验收、踩坑);
**并更新仓库根的 [`PROGRESS.md`](../../PROGRESS.md)**(单一"活进度":阶段状态/功能清单/未完成/已知债务/最后更新)——这是每次落 main 的**强制收尾步**,不是可选项。

## 4. 七期路线图与状态

| 期 | 内容 | 状态 | 依赖 |
|---|---|---|---|
| 1 | 最小闭环(承重墙):runLoop / 事件流 / 三接口定稿 / MockModel / ReadFileTool / stdout 模态 | ✅ 完成 | — |
| 2 | 真实工具 + 沙盒:SandboxProvider + Seatbelt/Direct;文件读写/shell/代码执行/网络搜索;会话临时目录 | ✅ 完成 | 1 |
| 3 | 预加载 + 长期记忆(Memory.md)+ 压缩 | 🚧 手动压缩核心已落地(`src/modes/compaction.ts`:`compactHistory`,只在 user 边界切分保配对);待:预加载 + Memory.md + 自动触发(CompactionPolicy seam) | 1 |
| 4 | 多厂家 ModelProvider(Anthropic/OpenAI/本地)+ 登录授权 | 🚧 OpenAI 兼容(DeepSeek)已落地+真机验证;引擎加了 thinking/usage 事件;待:更多厂家 + AuthProvider | 1 |
| 5 | Skills 完整生命周期 + MCP 接入 | ⬜ | 2,3,4 |
| 6 | 多模态前端(WebUI/TUI/桌面/移动) | 🚧 TUI 已建为兄弟项目 **kurt-tui**(Ink:logo/对话视口/状态栏/markdown/命令面板/滚动/compact);待:WebUI/桌面/移动 | 引擎稳定 |
| 7 | 多 Agent(SubAgentTool 走 `ToolContext.emit` seam;`Map<sessionId,EngineInstance>`) | ⬜ | 1 的预留位 + 6 |

二、三、四相互独立,可任意顺序;五需要 2+3+4;六需要引擎稳定;七靠 1 埋好的两个预留位。

## 5. 引擎契约(已定稿,勿轻易动)

事件流(`AsyncIterable<Event>`)规范顺序:
```
turn_start → llm_delta* → (tool_call, tool_result)* → turn_end   (每轮循环重复)
异常结尾:aborted / error
```
不变式(已被 `src/engine/loop.test.ts` 锁定):
- **配对**:每个 `tool_call` 恒配对恰好一个 `tool_result`(即使 abort / 工具报错)。绝不留悬挂 tool_call。
- **韧性**:工具抛错 → `tool_result(isError:true)`,loop 继续,引擎不崩。
- **可中断**:`AbortController` 能干净中断。

三个注入接口:`Tool`(执行接口,唯一副作用入口)、`ModelProvider`(`countTokens`/`stream`)、`CompactionPolicy`(`thresholdTokens` + `compact`,Phase 3 seam)。

## 6. 目录约定

```
src/
  engine/      ← 核心,零 I/O。改这里 = 大概率违反铁律,三思。
  providers/   ← ModelProvider 实现(MockModel;后续 Anthropic 等)
  tools/       ← Tool 实现(副作用都在这里)
  sandbox/     ← SandboxProvider 接口与实现(Seatbelt / Direct);沙盒细节封死在此
  session/     ← 会话级资源(临时目录等)
  search/      ← 网络搜索后端(可插拔)
  modes/       ← 模态层(stdout 模板;后续 WS/TUI...)
  demos/       ← 可运行场景演示
  index.ts     ← composition root(编排层,唯一允许 new 各种实现并拼装的地方)
```

## 7. 命令

```bash
bun install        # 仅开发期类型依赖
bun run dev        # happy path 演示
bun run demo:abort # 中断演示
bun run demo:error # 工具报错恢复演示
bun test           # 验收测试
bun run typecheck  # tsc --noEmit
```

## 8. 阶段性关键约束备忘

- **Phase 2**:`sandbox-exec` 官方 deprecated 但可用,**必须封在 `SandboxProvider` 接口后**,工具调用点不得直接依赖它(将来换 Firecracker/gVisor/远程容器只改实现类)。同一工具接口可有 本机/裸执行/沙盒/docker 多实现,选哪个是编排层的事,引擎不感知。子进程工具必须**设超时 + 输出截断**。code 工具脚本写**会话专属临时目录**,会话结束清理。
- **Phase 3**:引擎绝不直接写 Memory.md。压缩必须保留最近一轮 tool_result 和未闭合 tool_call,否则配对断裂报错。Skills 渐进披露:预加载只注入 description。
- **Phase 4**:厂商差异不得泄漏到引擎层;授权凭证归编排层。
- **Phase 5**:Tool=引擎执行接口,MCP=tool 的远程 provider,Skill=编排层上下文注入机制。三者别混。
  - **MCP 已落地(2026-06-14)**:`src/mcp/`(官方 SDK,stdio + Streamable HTTP)把远程 server 的工具
    包成 `McpTool`(实现 `Tool`),由 `connectMcpServers()` 收集后注入 ToolHub —— 引擎零改动(铁律 #3)。
    SDK/子进程/网络都是 I/O,封死在 `src/mcp/`,绝不进 `src/engine/`(铁律 #1)。非只读工具经
    `PermissionProvider` 审批(沿用 shell 那套);只读工具(readOnlyHint)直接跑。配置在编排层
    (kurt-tui `~/.kurt/mcp.json` + 项目 `.kurt/mcp.json`),引擎不感知。**Skill 尚未做。**
- **Phase 7**:abort 级联(父中断→子中断);子 Agent 事件冒泡带来源标识。
