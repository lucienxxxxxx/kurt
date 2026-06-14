# PROGRESS — kurt 项目进度

> **单一"活进度"文档。** 每次有改动落到 `main`,收尾都必须回头更新这里
> (阶段状态 / 功能清单 / 未完成项 / 已知债务 / "最后更新")。开工前先读它对齐现状。
> 路线图的**定义**在 `packages/kurt-agent/CLAUDE.md` §4;这里是它的**实时状态**。

- **最后更新**:2026-06-12 · `main` @ `001bc29`
- **门禁**:kurt-agent **89** pass · kurt-tui **56** pass · typecheck 干净(全离线)

---

## 一句话定位

main 处在「**单机 TUI Agent,主线已相当完整可用**」的阶段:七期里 1、2 全部完成,
4、6 主线完成,3 接近完成;5、7 尚未开始。

## 七期路线图状态(main)

| 期 | 内容 | 状态 |
|---|---|---|
| 1 | 最小闭环:runLoop / 事件流 / 三接口 / MockModel / stdout | ✅ 完成 |
| 2 | 真实工具 + 沙盒:Seatbelt/Direct、文件读写/shell/代码/搜索、会话临时目录 | ✅ 完成 |
| 3 | 预加载 + 记忆 + 压缩 | 🚧 预载 ✓ · agent 可写记忆 ✓ · 手动 `/compact` ✓ · **缺:自动压缩触发** |
| 4 | 多厂家模型 + 授权 | 🚧 DeepSeek/OpenAI 兼容 ✓ · 能力元数据 ✓ · reasoning 回填 ✓ · **缺:更多厂家 + AuthProvider 登录** |
| 5 | Skills 生命周期 + MCP 接入 | ⬜ 未开始 |
| 6 | 多模态前端(WebUI/TUI/桌面/移动) | 🚧 TUI 成熟 · **缺:WebUI / 桌面 / 移动** |
| 7 | 多 Agent(SubAgentTool) | ⬜ main 未开始(雏形见 `feat/beehive`) |

## 已实现(main)

- **引擎**:`runLoop` 事件流;`Tool`/`ModelProvider`/`CompactionPolicy` 三接口;
  thinking/usage 事件;`ThinkingBlock`(reasoning 回填,能力门控)。
- **模型**:DeepSeek(OpenAI 兼容,SSE);能力元数据 `capabilities.ts`
  (thinking 开关 / effort / max_tokens 默认取模型上限 / context);effort/thinking 真接入。
- **工具**:read_file · ls · grep(纯 fs、限工作区) · write_file(串行队列) ·
  shell · run_code(沙盒) · brew(授权) · web_search · memory(可读写) ·
  ask_user · update_plan · request_write_access;`truncate` 截断库;`fs-access` 路径限定。
- **沙盒**:Seatbelt/Direct;空闲+硬上限超时;输出截断;进程组中断;实时流式输出。
- **编排抽象**:`Agent`(包 runLoop)+ `ToolHub`(name→Tool 注册表);`AskProvider` seam。
- **TUI(kurt-tui)**:三模式 **chat/agent/plan**(按模式分配工具 + per-mode prompt);
  ask_user 选择题浮层;持久会话(`/sessions` 切换/删除/自动标题);命令审批 + 项目白名单;
  记忆/规则预载;markdown;原生滚动;状态栏;`/compact`/`/new`/`/clear`。

## 未实现 / 下一步(按价值排序)

1. **Phase 5 — MCP 接入 + Skills**(完全空白):把外部 MCP server 的工具挂进 `ToolHub`;
   Skill 渐进式加载。**当前最大能力缺口。**
2. **Phase 4 余项**:更多模型厂家(Anthropic / 本地);`AuthProvider`(登录授权,
   目前 API key 只能走环境变量)。
3. **Phase 3 余项**:**自动压缩**——`CompactionPolicy` seam 已埋好,缺"超阈值自动触发"策略
   (现在只能手动 `/compact`)。
4. **Phase 6 余项**:WebUI / 桌面 / 移动前端(目前只有终端 TUI)。
5. **Phase 7 — 多 Agent**:main 空白(雏形在 `feat/beehive`)。

## 已知债务 / 搁置项

- **`feat/beehive`(本地 + `origin/feat/beehive`)= 蜂群模式雏形(Phase 7),已从 main 回退、搁置。**
  含蜂王/工蜂/DAG 调度 + 四轮实测加固。**未合入 main**(用户要求隔离)。
- ⚠️ **两个通用改进目前只在 `feat/beehive`,不在 main**,可考虑 cherry-pick 回 main:
  - `withRetry`(429/5xx/网络抖动自动退避重试)——对所有模式有益。
  - **`run_code` 的 CWD 修复**(脚本以工作区为运行目录)——这是**真 bug**,main 上的
    `run_code` 仍踩相对路径失效的坑。
- `~/.kurt/sessions` 的 `list()` 扫目录解析每个会话文件;会话很多时略慢(量大再加 index)。
