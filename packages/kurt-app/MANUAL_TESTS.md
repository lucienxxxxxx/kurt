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
