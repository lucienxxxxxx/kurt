/**
 * The skill catalog: the compact, always-present prompt section listing each
 * available skill's name + description (progressive disclosure — bodies stay out
 * of context until the `skill` tool loads them).
 */

import type { SkillMeta } from "./types.ts";

/** Render the catalog prompt section, or "" when no skills are available. */
export function skillCatalog(metas: SkillMeta[]): string {
  if (metas.length === 0) return "";
  const lines = metas.map((m) => `- ${m.name}: ${m.description}`).join("\n");
  return [
    "# Skills",
    "Reusable procedures available on demand. Only their names + descriptions are loaded now.",
    "When a task matches one, call the `skill` tool with its name to load the full instructions, then follow them.",
    "",
    lines,
  ].join("\n");
}
