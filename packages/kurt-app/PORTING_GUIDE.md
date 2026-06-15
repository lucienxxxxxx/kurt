# Kurt — Porting Guide

> 配套文档。先读 `README.md` 拿到核心架构原则（必读：§2 项目自有 UI 组件包装），再回到这里看每一块的细节映射。
>
> Prototype → production port guide.
> Target stack: **Tauri v2 + React + TypeScript + Vite + Tailwind CSS + shadcn/ui + Zustand + TanStack Query**.

This document maps every piece of the HTML prototype to its target equivalent so you (or another agent) can rebuild it without losing design intent.

> ⚠️ 本文件第 4 节给出的"Component inventory"是 **业务层** 的 props 草图。它们内部 **必须** 通过 `@/components/ui/*` 调用 shadcn 原语，不许直接 import shadcn — 见 README §2.1。

---

## 1. What's in the prototype

| File | Role | Maps to |
|---|---|---|
| `index.html` | App shell, font imports, layout CSS | `index.html` + `app/globals.css` + Tailwind layout |
| `tokens.css` | Design tokens (colors, fonts, radii, themes) | `app/globals.css` + `tailwind.config.ts` |
| `i18n.js` | Translation table + `tr()` helper | `src/i18n/{zh,en}.json` + `react-i18next` |
| `data.js` | Canned sessions, prebuilt threads, scripted run | `src/mocks/*` for dev; real backend in prod |
| `ui.jsx` | All presentational components | `src/components/**/*.tsx` |
| `app.jsx` | App root + streaming logic + state | `src/App.tsx` + Zustand store + TanStack Query |
| `kurt_logo.svg` | Brand mark | `src/assets/kurt_logo.svg` |

---

## 2. Recommended file layout (target)

```
kurt/
├── src-tauri/                       # Tauri v2 (Rust shell)
│   ├── tauri.conf.json              # decorations:false → use our custom titlebar
│   └── src/main.rs                  # window, IPC commands (run_agent, list_sessions, …)
└── src/
    ├── main.tsx
    ├── App.tsx
    ├── assets/
    │   └── kurt_logo.svg
    ├── components/
    │   ├── layout/
    │   │   ├── Window.tsx           # outer shell with traffic-light region
    │   │   └── Sidebar.tsx
    │   ├── brand/
    │   │   └── BrandMark.tsx        # logo + Amita "Kurt"
    │   ├── thread/
    │   │   ├── Thread.tsx           # segment grouping
    │   │   ├── UserQuery.tsx
    │   │   ├── ThinkingStep.tsx
    │   │   ├── TextStep.tsx
    │   │   ├── ToolStep.tsx
    │   │   ├── ReadStep.tsx
    │   │   └── EmptyState.tsx
    │   └── composer/
    │       ├── Composer.tsx
    │       ├── PlusMenu.tsx
    │       ├── ModelMenu.tsx
    │       ├── EffortMenu.tsx
    │       ├── RunBar.tsx
    │       └── SendButton.tsx
    ├── stores/
    │   └── useAgentStore.ts         # Zustand
    ├── hooks/
    │   ├── useStreamedRun.ts        # TanStack Query mutation + SSE
    │   └── useSessions.ts           # TanStack Query
    ├── i18n/
    │   ├── index.ts
    │   ├── zh.json
    │   └── en.json
    ├── lib/
    │   ├── cn.ts                    # clsx + tailwind-merge
    │   └── invoke.ts                # typed Tauri IPC wrappers
    └── styles/
        ├── globals.css              # shadcn base + tokens import
        └── tokens.css               # COPY OF prototype tokens.css
```

---

## 3. Design tokens

`tokens.css` is portable — copy it verbatim into `src/styles/tokens.css` and import once from `main.tsx`. shadcn primitives read CSS variables, so they pick up the palette automatically.

**Where to wire shadcn variables:** in `app/globals.css`, alias shadcn's variables to ours so its components inherit our look:

```css
@layer base {
  :root {
    --background: var(--bg-main);
    --foreground: var(--text);
    --card:       var(--bg-elevated);
    --popover:    var(--bg-elevated);
    --primary:           var(--accent);
    --primary-foreground: #ffffff;
    --muted:             var(--bg-sidebar);
    --muted-foreground:  var(--text-muted);
    --accent:            var(--bg-active);
    --accent-foreground: var(--text);
    --border: var(--border);
    --input:  var(--border-strong);
    --ring:   var(--accent);
    --radius: 0.75rem;       /* 12px */
  }
}
```

For Tailwind class IntelliSense, see the `tailwind.config.ts` sketch already in the header comment of `tokens.css`.

---

## 4. Component inventory + TS props sketches

> Each entry includes the **shadcn primitive** it leans on. Where shadcn doesn't have a direct match, we wrap raw primitives.

### Layout

