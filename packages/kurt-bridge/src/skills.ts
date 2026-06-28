/**
 * Skill discovery for the desktop bridge. It reads well-known local agent skill
 * directories, exposes a display list for the app, and backs the `skill` tool
 * used by the runtime's progressive-disclosure catalog.
 */

import { readdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join, relative } from "node:path";
import { kurtHome, skillCatalog, type SkillMeta, type SkillProvider } from "kurt-agent";

export interface ParsedSkill {
  name: string;
  description: string;
  body: string;
}

export type SkillScope = "global" | "project" | "codex" | "agents" | "claude" | "custom";

export interface SkillInfo {
  /** Unique id/name accepted by the `skill` tool. */
  name: string;
  /** Original name from frontmatter or folder/file fallback. */
  displayName: string;
  description: string;
  scope: SkillScope;
  source: string;
  path: string;
}

export interface LoadedSkills {
  provider: SkillProvider;
  catalog: string;
  metas: SkillMeta[];
  infos: SkillInfo[];
}

type SkillSource = { dir: string; scope: SkillScope; source: string; recursive?: boolean };
type LoadedSkillRecord = ParsedSkill & { scope: SkillScope; source: string; path: string };

const MAX_RECURSION_DEPTH = 8;
const MAX_SKILL_FILES = 700;
const SKIP_DIRS = new Set([".git", "node_modules", "dist", "build", "target", ".next", ".vite"]);

export function parseSkill(text: string, fallbackName: string): ParsedSkill | null {
  let name = fallbackName;
  let description = "";
  let body = text;

  const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (fm) {
    body = fm[2] ?? "";
    const fields = parseFrontmatter(fm[1] ?? "");
    if (fields.name) name = fields.name;
    if (fields.description) description = fields.description;
  }

  body = body.trim();
  if (!description) description = firstLine(body) || name;
  if (!body) return null;
  return { name, description, body };
}

export async function loadSkills(workspaceRoot: string): Promise<LoadedSkills> {
  const records: LoadedSkillRecord[] = [];
  for (const source of skillSources(workspaceRoot)) records.push(...await readSkillsFromSource(source));

  const named = disambiguate(records);
  const metas: SkillMeta[] = named.map((s) => ({ name: s.name, description: `${s.description} (${s.source})` }));
  const bodyByName = new Map(named.map((s) => [s.name, s.body]));
  const infos: SkillInfo[] = named.map(({ body: _body, ...info }) => info);
  const provider: SkillProvider = {
    list: () => metas,
    load: async (name) => bodyByName.get(name) ?? null,
  };
  return { provider, catalog: skillCatalog(metas), metas, infos };
}

function skillSources(workspaceRoot: string): SkillSource[] {
  const home = homedir();
  const custom = (process.env.KURT_SKILL_PATHS ?? "")
    .split(":")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((dir): SkillSource => ({ dir, scope: "custom", source: "custom", recursive: true }));
  return [
    { dir: join(kurtHome(), "skills"), scope: "global", source: "Kurt" },
    { dir: join(workspaceRoot, ".kurt", "skills"), scope: "project", source: "Project" },
    { dir: join(home, ".codex", "skills"), scope: "codex", source: "Codex", recursive: true },
    { dir: join(home, ".codex", "plugins", "cache"), scope: "codex", source: "Codex plugins", recursive: true },
    { dir: join(home, ".agents", "skills"), scope: "agents", source: "Agents", recursive: true },
    { dir: join(home, ".claude", "skills"), scope: "claude", source: "Claude", recursive: true },
    ...custom,
  ];
}

async function readSkillsFromSource(source: SkillSource): Promise<LoadedSkillRecord[]> {
  const paths = source.recursive ? await findSkillFiles(source.dir) : await directSkillFiles(source.dir);
  const out: LoadedSkillRecord[] = [];
  for (const path of paths) {
    const fallback = fallbackName(source.dir, path);
    const skill = await readSkillFile(path, fallback);
    if (skill) out.push({ ...skill, scope: source.scope, source: source.source, path });
  }
  return out;
}

async function directSkillFiles(dir: string): Promise<string[]> {
  let entries: import("node:fs").Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  const out: string[] = [];
  for (const entry of entries) {
    if (entry.isDirectory()) out.push(join(dir, entry.name, "SKILL.md"));
    else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) out.push(join(dir, entry.name));
  }
  return out;
}

async function findSkillFiles(root: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > MAX_RECURSION_DEPTH || out.length >= MAX_SKILL_FILES) return;
    let entries: import("node:fs").Dirent[];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (out.length >= MAX_SKILL_FILES) return;
      const path = join(dir, entry.name);
      if (entry.isFile() && entry.name === "SKILL.md") out.push(path);
      else if (depth === 0 && entry.isFile() && entry.name.toLowerCase().endsWith(".md")) out.push(path);
      else if (entry.isDirectory() && !SKIP_DIRS.has(entry.name)) await walk(path, depth + 1);
    }
  }
  await walk(root, 0);
  return out;
}

async function readSkillFile(path: string, fallbackName: string): Promise<ParsedSkill | null> {
  try {
    return parseSkill(await readFile(path, "utf8"), fallbackName);
  } catch {
    return null;
  }
}

function disambiguate(records: LoadedSkillRecord[]): (SkillInfo & { body: string })[] {
  const counts = new Map<string, number>();
  for (const rec of records) counts.set(rec.name, (counts.get(rec.name) ?? 0) + 1);
  const used = new Set<string>();
  return records.map((rec) => {
    let name = rec.name;
    if ((counts.get(rec.name) ?? 0) > 1) name = `${sourceSlug(rec.source)}:${rec.name}`;
    let unique = name;
    let n = 2;
    while (used.has(unique)) unique = `${name}-${n++}`;
    used.add(unique);
    return { name: unique, displayName: rec.name, description: rec.description, body: rec.body, scope: rec.scope, source: rec.source, path: rec.path };
  }).sort((a, b) => a.name.localeCompare(b.name));
}

function fallbackName(root: string, path: string): string {
  if (basename(path).toLowerCase() === "skill.md") return basename(dirname(path));
  const rel = relative(root, path);
  return rel.replace(/\.md$/i, "").split(/[\\/]/).filter(Boolean).join(":") || basename(path, ".md");
}

function parseFrontmatter(text: string): { name?: string; description?: string } {
  const out: { name?: string; description?: string } = {};
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i]!.match(/^([A-Za-z_][A-Za-z0-9_-]*)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1]!.toLowerCase();
    let value = stripQuotes((m[2] ?? "").trim());
    if ((value === ">" || value === ">-" || value === "|" || value === "|-") && key === "description") {
      const parts: string[] = [];
      while (i + 1 < lines.length && /^\s+/.test(lines[i + 1]!)) parts.push(lines[++i]!.trim());
      value = parts.join(" ").trim();
    }
    if (key === "name" && value) out.name = value;
    else if (key === "description" && value) out.description = value;
  }
  return out;
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

function sourceSlug(source: string): string {
  return source.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "skill";
}
