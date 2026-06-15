/**
 * WorktreeManager — process-level isolation via `git worktree`.
 *
 * Each agent session can work in its OWN worktree (a separate working directory
 * sharing the repo's history) on its own branch, instead of all processes
 * fighting over one working dir. This is the foundation for safe parallel /
 * multi-agent work: "share repo history, not the working directory."
 *
 * Composition-layer infrastructure (like SessionWorkspace/sandbox): it shells out
 * to `git` via Bun.spawn. The engine knows nothing about it.
 */

import { basename } from "node:path";

export interface WorktreeInfo {
  /** Absolute path to the worktree's working dir. */
  path: string;
  /** Checked-out branch (e.g. "kurt/abc123"), or "" if detached. */
  branch: string;
  /** HEAD commit SHA. */
  head: string;
}

/** Outcome of pruning one managed worktree. */
export interface PruneEntry {
  branch: string;
  path: string;
  action: "removed" | "kept";
  reason: string;
}

export class WorktreeManager {
  #repoRoot: string;

  constructor(repoRoot: string) {
    this.#repoRoot = repoRoot;
  }

  get repoRoot(): string {
    return this.#repoRoot;
  }

  /** A short, filesystem-safe name for the repo (for naming worktree dirs). */
  get repoName(): string {
    return basename(this.#repoRoot);
  }

  /** Resolve the git repo root that contains `dir`, or null if `dir` isn't in one. */
  static async repoRoot(dir: string): Promise<string | null> {
    const r = await git(["rev-parse", "--show-toplevel"], dir);
    return r.code === 0 && r.stdout.length > 0 ? r.stdout : null;
  }

  /** Create a worktree at `path` on a NEW branch `branch` (from `base`, default HEAD). */
  async create(opts: { path: string; branch: string; base?: string }): Promise<WorktreeInfo> {
    const args = ["worktree", "add", "-b", opts.branch, opts.path];
    if (opts.base) args.push(opts.base);
    const r = await git(args, this.#repoRoot);
    if (r.code !== 0) {
      throw new Error(`git worktree add failed: ${r.stderr || r.stdout}`);
    }
    const head = await git(["rev-parse", "HEAD"], opts.path);
    return { path: opts.path, branch: opts.branch, head: head.stdout };
  }

  /** All worktrees of this repo (parsed from `git worktree list --porcelain`). */
  async list(): Promise<WorktreeInfo[]> {
    const r = await git(["worktree", "list", "--porcelain"], this.#repoRoot);
    if (r.code !== 0) return [];
    const out: WorktreeInfo[] = [];
    let cur: Partial<WorktreeInfo> = {};
    for (const line of r.stdout.split("\n")) {
      if (line.startsWith("worktree ")) cur = { path: line.slice("worktree ".length) };
      else if (line.startsWith("HEAD ")) cur.head = line.slice("HEAD ".length);
      else if (line.startsWith("branch ")) cur.branch = line.slice("branch ".length).replace(/^refs\/heads\//, "");
      else if (line.trim() === "") {
        if (cur.path) out.push({ path: cur.path, branch: cur.branch ?? "", head: cur.head ?? "" });
        cur = {};
      }
    }
    if (cur.path) out.push({ path: cur.path, branch: cur.branch ?? "", head: cur.head ?? "" });
    return out;
  }

  /** True if the worktree has uncommitted changes (tracked or untracked). */
  async isDirty(worktreePath: string): Promise<boolean> {
    const r = await git(["status", "--porcelain"], worktreePath);
    return r.stdout.trim().length > 0;
  }

  /**
   * Stage everything in the worktree and commit it to its branch. Returns true if
   * a commit was made, false if there was nothing to commit. Never touches other
   * branches. Falls back to a "kurt" identity if the repo has none configured.
   */
  async commitAll(worktreePath: string, message: string): Promise<boolean> {
    if (!(await this.isDirty(worktreePath))) return false;
    const add = await git(["add", "-A"], worktreePath);
    if (add.code !== 0) throw new Error(`git add failed: ${add.stderr || add.stdout}`);

    let commit = await git(["commit", "-m", message], worktreePath);
    if (commit.code !== 0 && /user\.(name|email)|tell me who you are/i.test(commit.stderr)) {
      // No git identity configured — commit under a kurt fallback identity.
      commit = await git(
        ["-c", "user.name=kurt", "-c", "user.email=kurt@localhost", "commit", "-m", message],
        worktreePath,
      );
    }
    if (commit.code !== 0) {
      if (/nothing to commit/i.test(commit.stdout + commit.stderr)) return false;
      throw new Error(`git commit failed: ${commit.stderr || commit.stdout}`);
    }
    return true;
  }

  /** Remove a worktree's working dir (its branch is left intact). */
  async remove(worktreePath: string, opts: { force?: boolean } = {}): Promise<void> {
    const args = ["worktree", "remove"];
    if (opts.force) args.push("--force");
    args.push(worktreePath);
    const r = await git(args, this.#repoRoot);
    if (r.code !== 0) throw new Error(`git worktree remove failed: ${r.stderr || r.stdout}`);
  }

  /** The branch checked out at the repo root (the integration target), or "". */
  async currentBranch(): Promise<string> {
    const r = await git(["rev-parse", "--abbrev-ref", "HEAD"], this.#repoRoot);
    return r.code === 0 ? r.stdout : "";
  }

  /** True if `branch` is fully contained in `base` (deleting it would lose nothing). */
  async isMerged(branch: string, base: string): Promise<boolean> {
    const r = await git(["merge-base", "--is-ancestor", branch, base], this.#repoRoot);
    return r.code === 0;
  }

  /** Delete a branch (`-d` refuses unmerged; `force` uses `-D`). */
  async deleteBranch(branch: string, force = false): Promise<void> {
    const r = await git(["branch", force ? "-D" : "-d", branch], this.#repoRoot);
    if (r.code !== 0) throw new Error(`git branch delete failed: ${r.stderr || r.stdout}`);
  }

  /** kurt-managed worktrees (branch under `prefix`), excluding the main worktree. */
  async listManaged(prefix = "kurt/"): Promise<WorktreeInfo[]> {
    return (await this.list()).filter((w) => w.branch.startsWith(prefix) && w.path !== this.#repoRoot);
  }

  /**
   * Remove kurt-managed worktrees whose branch is merged into `base` and clean —
   * the safe ones (no work lost). Dirty or unmerged ones are kept and reported,
   * so this can never discard unintegrated work.
   */
  async pruneManaged(opts: { base?: string; prefix?: string } = {}): Promise<PruneEntry[]> {
    const prefix = opts.prefix ?? "kurt/";
    const base = opts.base || (await this.currentBranch());
    const report: PruneEntry[] = [];
    for (const wt of await this.listManaged(prefix)) {
      const entry = { branch: wt.branch, path: wt.path };
      if (await this.isDirty(wt.path)) {
        report.push({ ...entry, action: "kept", reason: "uncommitted changes" });
        continue;
      }
      if (base && !(await this.isMerged(wt.branch, base))) {
        report.push({ ...entry, action: "kept", reason: `not merged into ${base}` });
        continue;
      }
      try {
        await this.remove(wt.path);
        await this.deleteBranch(wt.branch);
        report.push({ ...entry, action: "removed", reason: base ? `merged into ${base}` : "removed" });
      } catch (err) {
        report.push({ ...entry, action: "kept", reason: err instanceof Error ? err.message : String(err) });
      }
    }
    return report;
  }
}

/** Run a git command; capture exit code + trimmed stdout/stderr. Never throws. */
async function git(args: string[], cwd?: string): Promise<{ code: number; stdout: string; stderr: string }> {
  try {
    const proc = Bun.spawn(["git", ...args], {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    });
    const [stdout, stderr] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
    const code = await proc.exited;
    return { code, stdout: stdout.trim(), stderr: stderr.trim() };
  } catch (err) {
    return { code: 127, stdout: "", stderr: err instanceof Error ? err.message : String(err) };
  }
}
