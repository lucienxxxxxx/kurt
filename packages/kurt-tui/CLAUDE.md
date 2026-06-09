# CLAUDE.md — kurt-tui

> 开工前先读本文件 + [`PROJECT_INDEX.md`](./PROJECT_INDEX.md)。本包是
> [`kurt-agent`](../kurt-agent) 的 Ink 终端前端,二者在单一 git 仓库 `kurt` 的
> `packages/` 下(`packages/kurt-agent`、`packages/kurt-tui`)。

## 1. 定位
- kurt-tui 是引擎的**前端消费者**(kurt-agent 铁律 #2):订阅事件流→渲染;输入→引擎命令。**绝不实现业务/引擎逻辑**——模型、工具、沙箱、压缩等都来自 `kurt-agent`。
- TypeScript on **Bun** + **Ink/React**。markdown 用 `marked` + `marked-terminal`。
- 依赖 kurt-agent:`import { … } from "kurt-agent"`(workspace,解析到其 `src/lib.ts`)。UI 依赖只在本包。

## 2. 边界铁律(本项目版)
1. **只做前端**:渲染 + 输入。需要新能力(新工具/新模型/压缩策略)时,去 kurt-agent 实现,这里只消费。
2. **通过 public API 用引擎**:只 `from "kurt-agent"`,不要深进 `../kurt-agent/src/...` 私有路径。缺导出就去 kurt-agent 的 `src/lib.ts` 补。
3. **纯逻辑可测**:视图模型(entries/viewport/commands/compaction-format/theme/tool-format)写成纯函数,离线单测;Ink 组件用 `ink-testing-library` 渲染测。

## 3. 工作流
- 主工作流 = `project-module-workflow` skill(与 kurt-agent 一致):索引优先、遇疑必问、`feat/…`/`fix/…` 分支、门禁绿、rebase→ff-merge、收尾刷新 `PROJECT_INDEX.md`。
- 门禁:`bun run typecheck` + `bun test` 全绿(在 `kurt/` 根 `bun install` 之后)。
- commit 结尾:`Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`。
- 在单一 `kurt` 仓库上开 `feat/…` 分支开发;main 只放已验收工作。

## 4. 命令
```bash
# 在 kurt/ 根先 bun install
export DEEPSEEK_API_KEY=sk-...
bun run tui          # 交互式 TUI(需真终端)
bun run chat ["…"]   # stdout 聊天
kurt / kurt chat / kurt config / kurt help   # 全局命令(~/.bun/bin/kurt 包装器 → src/cli.ts)
bun test ; bun run typecheck
```

**入口与配置**:`src/cli.ts` 是 bin(`kurt`)分发器;`src/run-tui.tsx`/`src/run-chat.ts` 是两个前端;`src/agent.ts` 是 TUI/chat 共享的运行时装配(`resolveSettings` 纯优先级:persisted > env > default);`src/config.ts` 持久化用户设置到 `~/.kurt/config.json`(model/effort/thinking/mode;**API key 绝不写入**,只从 env 读)。TUI 里改设置经 `onConfigChange` 落盘,下次启动自动恢复。

## 5. 关键约束
- 渲染契约见 kurt-agent 的 `Event` 类型;`thinking`/`usage` 是展示用事件。
- markdown 仅对**已定稿**的 assistant 文本渲染,流式时纯文本(半截 markdown 会乱)。
- **自然流模型**:不进备用屏幕(no alt-screen),已完成的回合用 Ink `<Static>` 冲入终端原生 scrollback(鼠标滚轮原生可滚);只有进行中的回合 + 输入 + 状态栏在底部固定区重渲染。banner 启动时打印一次。`/clear`、`/new` 会 bump `<Static>` 的 key 重挂载并清屏。状态栏单行 nowrap,过窄裁切而非换行。
- `/compact` 调 kurt-agent 的 `compactHistory`(只在 user 边界切分,保 tool 配对)。
