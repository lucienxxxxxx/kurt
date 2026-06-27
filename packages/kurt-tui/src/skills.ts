/**
 * Skill discovery + loading (the orchestration-layer half of progressive
 * disclosure). Reads skills from ~/.kurt/skills/ (global) and <ws>/.kurt/skills/
 * (project, overrides global by name), parses each into name/description/body,
 * and exposes them as a `SkillProvider` (for the `skill` tool) plus a catalog
 * string (preloaded into the system prompt — descriptions only).
 *
 * A skill is either `<skills>/<name>/SKILL.md` or a flat `<skills>/<name>.md`,
 * with optional YAML-ish frontmatter:
 *
 *   ---
 *   name: pdf-extraction
 *   description: Extract text and tables from PDF files
 *   ---
 *   <markdown instructions…>
 *
 * Missing frontmatter is fine: the name falls back to the file/dir name and the
 * description to the first non-empty line.
 */

import { readdir } from "node:fs/promises";
import { join } from "node:path";
import type { SkillProvider, SkillMeta } from "kurt-agent";
import { skillCatalog } from "kurt-agent";
import { globalSkillsDir, projectSkillsDir } from "./paths.ts";

export interface ParsedSkill {
  name: string;
  description: string;
  body: string;
}

/** Where a loaded skill came from. */
export type SkillScope = "global" | "project";

/** Display-facing info for a loaded skill (the front-end's `/skills` view). */
export interface SkillInfo {
  name: string;
  description: string;
  /** global = ~/.kurt/skills, project = <ws>/.kurt/skills (overrides global). */
  scope: SkillScope;
  /** Absolute path to the skill's SKILL.md / <name>.md. */
  path: string;
}

export interface LoadedSkills {
  provider: SkillProvider;
  /** Prompt catalog (descriptions only), or "" when no skills exist. */
  catalog: string;
  metas: SkillMeta[];
  /** Richer per-skill info for display (name/description/scope/path). */
  infos: SkillInfo[];
}

/** Parse skill text (optional frontmatter + body). Returns null if there's no usable content. */
export function parseSkill(text: string, fallbackName: string): ParsedSkill | null {
  let name = fallbackName;
  let description = "";
  let body = text;

  const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (fm) {
    body = fm[2] ?? "";
    for (const line of (fm[1] ?? "").split(/\r?\n/)) {
      const m = line.match(/^([A-Za-z_][A-Za-z0-9_-]*)\s*:\s*(.*)$/);
      if (!m) continue;
      const key = m[1]!.toLowerCase();
      const value = stripQuotes((m[2] ?? "").trim());
      if (key === "name" && value) name = value;
      else if (key === "description" && value) description = value;
    }
  }

  body = body.trim();
  if (!description) description = firstLine(body) || name;
  if (!body) return null;
  return { name, description, body };
}

/** Internal: a parsed skill plus where it came from. */
type LoadedSkillRecord = ParsedSkill & { scope: SkillScope; path: string };

/** Load + merge skills from global then project dirs (project wins on name collision). */
export async function loadSkills(workspaceRoot: string): Promise<LoadedSkills> {
  const byName = new Map<string, LoadedSkillRecord>();
  const dirs: [string, SkillScope][] = [
    [globalSkillsDir(), "global"],
    [projectSkillsDir(workspaceRoot), "project"],
  ];
  for (const [dir, scope] of dirs) {
    for (const skill of await readSkillsDir(dir, scope)) byName.set(skill.name, skill); // later dir overrides
  }

  const skills = [...byName.values()];
  const metas: SkillMeta[] = skills.map((s) => ({ name: s.name, description: s.description }));
  const infos: SkillInfo[] = skills.map((s) => ({ name: s.name, description: s.description, scope: s.scope, path: s.path }));
  const provider: SkillProvider = {
    list: () => metas,
    load: async (name) => byName.get(name)?.body ?? null,
  };
  return { provider, catalog: skillCatalog(metas), metas, infos };
}

/** Read every skill in one directory: `<name>/SKILL.md` dirs and flat `<name>.md` files. */
async function readSkillsDir(dir: string, scope: SkillScope): Promise<LoadedSkillRecord[]> {
  let entries: import("node:fs").Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return []; // missing dir → no skills
  }

  const out: LoadedSkillRecord[] = [];
  for (const entry of entries) {
    let path: string | null = null;
    let fallback = entry.name;
    if (entry.isDirectory()) {
      path = join(dir, entry.name, "SKILL.md");
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
      path = join(dir, entry.name);
      fallback = entry.name.replace(/\.md$/i, "");
    }
    if (!path) continue;
    const skill = await readSkillFile(path, fallback);
    if (skill) out.push({ ...skill, scope, path });
  }
  return out;
}

async function readSkillFile(path: string, fallbackName: string): Promise<ParsedSkill | null> {
  try {
    const file = Bun.file(path);
    if (!(await file.exists())) return null;
    return parseSkill(await file.text(), fallbackName);
  } catch {
    return null;
  }
}

function firstLine(text: string): string {
  for (const line of text.split(/\r?\n/)) {
    const t = line.replace(/^#+\s*/, "").trim();
    if (t) return t.length <= 200 ? t : t.slice(0, 197) + "...";
  }
  return "";
}

function stripQuotes(s: string): string {
  return s.replace(/^["']|["']$/g, "");
}
