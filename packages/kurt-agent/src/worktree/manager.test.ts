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
});
