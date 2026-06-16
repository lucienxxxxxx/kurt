# Manual test procedures — kurt-app

Things automation can't observe (a real window, rendered pixels, native chrome,
live interaction). Each phase appends a short *do X → expect Y* checklist. Run the
relevant one before calling a phase done; record date + result.

> Automated gate (`bun run build` + `cargo check` + Vitest) covers logic/compile.
> This file covers only what needs human eyes.

---

## Phase 6.0 — Scaffold opens a window

Prereq: `cd packages/kurt-app && bun install` (done once).

1. Run `bun run tauri dev` in `packages/kurt-app`.
   → **Expect:** after the Rust build, a native macOS window opens, titled **"Kurt"**,
     ~1100×720, showing the default Tauri+React starter content (greet box / logo).
2. Type in the greet field and submit.
   → **Expect:** "Hello, &lt;name&gt;! You've been greeted from Rust!" appears
     (confirms the React ↔ Rust IPC bridge works).
3. Close the window / Ctrl-C the dev process.
   → **Expect:** clean exit, no orphaned process.

Result: **PASS** (2026-06-15, user) — window opened titled "Kurt"; greet IPC returned
"Hello, 123! You've been greeted from Rust!". The starter content is replaced by the real UI in 6.1.

---

## Phase 6.1 — Static UI parity (mock data)

Run `bun run tauri dev`. The real UI replaces the starter. Compare against
`prototype/index.html` (open it in a browser side-by-side). Everything is mock /
faked-streaming for now — no real agent yet (that's 6.3).

1. **Window chrome** → the three macOS buttons (close/min/max) are the REAL native
   ones, overlaid at the **sidebar's top-left** (titleBarStyle "Overlay"), with NO
   separate OS title-bar frame above the content. They work (close/min/max), and the
   top bar is draggable to move the window. If their position is slightly off, nudge
   `trafficLightPosition` {x,y} in `src-tauri/tauri.conf.json`.
1b. **Sidebar** → search (top-right), "Kurt" wordmark (Amita serif), a red
   "New chat", Projects/Skills, a "Recent" list of 8, profile "lew / Pro" + gear.
2. **Thread (session s1 loads by default)** → right-aligned user query bubble; a
   thinking step ("Thought for 5s", click to expand/collapse); text in serif-headed
   markdown; a "Bash" tool card with **IN/OUT** rows; a `file_organizer` skill card;
   a Read line. Matches the prototype's spacing/fonts/colors.
3. **Send a task** (type in the composer, Enter) → steps stream in one by one
   (thinking → web_search skill → Bash tools → Read → bullet summary), with the
   typing cursor on the live step. Send again while running → it **queues** (timeline
   chip in the composer); the square **stop** button appears; cancel a queued item.
4. **Tool OUT truncation** → a long OUT row is clipped with "…"; click it → a
   **detail panel** slides in on the right. Click a Read file link → file preview
   panel. Multiple panels → tabs.
5. **Theme** → open Settings (gear) → Appearance → toggle Light/Dark; whole app
   recolors via `data-theme`; reopen app → choice persisted.
6. **Language** → Settings → Appearance → 中文 / English segmented control; all UI
   strings AND conversation content switch; persisted across relaunch.
7. **Empty state** → New chat → logo + "Give Kurt a task" + 3 suggestion chips
   (clicking one fills the composer).

Result: ____ (date / pass-fail / notes). Known: menus are custom popovers (shadcn
swap is later); icons are inline SVG (lucide swap later) — both intentional.