```ts
// components/layout/Window.tsx                       // shadcn: none — custom shell
// Tauri sets decorations:false; we draw our own chrome.

// components/layout/Sidebar.tsx                       // shadcn: ScrollArea
interface SidebarProps {
  recents: Session[];
  activeId: string | null;
  runningId: string | null;
  onPick: (id: string) => void;
  onNewChat: () => void;
}
// Reads { theme, lang } from useAgentStore directly — no props.
```

### Brand

```ts
// components/brand/BrandMark.tsx
interface BrandMarkProps { size?: "sm" | "md"; }
// renders the SVG + "Kurt" in Amita 700.
```

### Thread

```ts
// components/thread/Thread.tsx
interface ThreadProps { steps: Step[]; liveId: string | null; }

interface Step {
  _id: string;
  type: "user" | "thinking" | "text" | "tool" | "read";
  text?: LocalizedString;        // for user/thinking/text
  sec?: number;                   // thinking: seconds spent
  name?: string;                  // tool: "Bash"
  title?: LocalizedString;        // tool title
  cmd?: string;                   // tool IN (universal, not localized)
  out?: LocalizedString;          // tool OUT
  file?: string;                  // read: filepath
  lines?: string;                 // read: "1-18"
}

type LocalizedString = { zh: string; en: string };
```

Step renderers are split (`ThinkingStep`, `TextStep`, `ToolStep`, `ReadStep`) — keep that. Each takes a single `step` prop and reads `lang` from the store.

> **Why not put step types in one component?** Switching on `step.type` inline makes JIT-rendering hard and bloats the bundle. The prototype's `renderStep()` switch is convenient at this scale; in TS prefer one component per type with a discriminated union.

### Composer (already shadcn-shaped)

```ts
// components/composer/Composer.tsx                    // shadcn: Textarea
interface ComposerProps {
  value: string; onChange: (v: string) => void;
  onSend: () => void;
  running: boolean;
}
// Pulls running/paused state from store; onPause/onStop also from store.

// PlusMenu / ModelMenu / EffortMenu                   // shadcn: DropdownMenu
// RunBar                                              // custom (uses shadcn Button)
// SendButton                                          // shadcn: Button size="icon"
```

Each menu component already manages its own `open` state — direct lift to `<DropdownMenu open={open} onOpenChange={setOpen}>`.

---

## 5. State: Zustand store sketch

```ts
// stores/useAgentStore.ts
import { create } from "zustand";
import { persist } from "zustand/middleware";

type Theme = "light" | "dark";
type Lang  = "zh" | "en";

interface RunState {
  running: boolean;
  paused: boolean;
  liveId: string | null;
  runningSessionId: string | null;
}

interface AgentStore {
  theme: Theme;
  lang: Lang;
  activeSessionId: string | null;
  thread: Step[];                    // current session steps
  collapsed: Set<string>;            // collapsed step ids

  run: RunState;

  setTheme: (t: Theme) => void;
  setLang:  (l: Lang) => void;
  toggleStepCollapsed: (id: string) => void;
  loadSession: (id: string) => void;
  newChat: () => void;

  // streaming
  startRun: (userText: string) => Promise<void>;
  pauseRun: () => void;
  stopRun: () => void;
}

export const useAgentStore = create<AgentStore>()(
  persist(
    (set, get) => ({
      theme: "light", lang: "zh",
      activeSessionId: null, thread: [], collapsed: new Set(),
      run: { running: false, paused: false, liveId: null, runningSessionId: null },
      setTheme: (t) => set({ theme: t }),
      setLang:  (l) => set({ lang: l }),
      // …rest implemented with the prototype's logic
    }),
    { name: "kurt-store", partialize: (s) => ({ theme: s.theme, lang: s.lang }) }
  )
);
```

> Only persist `{ theme, lang }`. Threads and run state live in memory + the backend.

---

## 6. Server state: TanStack Query

The prototype fakes streaming with `setTimeout`. In production:

```ts
// hooks/useStreamedRun.ts
export function useStreamedRun() {
  const store = useAgentStore();
  return useMutation({
    mutationFn: async (userText: string) => {
      // open SSE to Tauri command (or HTTP backend)
      const res = await fetch("/api/run", { method: "POST", body: JSON.stringify({ userText }) });
      const reader = res.body!.getReader();
      const dec = new TextDecoder();
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        for (const evt of parseSSE(dec.decode(value))) {
          if (evt.type === "step") store.appendStep(evt.step);
          if (evt.type === "delta") store.updateLiveText(evt.delta);
        }
      }
    },
  });
}

// hooks/useSessions.ts
export function useSessions() {
  return useQuery({
    queryKey: ["sessions"],
    queryFn:  () => invoke<Session[]>("list_sessions"),
  });
}
```

Tauri IPC: define `run`, `list_sessions`, `delete_session`, `rename_session` commands in `src-tauri/src/main.rs`.

---

## 7. i18n

