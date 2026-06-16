/**
 * Where the kurt-bridge is listening. In dev you run the bridge yourself
 * (`KURT_BRIDGE_PORT=8765 bun run --cwd packages/kurt-bridge start`) and the app
 * connects to the default below; override with VITE_BRIDGE_URL. In 6.4 Tauri will
 * spawn the bridge and inject the real port (this is where that lookup goes).
 */

const DEFAULT = "http://127.0.0.1:8765";

export function bridgeUrl(): string {
  const fromEnv = (import.meta.env?.VITE_BRIDGE_URL as string | undefined)?.trim();
  return fromEnv && fromEnv.length > 0 ? fromEnv : DEFAULT;
}
