// Terminal backend: a real PTY per terminal tab via portable-pty. The webview
// can't spawn a PTY, so the Rust side owns it — xterm.js in the frontend talks to
// these commands and listens for `pty:data:<id>` / `pty:exit:<id>` events.

use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, Mutex};

use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use tauri::{AppHandle, Emitter, State};

/// One live PTY: its master (for resize), a writer (for keystrokes), and the
/// child process (to kill on close).
struct PtySession {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    child: Box<dyn Child + Send + Sync>,
}

#[derive(Default)]
pub struct Ptys {
    map: Arc<Mutex<HashMap<u32, PtySession>>>,
    next: AtomicU32,
}

#[derive(Clone, serde::Serialize)]
struct PtyData {
    data: String,
}

/// The user's login shell, or a sensible default.
fn user_shell() -> String {
    std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string())
}

/// Open a PTY rooted at `cwd` (defaults to $HOME), spawn the shell, and stream
/// its output to `pty:data:<id>`. Returns the new terminal id.
#[tauri::command]
pub fn pty_spawn(app: AppHandle, state: State<Ptys>, cwd: Option<String>, cols: Option<u16>, rows: Option<u16>) -> Result<u32, String> {
    let pty_system = native_pty_system();
    let size = PtySize { rows: rows.unwrap_or(24), cols: cols.unwrap_or(80), pixel_width: 0, pixel_height: 0 };
    let pair = pty_system.openpty(size).map_err(|e| e.to_string())?;

    let mut cmd = CommandBuilder::new(user_shell());
    cmd.arg("-l"); // login shell → user's normal environment
    let dir = cwd.filter(|c| !c.is_empty()).or_else(|| std::env::var("HOME").ok());
    if let Some(d) = dir {
        cmd.cwd(d);
    }
    cmd.env("TERM", "xterm-256color");

    let child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;
    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;

    let id = state.next.fetch_add(1, Ordering::Relaxed) + 1;

    // Reader thread: pump PTY output to the webview until EOF, then signal exit.
    let app_for_thread = app.clone();
    let map_for_thread = state.map.clone();
    std::thread::spawn(move || {
        let mut buf = [0u8; 8192];
        loop {
            match reader.read(&mut buf) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    let data = String::from_utf8_lossy(&buf[..n]).to_string();
                    let _ = app_for_thread.emit(&format!("pty:data:{id}"), PtyData { data });
                }
            }
        }
        let _ = app_for_thread.emit(&format!("pty:exit:{id}"), ());
        if let Ok(mut m) = map_for_thread.lock() {
            m.remove(&id);
        }
    });

    state
        .map
        .lock()
        .map_err(|_| "pty registry poisoned".to_string())?
        .insert(id, PtySession { master: pair.master, writer, child });
    Ok(id)
}

/// Feed keystrokes (or pasted text) to a terminal.
#[tauri::command]
pub fn pty_write(state: State<Ptys>, id: u32, data: String) -> Result<(), String> {
    let mut map = state.map.lock().map_err(|_| "pty registry poisoned".to_string())?;
    let s = map.get_mut(&id).ok_or("no such terminal")?;
    s.writer.write_all(data.as_bytes()).map_err(|e| e.to_string())?;
    s.writer.flush().map_err(|e| e.to_string())
}

/// Resize a terminal's PTY (on xterm fit/window resize).
#[tauri::command]
pub fn pty_resize(state: State<Ptys>, id: u32, cols: u16, rows: u16) -> Result<(), String> {
    let map = state.map.lock().map_err(|_| "pty registry poisoned".to_string())?;
    let s = map.get(&id).ok_or("no such terminal")?;
    s.master
        .resize(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })
        .map_err(|e| e.to_string())
}

/// Kill a terminal's shell and drop it (called when the tab closes).
#[tauri::command]
pub fn pty_kill(state: State<Ptys>, id: u32) -> Result<(), String> {
    let mut map = state.map.lock().map_err(|_| "pty registry poisoned".to_string())?;
    if let Some(mut s) = map.remove(&id) {
        let _ = s.child.kill();
    }
    Ok(())
}
