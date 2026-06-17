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

---

## Phase 6.3 — real agent run via the bridge (manual two-process for now)

The frontend streams real runs from `kurt-bridge` over SSE, and Tauri now
**auto-spawns the bridge** (one process). Launch the app with your API key in the
env (it's inherited by the bridge child); optionally pick a safe workspace:

```bash
DEEPSEEK_API_KEY=sk-... KURT_WORKSPACE="$HOME/some-safe-dir" \
  bun run --cwd packages/kurt-app tauri dev
```
The Rust shell spawns the bridge, reads its port, and the app connects automatically
(watch for `[bridge] kurt-bridge listening on …` in the terminal). The bridge exits
when you quit the app (no orphan). To run the bridge manually instead, set
`VITE_BRIDGE_URL` / `KURT_BRIDGE_PORT=8765` (the fallback).

1. Click **New chat** → empty state.
2. Type a real task (e.g. "list the files in my workspace and summarize them") → Enter.
   → **Expect:** real steps stream in — thinking, text, and **real tool cards**
     (e.g. a `shell`/`ls` IN/OUT with actual output from your machine), ending in an
     answer. This is the live engine, not the mock.
3. While running, send another message → it **queues**; the square **stop** button
   appears. Click stop → the run aborts. Cancel a queued item.
4. Send a follow-up in the same chat → it continues the **same** session (the bridge
   keeps history; the agent has context from the prior turn).
5. If the bridge can't start (e.g. no API key), a send shows an "⚠ …" step (graceful).
6. Quit the app → the `[bridge]` process is gone (check `pgrep -f kurt-bridge`).

Note (since 6.4a): the sidebar now lists your **real** sessions (this workspace),
and clicking one resumes it. (Since 6.4b sensitive commands are gated — see below.)

Result: ____ (date / pass-fail / notes).

---

## Phase 6.4b — approval modal (sensitive commands gated)

Launch as in §6.3 (one process). Send a task that makes the agent run a sensitive
shell command, e.g. "create the file /tmp/kurt-test then delete it with rm -f".

1. When the agent reaches the `rm` (or `sudo`, etc.), an **approval modal** appears
   over the window — command + explanation + risk, with **Deny / Always allow /
   Allow once**. The run is **paused** until you choose.
2. **Deny** → the tool result shows it was declined; the agent continues without it.
3. Re-run and **Allow once** → it runs; a later sensitive command prompts **again**.
4. **Always allow** → that command kind runs now and **doesn't prompt again** this session.
5. **Stop** while a modal is open → the run aborts and the modal closes (= deny).
6. Non-sensitive commands (ls, cat, normal scripts) run **without** a prompt.
7. **Slow / waiting streams don't drop (bridge idleTimeout).** Leave an approval prompt
   untouched for **>10 seconds**, then choose Allow → it still completes (the run wasn't
   killed). Likewise a long model "thinking" pause or a >10s tool run keeps streaming.
   (Bun.serve's default 10s idle timeout is disabled for the `/run` SSE stream.)

Result: ____ (date / pass-fail / notes).

---

## Phase 6.4c — set the API key in-app

Launch **without** `DEEPSEEK_API_KEY` in the env (to prove the in-app key is used):
```bash
KURT_WORKSPACE="$HOME/some-safe-dir" bun run --cwd packages/kurt-app tauri dev
```

1. Open **Settings** (gear) → **Model / API**. It shows **API key · not set** and the model id.
2. Paste your key → **Save** → the status flips to **configured** (button shows "Saved").
3. Go back to chat and send a task → it runs (the bridge rebuilt the model with your key,
   no restart). Before saving, a run would have errored with an auth/⚠ step.
4. Quit and relaunch (still no env key) → Settings still shows **configured** (persisted
   to `~/.kurt/desktop.json`, mode 0600) and runs work.

Note: env `DEEPSEEK_API_KEY`, when set, takes precedence over the saved key (dev). Keychain
storage is a later hardening; for now the key is plaintext (0600) on disk.

5. **Model / effort menus** (composer): the model dropdown lists the real models
   (deepseek-v4-flash / -pro, from the bridge); pick one + an effort → the next run
   uses it for that turn (the bridge builds the model with your choice). Default model
   reflects the configured one.

Result: ____ (date / pass-fail / notes).

---

## Phase 6.4 polish — out-of-workspace access, modes, thinking, spacing

1. **Access outside the workspace (request_write_access).** Set `KURT_WORKSPACE` to a
   dir that does NOT contain Downloads, then ask "看一下我的下载文件夹有什么" / "list
   my ~/Downloads". The agent now calls **request_write_access** → the **approval modal**
   pops up for `~/Downloads` → **Allow** → it reads the folder. (It must NOT say "no
   request_write_access tool available".)
2. **Mode menu (chat/agent/plan)** in the composer:
   - **chat** → ask it to write a file or run a command → it explains/declines (no write/shell tools).
   - **agent** → it actually does it.
   - **plan** → it produces a step-by-step plan (update_plan), doesn't execute.
   Selection persists across relaunch.
3. **Thinking toggle** (composer): turn it on → the next run uses the model's thinking/
   reasoning (visible as a thinking step / longer reasoning); off → plain. Persists.
4. **Spacing**: the gap between your message bubble and the agent's reply is noticeably
   wider than before.

Result: ____ (date / pass-fail / notes).

---

## Phase 6.4 polish — markdown in user messages + inline approval panel

1. **Markdown in the user bubble.** Send a message that contains markdown, e.g.
   ``please run `bun test` and check the **first** failure`` (with a `## heading`,
   a `- bullet`, and a ```` ```fenced``` ```` block on separate lines). Your own
   message bubble now renders the markdown (bold, inline code, heading, list, code
   block) — **not** the literal `**`, `` ` ``, `##` characters. The agent's reply
   already rendered markdown; both sides now match.

2. **Approval is an inline panel, not a modal.** Trigger an approval (e.g. ask it to
   `rm` a file, or read `~/Downloads` → request_write_access). Instead of a dimmed
   modal in the center of the window, the approval card now appears **directly above
   the input box**, the **same width** as the composer, with the **same rounded
   corners**, and animates **upward from behind the input box**. There is no overlay
   dimming the rest of the window. Deny / Always allow / Allow once still work the same,
   and the panel disappears once you choose (or on Stop).

Result: ____ (date / pass-fail / notes).

---

## Phase 6.4 polish — md tables, scroll-to-bottom, approval survives session switch

1. **Markdown tables.** Ask for a table (e.g. "给我一个 3 行的 markdown 表格对比 a/b/c").
   The reply renders an actual `<table>` (header shaded, bordered cells, zebra rows,
   `--:` columns right-aligned) — **not** raw `| --- |` text. Tables also render in your
   own message bubble.
2. **Scroll to bottom on session switch.** Open a long conversation from the sidebar.
   The view lands at the **bottom** (latest message), not scrolled to the top.
3. **Approval survives a session switch.** Trigger an approval (e.g. `rm` / read
   `~/Downloads`). With the approval panel showing, click a **different** session in the
   sidebar — it loads normally, the approval panel is **not** shown there, and the run is
   **not** cancelled. Switch **back** to the original session → the approval panel is
   **still there**, and Allow/Deny still completes the blocked run. (New Chat, by contrast,
   ends the run.)
4. **Approval joins the input box.** The approval panel's **bottom is flush** with the
   composer (no gap), bottom corners **square**, so it reads as one continuous surface
   rising out of the input box.

Result: ____ (date / pass-fail / notes).

---

## Phase 6.4 polish — session status dot (running / unread)

1. **Running dot.** Start a run in a conversation. Its row in the sidebar shows a small
   **pulsing** accent dot to the **left of the title**.
2. **Unread dot.** While that run is going, switch to a **different** session (or New Chat).
   When the run **finishes**, the original session's row shows a **solid** accent dot
   (with a soft halo) — the "unread" marker. (If you stay on the running session the
   whole time, it does NOT become unread — you've seen it.)
3. **Click clears it.** Click the unread session → it opens and the dot **disappears**.
4. **Alignment.** Rows with no dot still align with dotted rows (the dot slot is reserved).

Result: ____ (date / pass-fail / notes).

