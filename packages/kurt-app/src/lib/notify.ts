/** Sound effects + desktop notification for run lifecycle events.
 *  - playSend(): a short cue when the user sends a message.
 *  - runComplete(): a chime when the agent finishes a reply, plus a system
 *    notification banner when the window isn't focused (so background runs are
 *    noticed). All best-effort: failures (autoplay block / no Tauri) are ignored. */

import sendUrl from "../assets/sounds/send.mp3";
import doneUrl from "../assets/sounds/done.mp3";

const sendAudio = new Audio(sendUrl);
const doneAudio = new Audio(doneUrl);
sendAudio.preload = "auto";
doneAudio.preload = "auto";

function play(a: HTMLAudioElement): void {
  try { a.currentTime = 0; void a.play().catch(() => {}); } catch { /* ignore */ }
}

/** Cue played when the user sends a message. */
export function playSend(): void {
  play(sendAudio);
}

/** Chime + (when unfocused) a desktop notification when a run finishes. */
export function runComplete(body: string): void {
  play(doneAudio);
  // Only banner when the user isn't looking — avoids redundant noise while watching.
  if (typeof document !== "undefined" && document.hasFocus()) return;
  void notify(body);
}

async function notify(body: string): Promise<void> {
  try {
    const mod = await import("@tauri-apps/plugin-notification");
    let granted = await mod.isPermissionGranted();
    if (!granted) granted = (await mod.requestPermission()) === "granted";
    if (granted) mod.sendNotification({ title: "Kurt", body });
  } catch { /* not running under Tauri, or plugin/permission unavailable */ }
}
