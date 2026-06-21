#!/usr/bin/env bun
/**
 * kurt-bridge entry — the desktop app (Tauri) spawns this as a sidecar. It starts
 * the engine + HTTP/SSE server on localhost and prints the chosen port to stdout
 * as `KURT_BRIDGE_PORT=<n>` so the parent can read it and connect.
 *
 * Env: KURT_WORKSPACE (working dir, default cwd) · KURT_BRIDGE_PORT (fixed port,
 * default ephemeral) · DEEPSEEK_API_KEY/BASE_URL/MODEL (model).
 */

import { productionRuntime } from "./runtime.ts";
import { startServer } from "./server.ts";

// Resilience: never let one stray error take the whole bridge down. A crash here
// closes every SSE socket → the desktop shows "Load failed" and all sessions die.
// Log and keep serving instead; a bad run surfaces as an error frame in the UI.
process.on("uncaughtException", (err) => console.error("[bridge] uncaughtException (kept alive):", err));
process.on("unhandledRejection", (reason) => console.error("[bridge] unhandledRejection (kept alive):", reason));

const workspace = process.env.KURT_WORKSPACE ?? process.cwd();
const port = Number(process.env.KURT_BRIDGE_PORT ?? 0) || 0;

const rt = productionRuntime(workspace);
const handle = startServer(rt, { port });

// The Tauri sidecar reads this line from stdout to learn where to connect.
console.log(`KURT_BRIDGE_PORT=${handle.port}`);
console.log(`kurt-bridge listening on ${handle.url} (workspace: ${workspace})`);

const shutdown = (): void => {
  handle.stop();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// When spawned as a sidecar (Tauri pipes our stdin and holds it open), exit as
// soon as the parent closes it — i.e. the desktop app died. Avoids orphaned
// bridge processes. In a normal terminal run stdin is a TTY → skip.
if (!process.stdin.isTTY) {
  process.stdin.on("end", shutdown);
  process.stdin.on("close", shutdown);
  process.stdin.resume();
}
