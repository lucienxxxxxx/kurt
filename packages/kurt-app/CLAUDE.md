# CLAUDE.md — kurt-app (macOS desktop)

> 开工前先读本文件 + [`PROJECT_INDEX.md`](./PROJECT_INDEX.md)。本包是 kurt 的 **Tauri v2 桌面前端**
> (Phase 6),在单一 monorepo `kurt` 的 `packages/kurt-app`。设计参考在 [`prototype/`](./prototype/),
> 映射见 [`PORTING_GUIDE.md`](./PORTING_GUIDE.md)。

## 1. 定位
- kurt-app 是引擎的**桌面前端消费者**(同 kurt-tui 之于引擎的关系,kurt-agent 铁律 #2):订阅事件→渲染;输入→命令。
  **绝不实现引擎/业务逻辑**——模型、工具、沙箱、会话、压缩、MCP、skills 全在 `kurt-agent`,由 `kurt-bridge` 暴露。
- **引擎访问走 `kurt-bridge`(本地 HTTP+SSE),不是 TS workspace 依赖。** webview 跑不了 Bun/fs/sandbox,
  Tauri 的 Rust 后端也跑不了 TS 引擎 → 必须由一个 Bun 进程(kurt-bridge)承载引擎、用本地 HTTP 暴露。
  本包通过 `127.0.0.1` 连它;wire 类型在本包内定义(镜像 bridge 输出),**不要 import kurt-agent**。
- 栈:**Tauri v2 (Rust 壳) + React 19 + TypeScript + Vite + Tailwind + shadcn/ui + Zustand + TanStack Query**。

## 2. 边界铁律(本包版)
1. **只做前端 + IPC**:渲染、状态、菜单、本地 IPC 包装。要新能力(新工具/模型/会话语义)→ 去 kurt-agent 实现、kurt-bridge 暴露,这里只消费。
2. **HTTP 边界**:前端只通过 kurt-bridge 的 HTTP/SSE 契约拿数据;契约变更要同步 bridge 与本包的 wire 类型。
3. **shadcn 经 `@/components/ui/*` 包装**,业务组件不直接 import shadcn 原语(见 `PORTING_GUIDE.md` §2 / §4)。
4. **设计保真**:布局比例/字号/serif 标题/步骤进场动画等严格按 `PORTING_GUIDE.md` §11;`prototype/` 是参考、不照搬脚手架(§10)。

## 3. 不是 bun workspace 成员
- 本包有**自己的 `package.json` + `bun.lock`**,刻意不在根 `workspaces` 里(避免把 React/Vite 灌进引擎 lockfile)。
- 安装/运行:`cd packages/kurt-app && bun install`。**开发**:`bun run tauri dev`(开 GUI 窗口)。**前端构建**:`bun run build`(tsc+vite)。**打包**:`bun run tauri build`。
- 引擎(bridge)走**本地 sidecar**:开发版默认 spawn 本机 `bun` 跑 kurt-bridge;发布版优先运行随包携带的 `kurt-bridge` 二进制。可用 `KURT_BRIDGE_BIN`/`KURT_BRIDGE_ENTRY` 覆盖调试。

## 4. 工作流(同仓库)
- 主工作流 = `project-module-workflow` skill:索引优先、遇疑必问、`feat/…` 分支、**先定可观测测试点再写**、门禁绿、rebase→ff-merge、收尾刷新索引。
- **门禁**:`bun run build`(tsc + vite,在 `packages/kurt-app`)+ `cargo check`(在 `src-tauri/`)+ 组件测试(`bun run test`,随 6.1 引入 Vitest+RTL)。GUI/视觉用 `MANUAL_TESTS.md` 的人工清单。
- **强制收尾**:每次落 main 更新仓库根 [`PROGRESS.md`](../../PROGRESS.md) 的 Phase 6 表 + 本包 `PROJECT_INDEX.md`;GUI 行为记 `MANUAL_TESTS.md`。
- commit 结尾:`Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`。

## 5. 关键约束
- `tauri.conf.json`:macOS 自绘标题栏(后续 `decorations:false` + `titleBarStyle:"Overlay"` + `hiddenTitle`);侧栏固定 280px(不加拖拽)。
- 流式运行:bridge 用 SSE 推 `Event`→`Step`;前端 `useStreamedRun` 读流。长输出滚动+截断。
- 主题 light/dark 经 `data-theme`;i18n zh/en 经 react-i18next(对话内容的 {zh,en} 是数据,不进 i18n 表)。
- API key:v1 从 env / Settings 读;6.4 进 Keychain。**绝不**硬编码或提交密钥。
