/**
 * Shared path confinement for the file tools. Reads/writes/listing are limited to
 * a set of allowed root directories (the workspace + any dirs opened via
 * request_write_access). The roots array is the same shared, mutable reference the
 * tools hold, so grants take effect live.
 */

import { isAbsolute, relative, resolve } from "node:path";

/** True if `target` is `root` itself or nested inside it. */
export function isInside(root: string, target: string): boolean {
  const rel = relative(root, target);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

/**
 * Resolve `input` (relative paths against the first root = the workspace) and
 * confine it to `roots`. Returns the absolute path, or an error message for the
 * model when it escapes.
 */
export function resolveWithin(
  input: string,
  roots: string[],
  verb = "Access",
): { path: string } | { error: string } {
  const resolved = roots.map((r) => resolve(r));
  const base = resolved[0] ?? process.cwd();
  const full = isAbsolute(input) ? resolve(input) : resolve(base, input);
  if (!resolved.some((r) => isInside(r, full))) {
    return {
      error:
        `Refused: ${input} resolves outside the workspace (${resolved.join(", ")}). ` +
        `${verb} is limited to the workspace; to reach this path, call request_write_access ` +
        `for its directory first, then retry.`,
    };
  }
  return { path: full };
}
