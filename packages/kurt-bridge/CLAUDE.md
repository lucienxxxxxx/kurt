# CLAUDE.md — kurt-bridge

> 开工前先读本文件 + [`PROJECT_INDEX.md`](./PROJECT_INDEX.md)。本包是 kurt 引擎的
> **本地 HTTP/SSE 桥**(Phase 6.2),让 GUI 前端(`kurt-app` Tauri 桌面端)能驱动真实 agent。

## 1. 定位
- kurt-bridge = 引擎的**无头编排前端**(同 kurt-tui 之于引擎,铁律 #2):跑 `runLoop`,把 `Event` 流翻译成
  桌面 UI 的 `Step` 形状,经本地 HTTP/SSE 暴露。**绝不实现引擎/业务逻辑**——全来自 `kurt-agent`。
- 为什么存在:Tauri 的 webview 跑不了 Bun/fs/sandbox,Rust 后端跑不了 TS 引擎 → 必须有一个 Bun 进程承载引擎。
  桌面端(6.3 起)把本包当 **sidecar** spawn,读 stdout 的 `KURT_BRIDGE_PORT=<n>` 后连 `127.0.0.1`。
- bun-workspace 成员,依赖 `kurt-agent`(workspace);只 `from "kurt-agent"`,不深进其私有路径。

## 2. 边界铁律(本包版)
1. **只做编排 + 协议**:`runLoop` 装配(model/tools/sandbox/sessions)+ Event→Step 映射 + HTTP/SSE。新能力去 kurt-agent。
2. **wire 契约**:`src/types.ts`(`Step`/`RunFrame`/`SessionInfo`)是和桌面端的 HTTP 契约;改它要同步 `kurt-app` 的镜像类型。
3. **纯逻辑可测**:`StepAccumulator`(events.ts)是纯函数,离线单测;server 用真实 HTTP/SSE + `MockModel` 集成测(`server.test.ts`),不打网络。

## 3. 命令 / 运行
```bash
# 在 kurt/ 根 bun install 之后
bun run --cwd packages/kurt-bridge start     # 启动(读 env;打印 KURT_BRIDGE_PORT=<n>)
cd packages/kurt-bridge && bun test && bun run typecheck   # 门禁
```
- Env:`KURT_WORKSPACE`(工作目录,默认 cwd)· `KURT_BRIDGE_PORT`(固定端口,默认随机)· `DEEPSEEK_API_KEY`/`_BASE_URL`/`_MODEL`。
- 门禁:`bun run typecheck` + `bun test`。落 main 收尾刷新仓库根 `PROGRESS.md` + 本包 `PROJECT_INDEX.md`。commit 结尾 `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`。

## 4. 关键约束 / 待办
- **会话存储共享**:用 kurt-agent 的 `SessionStore`(`~/.kurt/sessions`),和 TUI、桌面端是同一份。
- **SSE upsert 语义**:`step` frame 每次发的是该 `_id` 的当前快照;客户端按 `_id` upsert(后到覆盖)。
- **6.4 必做**:`runTurn` 目前**未对敏感命令做审批门控**(无 UI)。打包前必须接桌面审批弹窗(注入 `PermissionProvider`)。
- 后续:MCP/skills/ask/记忆预载尚未接进 bridge 的工具集(6.3/6.4);auth 仅 env。
