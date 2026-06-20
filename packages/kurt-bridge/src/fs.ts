/** Workspace file access for the desktop's Files tab + file preview. All paths
 *  are confined to the bridge's workspace subtree — a request that resolves
 *  outside it is rejected (this is localhost, but we still never serve arbitrary
 *  disk paths). Pure-ish helpers over node:fs so they're unit-testable offline. */

import { readdir, readFile as fsReadFile, stat } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, basename } from "node:path";

export interface DirEntry {
  name: string;
  /** Path relative to the workspace root (what the client passes back to recurse). */
  path: string;
  dir: boolean;
}

export interface DirListing {
  /** Requested dir, relative to the workspace ("" = root). */
  path: string;
  entries: DirEntry[];
}

export interface FileContent {
  path: string;
  content: string;
  /** True when the file was larger than the cap and got clipped. */
  truncated: boolean;
}

/** Largest text file we'll inline for preview (bytes). */
const MAX_TEXT_BYTES = 512 * 1024;

/** Resolve a client path within `workspace`; null if it escapes the subtree. */
export function resolveInWorkspace(workspace: string, reqPath: string): string | null {
  const root = resolve(workspace);
  const full = !reqPath ? root : isAbsolute(reqPath) ? resolve(reqPath) : resolve(root, reqPath);
  const rel = relative(root, full);
  if (rel === "") return root;
  if (rel.startsWith("..") || isAbsolute(rel)) return null; // escaped the workspace
  return full;
}

/** List a directory (dirs first, then files; both alphabetical). Hidden dotfiles
 *  are included — the workspace is the user's own project. */
export async function listDir(workspace: string, reqPath: string): Promise<DirListing | null> {
  const full = resolveInWorkspace(workspace, reqPath);
  if (full === null) return null;
  let names: string[];
  try {
    names = await readdir(full);
  } catch {
    return null;
  }
  const root = resolve(workspace);
  const entries: DirEntry[] = [];
  for (const name of names) {
    let dir = false;
    try { dir = (await stat(join(full, name))).isDirectory(); } catch { continue; }
    entries.push({ name, path: relative(root, join(full, name)), dir });
  }
  entries.sort((a, b) => (a.dir === b.dir ? a.name.localeCompare(b.name) : a.dir ? -1 : 1));
  return { path: relative(root, full), entries };
}

/** Read a text file (clipped to the cap). null if it's outside the workspace or
 *  unreadable. */
export async function readTextFile(workspace: string, reqPath: string): Promise<FileContent | null> {
  const full = resolveInWorkspace(workspace, reqPath);
  if (full === null || !reqPath) return null;
  try {
    const buf = await fsReadFile(full);
    const truncated = buf.length > MAX_TEXT_BYTES;
    const content = buf.subarray(0, MAX_TEXT_BYTES).toString("utf8");
    return { path: relative(resolve(workspace), full), content, truncated };
  } catch {
    return null;
  }
}

/** A guessed content-type for the raw-bytes endpoint (pdf/html/images in an iframe). */
export function contentType(file: string): string {
  const ext = basename(file).toLowerCase().split(".").pop() ?? "";
  switch (ext) {
    case "pdf": return "application/pdf";
    case "html": case "htm": return "text/html; charset=utf-8";
    case "svg": return "image/svg+xml";
    case "png": return "image/png";
    case "jpg": case "jpeg": return "image/jpeg";
    case "gif": return "image/gif";
    case "webp": return "image/webp";
    default: return "application/octet-stream";
  }
}
