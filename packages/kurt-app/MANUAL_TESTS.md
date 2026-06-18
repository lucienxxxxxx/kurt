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

## Phase 6.4 — ask_user prompt (agent asks you a question)

Ask something deliberately ambiguous so the agent calls `ask_user` (e.g. "整理我的文件，
但你决定按什么方式分类，先问我").

1. **Prompt appears.** The question shows as a **banner at the top of the composer**: the
   input box and the banner are wrapped in **one rounded container**, with the input box as
   an inset box below the banner (same treatment as the approval panel). Shows a title, the
   agent's **question**, **options** as A/B/… buttons (if any), and a free-form input +
   **Skip**. The run is paused until you answer.
2. **Pick an option** → its text is sent back; the agent continues using your choice.
3. **Type a free-form answer + Enter** (or the ↑ button) → sent back; agent continues.
4. **Skip** → the agent is told you didn't answer and proceeds.
5. **Survives session switch.** While the question is showing, switch to another session and
   back → the question is still there (it's per-session, like approvals). Stop cancels it.
6. Works in **all modes** (chat/agent/plan).

Result: ____ (date / pass-fail / notes).

---

## Phase 6.4 — "Collapse details by default" setting

Settings → **General** → **"默认折叠细节 / Collapse details by default"** toggle.

1. **On.** New (and existing) **thinking / tool / skill** cards in the thread start
   **collapsed** — only the headers + the main agent reply text show. The setting persists
   across relaunch.
2. **Still expandable.** Click an individual thinking/tool/skill header → it expands (and the
   chevron flips); click again to collapse. The per-step toggle overrides the default.
3. **Off (default).** Details are expanded as before; toggling a card collapses it.
4. Flipping the setting re-renders the current conversation with the new default immediately.

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

5. **Model / effort menus** (now **borderless**, in the row **below** the input box on the
   **left** — the context ring is on the right of the same row): the model dropdown lists
   the real models (deepseek-v4-flash / -pro, from the bridge); pick one + an effort → the
   next run uses it for that turn (the bridge builds the model with your choice). Default
   model reflects the configured one.

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
3. **Thinking toggle** lives **inside the model menu** (open the model dropdown → below a
   divider, a "Thinking" row with an Apple-style switch). Toggling it flips the switch in
   place and keeps the menu open; turn it on → the next run uses the model's thinking/
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

2. **Approval is an inline banner, not a modal.** Trigger an approval (e.g. ask it to
   `rm` a file, or read `~/Downloads` → request_write_access). Instead of a dimmed modal,
   the approval shows as a **banner at the top of the composer**: the banner + the input box
   are wrapped in **one rounded container**, with the input box inset below the banner (the
   two are visually connected). No overlay. Deny / Always allow / Allow once work the same,
   and it disappears once you choose (or on Stop).

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

---

## Phase 6.4 polish — message actions (copy / time / rollback) + code-block copy

1. **Agent reply footer.** Below a finished agent reply there's a background-less **Copy**
   button and a **HH:MM** time. Click Copy → the message text is on the clipboard and the
   button briefly shows **Copied**. (The footer does NOT appear while the reply is still
   streaming.)
2. **User message footer.** Below your own bubble (right-aligned) there's **Copy**, a
   **Rollback (回退)** button, and the time. Copy works the same.
3. **Rollback = rewind + edit.** Send a few messages. Click **Rollback** on an earlier
   user message → that message and everything after it disappear from the thread, the
   message's text is placed back in the composer, and the stored session is truncated
   (reloading the session later shows it's shortened). Edit and resend continues from there.
   (If a run is active, Rollback stops it first.)
4. **Code-block copy.** Hover a code block in any message → a copy button appears
   **top-right**; click → the code is copied (button shows the check). Works for both
   agent replies and your own messages.
5. **Reloaded sessions** show no per-message time (not stored) — that's expected; live
   messages do.

Result: ____ (date / pass-fail / notes).

---

## Phase 6.4 polish — delete a session

1. **Two-step delete.** Hover a session in the sidebar → click the **…** button → the menu
   shows a red **Delete**. First click **arms** it (turns darker red, "Confirm delete");
   click again to confirm, or click elsewhere to cancel.
2. **It's gone.** After confirming, the session disappears from the Recent list and stays
   gone after relaunch (removed from `~/.kurt/sessions`).
3. **Deleting the open session** resets the main view to a fresh empty chat.
4. **Deleting a different session** while you're viewing another leaves your current view
   untouched; its unread dot (if any) clears.
5. **Deleting the running session** stops its run first, then removes it.

Result: ____ (date / pass-fail / notes).

---

## Phase 6.4 polish — background runs (per-session concurrency)

1. **Switch away mid-run → it keeps going.** Start a task in session A (steps streaming).
   Click another session B in the sidebar. A's row shows a **pulsing running dot**; B opens
   normally. Switch back to A → its steps **advanced** while you were away (it never stopped).
2. **New Chat doesn't stop it.** With A running, click **New Chat**. A keeps running
   (running dot in the sidebar); you get a fresh empty composer. Switch back to A to watch it.
3. **Run two at once.** While A runs, open B (or a New Chat) and send a second task. **Both**
   run concurrently — both show running dots; each session shows only its own stream.
4. **Stop is per-conversation.** The Stop button only stops the run of the conversation
   **you're viewing**. Viewing a non-running session shows the normal Send button (its
   composer is idle even though another session is running).
5. **Only Stop stops a run.** Switching sessions, New Chat, and opening Settings never abort
   a run — only the composer's Stop button (or Delete / Rollback on that conversation) does.
6. **Finish-while-away → unread dot.** If A finishes while you're viewing B, A gets a solid
   **unread** dot; clicking A clears it.

Result: ____ (date / pass-fail / notes).

---

## Phase 6.4 polish — links open in the system browser (never in-window)

1. **Agent-reply link.** Get the agent to output a markdown link (or send yourself a message
   like `[example](https://example.com)`). Click it → it opens in your **default browser**
   (Safari/Chrome). The Kurt window **does NOT navigate** — the chat UI stays exactly as it
   was (previously the webview replaced itself with the page and the app became unusable).
2. **Works everywhere content renders.** Same for links in your own message bubbles, in a
   markdown table cell, and in a skill's output.
3. **In-app anchors unaffected.** Buttons like the read-file link (`Read …`) and the
   expand/collapse rows still work normally (they're not external links).

Result: ____ (date / pass-fail / notes).

---

## Phase 6.4 polish — run readout, hover actions, no stray selection

1. **Run readout.** While the viewed conversation is running, a row at the **bottom of the
   thread** shows a **spinner + elapsed time** (e.g. `44s`, `2m 44s`); once usage arrives it
   appends **tokens** (e.g. `2m 44s · 1.5k tokens`). Elapsed ticks every second. It clears
   when the run finishes/stops, and re-appears (with the right elapsed/tokens) if you switch
   back to a still-running conversation.
2. **Hover-only message actions.** The Copy / Rollback / time row under agent replies and
   your own messages is **hidden by default** and appears only when you **hover** that
   message. It reserves its space (the layout does **not** jump when it appears/disappears).
3. **No stray text selection.** Dragging to select over the sidebar, titles, buttons,
   composer chrome, status text, etc. selects **nothing**. You **can** still select the
   actual content: agent reply text, your message bubbles, thinking body, tool IN/OUT,
   skill output, code blocks, and the detail-panel preview. Typing/selecting inside the
   composer and the title field still works.

Result: ____ (date / pass-fail / notes).

---

## Phase 6.4 polish — auto-summarized session titles + collapsed status dot

1. **Immediate temp title → summarized title.** Start a new chat and send a first message.
   The session shows up in the recent list **immediately** (the moment the run starts, not
   when it finishes), titled with the **start of your message** (and a running dot). When
   the turn finishes, the title is **replaced by a short auto-generated summary** of the
   topic (a quick model call). With no API key it just keeps the message-based title.
2. **Status-dot spacing.** A session with **no** running/unread dot has its title flush
   left (the dot takes **no** space). Only when a dot is present (running/unread) does the
   title shift right to make room — i.e. the dot slot is not reserved when empty.

Result: ____ (date / pass-fail / notes).

---

## Phase 6.4 polish — context-usage meter (double ring + breakdown card)

1. **Double-ring meter.** Below the composer, bottom-right, a small **donut** shows the
   current context usage as a **percentage** (estimated context tokens ÷ the model's max
   context, from model metadata — 128k for DeepSeek). The arc fills with usage and turns
   amber ≥70% / red ≥90%. It grows as the conversation gets longer; it's only shown once
   there's a conversation.
2. **Breakdown card.** Click the ring → a card opens showing the token breakdown by
   category — **Your messages / Thinking / Tools / Replies / System prompt** — each with a
   proportion bar and count, plus a note that these are **estimated** (the API only reports
   totals). If a run reported real usage, an "Actual API usage this run" line appears.
   Click elsewhere to close.

Result: ____ (date / pass-fail / notes).

---

## Phase 6.4 polish — send arrow, system theme, agent in footer, menu titles

1. **Send button is an up-arrow.** The send button (circle, bottom-right of the input box)
   shows an **↑** instead of the paper-plane.
2. **System color mode.** Settings → Appearance has a third theme card **"跟随系统 / System"**.
   Pick it → the UI matches the OS appearance and **flips live** when you change the macOS
   light/dark setting. Persists across relaunch.
3. **Agent (mode) menu moved to the footer.** The **智能体/对话/计划** menu is now in the
   borderless row **below** the input box, alongside model + effort (left), with the context
   ring on the right. The toolbar inside the box keeps **+ / mic / send**.
4. **Menu titles.** Opening the +, mode, model, or effort dropdown shows a small **title** at
   the top — e.g. the mode menu shows **"模式 / Mode"**, model "模型", effort "强度", + "添加".

Result: ____ (date / pass-fail / notes).

---

## Phase 6.4 polish — per-session scroll memory + Kurt persona prompt

1. **First open → bottom.** After launching the app, open a (long) conversation for the first
   time → it lands at the **bottom** (latest message). (Even though steps load async, it ends
   up at the bottom, not the top.)
2. **Remembers your spot.** Scroll up to the middle of conversation A, switch to B, then switch
   **back to A** → it returns to **where you left off** (not the bottom). B (first opened) lands
   at its bottom; once you scroll it and come back, it remembers too. (Memory is per-launch.)
3. **No blank on rapid switching.** Click back and forth between sessions quickly, many times →
   the view **never goes blank** (each session is cached, so revisits are instant; a slow/failed
   fetch keeps the last content rather than emptying). A first-ever open shows a brief neutral
   loading area, not the empty-state logo.
3. **Persona.** Kurt's replies reflect the "cognitive partner" framing (helps you think, doesn't
   replace your judgment; structures complex problems; concise on simple ones) — driven by the
   rewritten system prompt; it still uses tools and respects request_write_access.

Result: ____ (date / pass-fail / notes).

