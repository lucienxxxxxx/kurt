import type { SessionMeta } from "../types.ts";

export interface SessionProject {
  workspace: string;
  label: string;
  sessions: SessionMeta[];
}

const MIN_PROJECT_SESSIONS = 3;

/** Build sidebar project groups from session workspaces. Full paths are the key;
 * labels start at the folder name and add parent segments only for collisions. */
export function buildSessionProjects(sessions: SessionMeta[]): SessionProject[] {
  const byWorkspace = new Map<string, SessionMeta[]>();
  for (const session of sessions) {
    const workspace = normalizePath(session.workspace);
    if (!workspace) continue;
    const bucket = byWorkspace.get(workspace) ?? [];
    bucket.push(session);
    byWorkspace.set(workspace, bucket);
  }

  const projects = [...byWorkspace.entries()]
    .filter(([, items]) => items.length >= MIN_PROJECT_SESSIONS)
    .map(([workspace, items]) => ({ workspace, label: "", sessions: items }));
  const labels = labelsFor(projects.map((p) => p.workspace));
  return projects
    .map((project) => ({ ...project, label: labels.get(project.workspace) ?? folderName(project.workspace) }))
    .sort((a, b) => b.sessions.length - a.sessions.length || a.label.localeCompare(b.label));
}

function labelsFor(paths: string[]): Map<string, string> {
  const byBase = new Map<string, string[]>();
  for (const path of paths) {
    const base = folderName(path);
    byBase.set(base, [...(byBase.get(base) ?? []), path]);
  }

  const labels = new Map<string, string>();
  for (const group of byBase.values()) {
    if (group.length === 1) {
      labels.set(group[0]!, folderName(group[0]!));
      continue;
    }
    const split = group.map((path) => ({ path, parts: pathParts(path) }));
    const maxDepth = Math.max(...split.map((x) => x.parts.length));
    for (let depth = 1; depth <= maxDepth; depth++) {
      const seen = new Set<string>();
      let unique = true;
      for (const item of split) {
        const label = compactLabel(item.parts.slice(-depth).join("/"));
        if (seen.has(label)) { unique = false; break; }
        seen.add(label);
      }
      if (unique || depth === maxDepth) {
        for (const item of split) labels.set(item.path, compactLabel(item.parts.slice(-depth).join("/")));
        break;
      }
    }
  }
  return labels;
}

function normalizePath(path: string | undefined): string {
  return (path ?? "").replace(/\/+$/g, "");
}

function folderName(path: string): string {
  const parts = pathParts(path);
  return parts.length ? parts[parts.length - 1]! : path;
}

function pathParts(path: string): string[] {
  return normalizePath(path).split("/").filter(Boolean);
}

function compactLabel(label: string): string {
  return label.length > 34 ? "..." + label.slice(-31) : label;
}
