/** External-link handling. Links in agent/user content must open in the user's
 *  default browser — never navigate the app's own webview (which would replace
 *  the UI and strand the user). We intercept clicks globally and hand the URL to
 *  the Tauri opener plugin. */

/** Links we must hand off to the system browser (vs in-app anchors like `#x`). */
export function isExternalHref(href: string): boolean {
  return /^(https?:|mailto:)/i.test(href.trim());
}

/** If `e` is a plain click on an external link, return its href (caller should
 *  preventDefault + open externally); otherwise null. */
export function externalLinkFromClick(e: MouseEvent): string | null {
  if (e.defaultPrevented) return null;
  const el = e.target as HTMLElement | null;
  const a = el?.closest?.("a[href]") as HTMLAnchorElement | null;
  if (!a) return null;
  const href = a.getAttribute("href") ?? "";
  return isExternalHref(href) ? href : null;
}

/** Open a URL in the user's default browser, never inside the app webview. */
export async function openExternal(url: string): Promise<void> {
  try {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url);
  } catch {
    // Not under Tauri (e.g. plain `vite` dev) → best-effort fallback.
    try { window.open(url, "_blank", "noopener,noreferrer"); } catch { /* ignore */ }
  }
}
