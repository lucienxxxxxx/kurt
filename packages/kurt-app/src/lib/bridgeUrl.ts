/**
 * Where the kurt-bridge is listening.
 *
 * Under Tauri, the Rust shell spawns the bridge and exposes its port via the
 * `bridge_url` command — we poll it briefly (the bridge takes a moment to start).
 * Outside Tauri (bare `vite dev`, or when you run the bridge yourself), fall back
 * to VITE_BRIDGE_URL or the dev default.
 */

import { invoke } from "@tauri-apps/api/core";

const FALLBACK = ((import.meta.env?.VITE_BRIDGE_URL as string | undefined)?.trim() || "http://127.0.0.1:8765");

let cached: string | null = null;

export async function resolveBridgeUrl(): Promise<string> {
  if (cached) return cached;
  // Poll the Tauri command (~6s max) for the spawned bridge's port.
  for (let i = 0; i < 40; i++) {
    let url: string | null;
    try {
      url = await invoke<string | null>("bridge_url");
    } catch {
      break; // not running under Tauri → use the fallback
    }
    if (url) {
      cached = url;
      return url;
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  return FALLBACK;
}
