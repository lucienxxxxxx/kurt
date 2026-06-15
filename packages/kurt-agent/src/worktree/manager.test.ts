/**
 * Integration tests for WorktreeManager — runs real `git` against a throwaway
 * repo in a temp dir. (git is assumed available; the project uses it heavily.)
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WorktreeManager } from "./manager.ts";

let repo: string;
let wtBase: string;

async function git(args: string[], cwd: string): Promise<void> {
  const p = Bun.spawn(["git", ...args], { cwd, stdout: "pipe", stderr: "pipe" });
  await p.exited;
}

beforeEach(async () => {
  // realpath so paths match git's canonicalized output (macOS /var → /private/var).
  repo = realpathSync(mkdtempSync(join(tmpdir(), "kurt-repo-")));
  wtBase = realpathSync(mkdtempSync(join(tmpdir(), "kurt-wt-")));
  await git(["init", "-q", "-b", "main"], repo);
  await git(["config", "user.name", "Test"], repo);
  await git(["config", "user.email", "test@local"], repo);
  writeFileSync(join(repo, "README.md"), "# repo\n");
  await git(["add", "-A"], repo);
  await git(["commit", "-qm", "init"], repo);
});
afterEach(() => {
  rmSync(repo, { recursive: true, force: true });
  rmSync(wtBase, { recursive: true, force: true });
});

describe("WorktreeManager", () => {
  test("repoRoot detects a repo and rejects a non-repo dir", async () => {
    expect(await WorktreeManager.repoRoot(repo)).toBe(repo);
    const plain = mkdtempSync(join(tmpdir(), "kurt-plain-"));
    try {
      expect(await WorktreeManager.repoRoot(plain)).toBeNull();
    } finally {
      rmSync(plain, { recursive: true, force: true });
    }
  });

  test("create makes an isolated worktree on a new branch; list sees it", async () => {
    const mgr = new WorktreeManager(repo);
    const path = join(wtBase, "sess-1");
    const info = await mgr.create({ path, branch: "kurt/sess-1" });
    expect(info.branch).toBe("kurt/sess-1");
    expect(existsSync(join(path, "README.md"))).toBe(true); // checked out from history

    const list = await mgr.list();
    expect(list.some((w) => w.path === path && w.branch === "kurt/sess-1")).toBe(true);
  });

  test("commitAll commits worktree changes to its branch only; main untouched", async () => {
    const mgr = new WorktreeManager(repo);
    const path = join(wtBase, "sess-2");
    await mgr.create({ path, branch: "kurt/sess-2" });

    expect(await mgr.commitAll(path, "kurt: nothing")).toBe(false); // clean → no commit

    writeFileSync(join(path, "new.txt"), "agent output\n");
    expect(await mgr.isDirty(path)).toBe(true);
    expect(await mgr.commitAll(path, "kurt: session work")).toBe(true);
    expect(await mgr.isDirty(path)).toBe(false);

    // The file exists on the branch's worktree, but NOT on main's working dir.
    expect(existsSync(join(path, "new.txt"))).toBe(true);
    expect(existsSync(join(repo, "new.txt"))).toBe(false);
  });

  test("remove deletes the worktree dir (branch stays)", async () => {
    const mgr = new WorktreeManager(repo);
    const path = join(wtBase, "sess-3");
    await mgr.create({ path, branch: "kurt/sess-3" });
    await mgr.remove(path, { force: true });
    expect(existsSync(path)).toBe(false);
    expect((await mgr.list()).some((w) => w.path === path)).toBe(false);
  });

  test("listManaged returns only kurt/* worktrees, excluding the main one", async () => {
    const mgr = new WorktreeManager(repo);
    await mgr.create({ path: join(wtBase, "m1"), branch: "kurt/m1" });
    const managed = await mgr.listManaged();
    expect(managed.map((w) => w.branch)).toEqual(["kurt/m1"]);
    expect(managed.some((w) => w.path === repo)).toBe(false); // never the main worktree
  });

  test("pruneManaged removes merged+clean worktrees but keeps unmerged ones", async () => {
    const mgr = new WorktreeManager(repo);

    // Worktree A: commit work, then merge its branch into main → safe to prune.
    const a = join(wtBase, "merged");
    await mgr.create({ path: a, branch: "kurt/merged" });
    writeFileSync(join(a, "a.txt"), "work\n");
    await mgr.commitAll(a, "work on A");
    await git(["merge", "--no-edit", "kurt/merged"], repo); // main now contains it

    // Worktree B: commit work, do NOT merge → must be kept.
    const b = join(wtBase, "unmerged");
    await mgr.create({ path: b, branch: "kurt/unmerged" });
    writeFileSync(join(b, "b.txt"), "work\n");
    await mgr.commitAll(b, "work on B");

    const report = await mgr.pruneManaged({ base: "main" });
    const byBranch = Object.fromEntries(report.map((e) => [e.branch, e]));
    expect(byBranch["kurt/merged"]?.action).toBe("removed");
    expect(byBranch["kurt/unmerged"]?.action).toBe("kept");
    expect(byBranch["kurt/unmerged"]?.reason).toContain("not merged");

    // The merged worktree + branch are gone; the unmerged one survives.
    expect(existsSync(a)).toBe(false);
    expect((await mgr.listManaged()).map((w) => w.branch)).toEqual(["kurt/unmerged"]);
  });
});
