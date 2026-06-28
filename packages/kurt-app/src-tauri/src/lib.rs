// Kurt desktop shell. On startup it spawns the kurt-bridge (a Bun process that
// runs the engine) as a child, reads the port it prints, and exposes it to the
// webview via the `bridge_url` command. The bridge exits when this process dies
// (it watches its piped stdin for EOF — see kurt-bridge/src/index.ts), and we
// also kill it on Exit, so no orphaned bridge is left behind.

mod pty;

use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use tauri::{Manager, RunEvent, State};

struct Bridge {
    child: Mutex<Option<Child>>,
    port: Arc<Mutex<Option<u16>>>,
}

/// The webview calls this to learn where the bridge is listening. Returns null
/// until the bridge has started and printed its port.
#[tauri::command]
fn bridge_url(state: State<Bridge>) -> Option<String> {
    state
        .port
        .lock()
        .ok()
        .and_then(|p| *p)
        .map(|port| format!("http://127.0.0.1:{port}"))
}

/// Prefer ~/.bun/bin/bun (GUI apps get a minimal PATH); fall back to `bun`.
fn bun_path() -> String {
    if let Ok(home) = std::env::var("HOME") {
        let p = format!("{home}/.bun/bin/bun");
        if std::path::Path::new(&p).exists() {
            return p;
        }
    }
    "bun".to_string()
}

fn bundled_bridge_path(app: &tauri::App) -> Option<PathBuf> {
    let candidates = [
        app.path().resource_dir().ok().map(|dir| dir.join("kurt-bridge")),
        std::env::current_exe()
            .ok()
            .and_then(|exe| exe.parent().map(|dir| dir.join("kurt-bridge"))),
    ];

    candidates.into_iter().flatten().find(|path| path.exists())
}

fn bridge_command(app: &tauri::App) -> Command {
    if let Ok(path) = std::env::var("KURT_BRIDGE_BIN") {
        return Command::new(path);
    }

    if !cfg!(debug_assertions) {
        if let Some(path) = bundled_bridge_path(app) {
            return Command::new(path);
        }
    }

    // Development: run the workspace entry directly. Overridable via
    // KURT_BRIDGE_ENTRY when testing a different checkout.
    let entry = std::env::var("KURT_BRIDGE_ENTRY")
        .unwrap_or_else(|_| format!("{}/../../kurt-bridge/src/index.ts", env!("CARGO_MANIFEST_DIR")));
    let mut command = Command::new(bun_path());
    command.args(["run", &entry]);
    command
}

fn spawn_bridge(app: &tauri::App, state: &Bridge) {
    let workspace = std::env::var("KURT_WORKSPACE")
        .or_else(|_| std::env::var("HOME"))
        .unwrap_or_else(|_| ".".to_string());

    let mut command = bridge_command(app);
    let mut child = match command
        .env("KURT_WORKSPACE", &workspace)
        // Piped stdin we keep open: when this process dies the pipe closes and
        // the bridge sees EOF on stdin and exits (no orphan).
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit())
        .spawn()
    {
        Ok(c) => c,
        Err(e) => {
            eprintln!("kurt: failed to spawn bridge: {e}");
            return;
        }
    };

    if let Some(out) = child.stdout.take() {
        let port = state.port.clone();
        std::thread::spawn(move || {
            for line in BufReader::new(out).lines().map_while(Result::ok) {
                if let Some(rest) = line.strip_prefix("KURT_BRIDGE_PORT=") {
                    if let Ok(p) = rest.trim().parse::<u16>() {
                        if let Ok(mut slot) = port.lock() {
                            *slot = Some(p);
                        }
                    }
                }
                println!("[bridge] {line}");
            }
        });
    }

    if let Ok(mut slot) = state.child.lock() {
        *slot = Some(child);
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(Bridge { child: Mutex::new(None), port: Arc::new(Mutex::new(None)) })
        .manage(pty::Ptys::default())
        .invoke_handler(tauri::generate_handler![bridge_url, pty::pty_spawn, pty::pty_write, pty::pty_resize, pty::pty_kill])
        .setup(|app| {
            spawn_bridge(app, &app.state::<Bridge>());
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(|app, event| {
            if let RunEvent::Exit = event {
                if let Ok(mut slot) = app.state::<Bridge>().child.lock() {
                    if let Some(mut child) = slot.take() {
                        let _ = child.kill();
                    }
                }
            }
        });
}
