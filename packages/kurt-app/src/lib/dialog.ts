/** Native folder picker (Tauri dialog plugin). Returns the chosen absolute path,
 *  or null if cancelled / not running under Tauri. */
export async function pickFolder(defaultPath?: string): Promise<string | null> {
  try {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const res = await open({ directory: true, multiple: false, defaultPath: defaultPath || undefined });
    return typeof res === "string" ? res : null;
  } catch {
    return null;
  }
}
