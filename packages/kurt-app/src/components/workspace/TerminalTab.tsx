/** Terminal pane — xterm.js wired to the Rust PTY (portable-pty) over Tauri
 *  commands/events. Each tab owns one shell rooted at the workspace; closing the
 *  tab unmounts this and kills the shell. */

import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

/** Pull an xterm theme from the app's CSS variables so it matches light/dark. */
function themeFromCss(el: HTMLElement) {
  const cs = getComputedStyle(el);
  const v = (n: string, f: string) => cs.getPropertyValue(n).trim() || f;
  return {
    background: v("--bg-elevated", "#1e1e1e"),
    foreground: v("--text", "#e0e0e0"),
    cursor: v("--accent", "#e8503a"),
    selectionBackground: v("--bg-active", "#3a3a3a"),
  };
}

export function TerminalTab({ cwd }: { cwd: string }) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    let id: number | null = null;
    let unlistenData: UnlistenFn | null = null;
    let unlistenExit: UnlistenFn | null = null;

    const cs = getComputedStyle(host);
    const term = new Terminal({
      fontFamily: cs.getPropertyValue("--font-mono").trim() || "monospace",
      fontSize: 12.5,
      cursorBlink: true,
      theme: themeFromCss(host),
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host);
    fit.fit();

    void (async () => {
      try {
        id = await invoke<number>("pty_spawn", { cwd, cols: term.cols, rows: term.rows });
        if (disposed) { void invoke("pty_kill", { id }); return; }
        unlistenData = await listen<{ data: string }>(`pty:data:${id}`, (e) => term.write(e.payload.data));
        unlistenExit = await listen(`pty:exit:${id}`, () => term.write("\r\n\x1b[90m[process exited]\x1b[0m\r\n"));
      } catch (err) {
        term.write(`\r\n\x1b[31mTerminal unavailable: ${String(err)}\x1b[0m\r\n`);
      }
    })();

    // Keystrokes → PTY.
    const onData = term.onData((d) => { if (id !== null) void invoke("pty_write", { id, data: d }); });

    // Keep the PTY size in sync with the pane.
    const ro = new ResizeObserver(() => {
      try { fit.fit(); } catch { /* not visible yet */ }
      if (id !== null) void invoke("pty_resize", { id, cols: term.cols, rows: term.rows });
    });
    ro.observe(host);

    return () => {
      disposed = true;
      ro.disconnect();
      onData.dispose();
      unlistenData?.();
      unlistenExit?.();
      if (id !== null) void invoke("pty_kill", { id });
      term.dispose();
    };
  }, [cwd]);

  return <div className="terminal-tab" ref={hostRef} />;
}
