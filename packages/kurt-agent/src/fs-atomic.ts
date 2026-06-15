/**
 * atomicWrite — crash-/concurrency-safe whole-file write. Writes to a temp file
 * in the same directory, then `rename()`s it over the target. POSIX rename on the
 * same filesystem is atomic, so a concurrent reader (e.g. another kurt process)
 * never sees a half-written file — it sees either the old contents or the new,
 * never a torn/empty one.
 *
 * This does NOT serialize concurrent writers (last rename wins); for read-modify-
 * write coordination across processes use a lock (see SessionStore's lock files).
 * It only guarantees each individual write is all-or-nothing.
 */

import { rename, mkdir } from "node:fs/promises";
import { dirname, join, basename } from "node:path";

export async function atomicWrite(path: string, data: string | Uint8Array): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = join(dirname(path), `.${basename(path)}.${process.pid}.${Math.random().toString(36).slice(2, 8)}.tmp`);
  await Bun.write(tmp, data);
  await rename(tmp, path); // atomic on the same filesystem
}
