# Kurt — 开发对接文档（Claude Code）

> 目标读者：使用 Claude Code 把本原型落地到真实应用的开发同学（人或 Agent）。
> 目标技术栈：**Tauri v2 · React + TypeScript · Vite · Tailwind CSS · shadcn/ui · Zustand · TanStack Query**

---

## 0. 关于这份交付包里的"原型"

`prototype/` 下的所有文件（HTML / JSX / CSS）是 **设计参考**，不是生产代码。
它们用 HTML + 内联 Babel JSX 实现，目的是说清楚 **视觉、交互、信息层级**，不是直接复制粘贴到目标工程里。

> 你的任务是 **用目标技术栈"重新实现"这份设计**，而不是把 HTML 原样搬过去。
> 重新实现时严格按照本文件第 2 节的"核心架构原则"组织代码。

保真度：**Hi-Fi（高保真）**。颜色、间距、字号、圆角、动效都按设计令牌 1:1 还原。

---

## 1. 包内文件说明

| 文件 | 作用 |
|---|---|
| `README.md` | 本文件 — 核心原则 + 总览 |
| `PORTING_GUIDE.md` | 详细移植指南：每个文件 → 目标工程的映射、组件 props 草图、Zustand store 草图、Tauri/SSE 写法、移植顺序 |
| `prototype/index.html` | 应用外壳 + 全部布局 CSS |
| `prototype/tokens.css` | 设计令牌（颜色、字体、圆角、主题）— **可以原样拷贝到目标工程** |
| `prototype/ui.jsx` | 所有展示型组件（侧边栏、对话流、消息渲染器、Composer、菜单…） |
| `prototype/app.jsx` | 应用根、状态、伪造的流式逻辑 |
| `prototype/i18n.js` | 中英双语词条 + `tr()` |
| `prototype/data.js` | 假数据（会话列表、预制对话、脚本化的运行步骤） |
| `prototype/kurt_logo.svg` | 品牌标识 |

---

## 2. 核心架构原则 ⭐

> 这一节是本次交付 **新增的强约束**，请严格遵守。下游所有 UI 代码都要按这个分层组织。

### 2.1 必须封装一层"项目自有 UI 组件"，不许业务代码直接调 shadcn 原语

落地路径：`src/components/ui/`（项目内的 design-system 层）。

**原则：业务/页面代码只引用 `@/components/ui/*`，不直接 `import { Button } from "@/components/shadcn/button"`。**

#### 为什么

- shadcn/Tailwind 的 className 拼装很容易在不同页面里漂移（同一个按钮，A 页面写了 `px-3 py-2 rounded-md`，B 页面写了 `px-4 py-1.5 rounded-lg`，肉眼很难看出差别但事实上已经分叉）。
- 设计令牌一改，需要在几十处 className 里跟着改，很容易漏。
- 后续要换基座（比如 shadcn → Radix Themes、或换图标库 lucide → tabler），改一个文件就行，不用到处搜替换。
- Claude Code / 任何 Agent 在补功能时，会"按上次写过的样子"补；如果上次写得不规范，错误就会扩散。封一层强制收口可以阻止这种漂移。
- 减少开发过程中的"重复造轮子"——同一个 IconButton、同一个下拉菜单壳、同一个滚动容器，写一次。

#### 必须封装哪些（最小集）

下面这些在原型里都出现了多次，**必须**进 `src/components/ui/`：

| 项目组件 | 包装的底层 | 在原型里的对应 |
|---|---|---|
| `<KButton>` | shadcn `Button` | `.pill-btn`, `.send-btn`, `.suggest` |
| `<KIconButton>` | shadcn `Button size="icon"` | `.icon-btn`（侧边栏顶栏按钮、主区顶栏按钮、菜单触发点） |
| `<KMenu>` / `<KMenuItem>` / `<KMenuSep>` | shadcn `DropdownMenu` | `.menu`, `.menu-item`, `.menu-sep`（recent-item 的 `…`、Composer 的 + 菜单、Model 菜单、Effort 菜单） |
| `<KScrollArea>` | shadcn `ScrollArea` | `.sb-scroll`, `.thread-scroll`, `.dp-body`, `.set-detail` |
| `<KSegmented>` | 自己写 | 语言切换 `.seg-row` |
| `<KToggle>` | shadcn `Switch` | 设置里的开关 `.toggle` |
| `<KNavItem>` | 自己写 | 侧边栏每一行 `.nav-item`（含 `primary` / `active` 变体和 `red-dot`、`live-dot`） |
| `<KCard>` | 自己写 | `.tool-card`, `.skill-card`, 设置里所有内容容器 |
| `<KSectionLabel>` | 自己写 | `.sb-section-label`, `.skill-section-label` |
| `<KIcon>` | `lucide-react` | 原型的 `<Icon name>` 系统 |
| `<KBrandMark>` | 自己写 | logo + Amita "Kurt" 字标，sm/md 两种尺寸 |
| `<KTitleInput>` | 自己写 | `.conv-title-input` 那个自适应宽度的会话标题输入框 |
| `<KComposer>` | 自己写 | 整个 `.composer` 卡片（textarea + bar 槽位） |
| `<KRunBar>` | 自己写 | `.running-bar`（运行中状态条，含 spinner + 可暂停态） |
| `<KQueueRow>` | 自己写 | `.queue-tl-row`（队列里的一行，含时间线 dot 和取消按钮） |

#### 写法约定

