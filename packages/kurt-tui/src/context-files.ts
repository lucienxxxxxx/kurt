/**
 * Optional context files preloaded into the system prompt (read-only for now):
 *   - global memory: ~/.kurt/memory.md
 *   - project rules: <workspace>/.kurt/rules.md
 *
 * The agent WRITING memory is a later round; this just injects what's there.
 * Reading files is I/O, so this is composition-layer code (not the engine, not
 * the pure `systemPrompt`).
 */

import { globalMemoryPath, projectMemoryPath, projectRulesPath } from "./paths.ts";

/** Build a system-prompt prelude from any present context files (or ""). */
export async function loadContextPrelude(workspaceRoot: string): Promise<string> {
  const parts: string[] = [];
  const globalMem = await readIfPresent(globalMemoryPath());
  if (globalMem) parts.push(`# Memory (global)\nYour long-term notes across all projects. Honor them.\n\n${globalMem}`);
  const projectMem = await readIfPresent(projectMemoryPath(workspaceRoot));
  if (projectMem) parts.push(`# Memory (project)\nYour long-term notes for this workspace. Honor them.\n\n${projectMem}`);
  const rules = await readIfPresent(projectRulesPath(workspaceRoot));
  if (rules) parts.push(`# Project rules (.kurt/rules.md)\nProject-specific instructions. Follow them.\n\n${rules}`);
  return parts.length > 0 ? "\n\n" + parts.join("\n\n") : "";
}

async function readIfPresent(path: string): Promise<string | null> {
  const file = Bun.file(path);
  if (!(await file.exists())) return null;
  const text = (await file.text()).trim();
  return text.length > 0 ? text : null;
}
