// Kurt desktop shell. On startup it spawns the kurt-bridge (a Bun process that
// runs the engine) as a child, reads the port it prints, and exposes it to the
// webview via the `bridge_url` command. The bridge exits when this process dies
// (it watches its piped stdin for EOF — see kurt-bridge/src/index.ts), and we
// also kill it on Exit, so no orphaned bridge is left behind.

use std::io::{BufRead, BufReader};
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

fn spawn_bridge(state: &Bridge) {
    // Dev: run the workspace entry directly. (6.4 packaging will switch to a
    // compiled sidecar binary.) Overridable via KURT_BRIDGE_ENTRY.
    let entry = std::env::var("KURT_BRIDGE_ENTRY")
        .unwrap_or_else(|_| format!("{}/../../kurt-bridge/src/index.ts", env!("CARGO_MANIFEST_DIR")));
    let workspace = std::env::var("KURT_WORKSPACE")
        .or_else(|_| std::env::var("HOME"))
        .unwrap_or_else(|_| ".".to_string());

    let mut child = match Command::new(bun_path())
        .args(["run", &entry])
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
            eprintln!("kurt: failed to spawn bridge: {e} (is bun installed?)");
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
        .manage(Bridge { child: Mutex::new(None), port: Arc::new(Mutex::new(None)) })
        .invoke_handler(tauri::generate_handler![bridge_url])
        .setup(|app| {
            spawn_bridge(&app.state::<Bridge>());
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