```tsx
// src/components/ui/KButton.tsx
import * as React from "react";
import { Button as ShadButton, type ButtonProps } from "@/components/shadcn/button";
import { cn } from "@/lib/cn";

type Variant = "primary" | "ghost" | "pill" | "send" | "stop";
type Size    = "sm" | "md" | "icon";

export interface KButtonProps extends Omit<ButtonProps, "variant" | "size"> {
  variant?: Variant;
  size?: Size;
}

export const KButton = React.forwardRef<HTMLButtonElement, KButtonProps>(
  ({ variant = "ghost", size = "md", className, ...rest }, ref) => (
    <ShadButton
      ref={ref}
      className={cn(
        // base
        "font-sans transition-colors",
        // variants
        variant === "primary" && "bg-[var(--accent)] text-white hover:bg-[var(--accent-press)] shadow-[0_6px_16px_rgba(232,80,58,0.30)]",
        variant === "pill"    && "border border-[var(--border)] text-[var(--text-soft)] hover:bg-[var(--bg-hover)] rounded-[9px] h-8 px-2.5 text-[13px]",
        variant === "ghost"   && "border-transparent text-[var(--text-soft)] hover:bg-[var(--bg-hover)] px-2",
        variant === "send"    && "bg-[var(--accent)] text-white hover:bg-[var(--accent-press)] rounded-[10px] w-[34px] h-[34px]",
        variant === "stop"    && "bg-[var(--border-strong)] text-[var(--text)] hover:bg-[var(--text-muted)] rounded-[10px] w-[34px] h-[34px]",
        // sizes
        size === "icon" && "w-[30px] h-[30px] p-0 grid place-items-center rounded-lg",
        className,
      )}
      {...rest}
    />
  ),
);
KButton.displayName = "KButton";
```

要点：

1. **`forwardRef`** — Radix 系组件需要 ref 才能正常工作（FocusManager、Tooltip 触发点等）。
2. **`displayName`** — 让 React DevTools 显示 `KButton` 而不是 `ForwardRef`。
3. **`variant` + `size` 而不是裸 className 入参** — 这是收口的关键。允许 `className` 透传，但只用于位置类（`absolute`, `mt-2`），不允许覆盖外观。Code review 标准：业务代码里 `KButton` 上出现 `bg-`、`text-`、`hover:`、`rounded-` 类都算违规。
4. **颜色只走 CSS 变量** — 不写 `bg-orange-500`，写 `bg-[var(--accent)]`。`tokens.css` 改一个值，全站跟着变。
5. **不直接消费 shadcn 类型** — 用 `Omit<ButtonProps, "variant" | "size">`，再用我们自己的字面量联合，避免和 shadcn 的 variant 名打架。

#### 目录结构

```
src/components/
├── ui/                       # 项目自有 UI 层（本原则的产物）
│   ├── KButton.tsx
│   ├── KIconButton.tsx
│   ├── KMenu.tsx
│   ├── KScrollArea.tsx
│   ├── KSegmented.tsx
│   ├── KToggle.tsx
│   ├── KNavItem.tsx
│   ├── KCard.tsx
│   ├── KSectionLabel.tsx
│   ├── KIcon.tsx
│   ├── KBrandMark.tsx
│   ├── KTitleInput.tsx
│   ├── KComposer.tsx
│   ├── KRunBar.tsx
│   ├── KQueueRow.tsx
│   └── index.ts              # barrel 导出，业务侧 `import { KButton } from "@/components/ui"`
├── shadcn/                   # shadcn CLI 生成的原语，**仅 ui/ 层引用**
│   ├── button.tsx
│   ├── dropdown-menu.tsx
│   └── …
├── layout/                   # 业务层 — Window / Sidebar
├── thread/                   # 业务层 — 对话流
└── composer/                 # 业务层 — Composer 组合
```

#### Lint 规则建议

在 `eslint.config.js` 加一条 `no-restricted-imports`，禁止业务目录直接引用 shadcn：

```ts
{
  files: ["src/components/{layout,thread,composer,pages}/**"],
  rules: {
    "no-restricted-imports": ["error", {
      patterns: [{
        group: ["@/components/shadcn/*"],
        message: "请通过 @/components/ui/* 引用，不要直接使用 shadcn 原语。",
      }],
    }],
  },
}
```

#### 什么时候允许新增一个 `K*` 组件

- 同一个视觉模式在 **两个或以上** 业务点出现 → 立刻抽出来。
- 单点使用但承载了非平凡的状态（受控/非受控、键盘交互、动效）→ 也抽。
- 一次性、纯布局的容器（一个页面的栅格）→ 不抽，留在业务文件里。

### 2.2 其他相关原则（顺带强调一下）

- **设计令牌（`tokens.css`）是单一真源**。任何颜色都先在 `tokens.css` 里找；找不到就先加令牌、再用。**禁止在业务代码里出现裸 hex / rgba**。
- **图标统一用 `KIcon`**，内部代理到 `lucide-react`。需要新增图标先在 `KIcon` 的映射表里登记。`PORTING_GUIDE.md §8` 给了完整对照表。
- **文案不写死**，全部走 `react-i18next`。原型里的 `T` 对象直接转 JSON。
- **状态分层**：UI 偏好（theme、lang）进 Zustand `persist`；会话/运行状态进内存 + 后端；服务端列表用 TanStack Query。详见 `PORTING_GUIDE.md §5 §6`。

---

## 3. 下一步

1. 读 `PORTING_GUIDE.md` 拿到完整的文件映射、组件 props 草图和移植顺序。
2. 在 `prototype/` 里把原型跑起来（直接用浏览器打开 `index.html` 即可），对照 UI 实现。
3. 严格按 §2 落 `src/components/ui/` —— **第一周的产出应该全是 `K*` 组件 + Storybook，第二周才开始拼业务**。

如果遇到原型里没说清楚的细节（比如某个 hover 状态、某个边界情况），优先打开 `prototype/index.html` 在浏览器里看；其次看 `prototype/ui.jsx` 的 JSX 源码；最后再问需求方。