Prototype's `T` object is a flat key → `{zh, en}` map. Convert to JSON for `react-i18next`:

```jsonc
// src/i18n/zh.json
{
  "newChat": "新对话",
  "projects": "项目",
  "skills": "技能",
  "recent": "最近",
  "thoughtFor": "已思考 {{n}}s",
  "thinking": "正在思考…",
  "phEmpty": "交给 Kurt 一个任务…",
  "phRunning": "排队下一条消息…",
  "runningLabel": "Kurt 正在运行…"
  // …  copy the rest from i18n.js
}
```

```ts
// src/i18n/index.ts
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import zh from "./zh.json";
import en from "./en.json";
i18n.use(initReactI18next).init({
  resources: { zh: { t: zh }, en: { t: en } },
  lng: "zh", fallbackLng: "en", defaultNS: "t",
  interpolation: { escapeValue: false },
});
```

> **Note:** the prototype interpolates with `{n}` (single braces). react-i18next uses `{{n}}`. Search/replace when porting.

**Bilingual conversation content** (the `data.js` `{zh,en}` step text) doesn't go in i18n.json — it's data, not UI strings. Keep it in fixtures (or come from the backend with `lang` negotiated per-request).

---

## 8. Icons

Prototype rolls its own `<Icon name="…">` with hand-written SVG paths. **Replace with `lucide-react`** — every icon I used has a direct equivalent:

| Prototype name | lucide-react |
|---|---|
| `plus`, `newchat` | `Plus` |
| `search` | `Search` |
| `sun` / `moon` | `Sun` / `Moon` |
| `chat` | `MessageSquare` |
| `folder` | `Folder` |
| `image` | `Image` |
| `globe` | `Globe` |
| `calendar` | `Calendar` |
| `broom` | `Brush` (approx) |
| `mic` | `Mic` |
| `bell` | `Bell` |
| `chevR` / `chevD` | `ChevronRight` / `ChevronDown` |
| `send` | `Send` |
| `stop` | `Square` |
| `pause` | `Pause` |
| `paperclip` | `Paperclip` |
| `sliders` | `SlidersHorizontal` |
| `spark` | `Sparkles` |
| `more` | `MoreHorizontal` |
| `edit` | `Pencil` |
| `translate` | `Languages` |
| `projects` | `FolderOpen` |
| `skills` | `Zap` |
| `check` | `Check` |

---

## 9. Tauri specifics

- `tauri.conf.json` → `"decorations": false` (we draw our own titlebar; traffic lights are decorative, real ones come from Tauri's macOS native window — set `"titleBarStyle": "Overlay"` and `"hiddenTitle": true` on macOS).
- Sidebar **fixed at 280px** — user decision; do not add a resize handle.
- For the streaming SSE: use Tauri's `Channel<T>` (v2) or `event.emit` from Rust to push step events; subscribe in `useStreamedRun`.

---

## 10. Things to leave behind

These are prototype scaffolding — **do not port**:

- `<script src="https://unpkg.com/@babel/standalone/...">` and the `<script type="text/babel">` tags
- The custom `<Icon>` component — replace with lucide-react
- The hand-written `.pill-btn`, `.menu`, `.composer` CSS classes — shadcn primitives + Tailwind
- The `window.AGENT` / `window.T` globals — proper imports
- `withIds()` and `_uid` counter — TanStack Query gives stable mutation keys; backend assigns step IDs
- The `setTimeout`-driven `scheduleNext` — SSE / streaming reader instead

---

## 11. Things to keep faithfully

- **Layout proportions:** sidebar 280px fixed, thread max-width 760px centered, composer 760px centered
- **Type scale:** all token sizes in `tokens.css`
- **Serif on titles** (`--font-serif`) — strict
- **Step entrance:** translateY(7px) only, no opacity fade (avoids capture artifacts and looks more solid)
- **Right-aligned user query bubble** with `var(--accent-soft)` background, no border, normal weight, 15.5px
- **Tool card**: IN + OUT rows with the IN label muted, OUT label in accent
- **Read step**: single line (no card)
- **Sidebar grouping order:** New chat → Projects / Skills → Recent → (profile at bottom)

---

## 12. Suggested porting order

1. Vite + Tailwind + shadcn init, paste `tokens.css` into `src/styles/`, wire shadcn variables
2. Layout shell + Sidebar (static, no streaming) — verify visual parity with prototype
3. i18n setup, language toggle
4. Theme toggle (Zustand + `data-theme` attribute on `<html>`)
5. Thread renderers with mock data
6. Composer with all menus
7. Zustand store wiring
8. TanStack Query + Tauri IPC for `list_sessions`
9. Streaming run via SSE / Tauri Channel
10. Persistence (sqlite via `tauri-plugin-sql`)

Hand the prototype + this doc to Claude Code (or any dev) for steps 1-7; backend wiring (8-10) needs decisions on auth, model provider, history storage.
