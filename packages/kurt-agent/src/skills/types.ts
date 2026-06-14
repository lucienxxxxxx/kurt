/**
 * Skills — progressive-disclosure context injection (Phase 5, CLAUDE.md §5/§8).
 *
 * A Skill is NOT a Tool and NOT an engine concept: it's a reusable *procedure*
 * (instructions) injected into context on demand. Only each skill's name +
 * description are preloaded (the catalog in the system prompt); the full body is
 * pulled in only when the model calls the `skill` tool. The mechanism is
 * orchestration-layer — the engine never learns skills exist.
 *
 * Reading skill files is I/O, so it lives behind this injected `SkillProvider`
 * (mirrors `SearchProvider`/`AskProvider`); the front-end implements it.
 */

export interface SkillMeta {
  /** Stable identifier the model passes to the `skill` tool. */
  name: string;
  /** One-line summary — preloaded so the model knows when to reach for the skill. */
  description: string;
}

export interface SkillProvider {
  /** Lightweight metadata for every available skill (drives the catalog + tool enum). */
  list(): SkillMeta[];
  /** Full instructions for one skill, or null if the name is unknown. */
  load(name: string): Promise<string | null>;
}
