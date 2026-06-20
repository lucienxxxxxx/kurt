import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listDir, readTextFile, resolveInWorkspace } from "./fs.ts";

let ws = "";
beforeEach(() => {
  ws = realpathSync(mkdtempSync(join(tmpdir(), "kurt-fs-")));
  mkdirSync(join(ws, "src"));
  writeFileSync(join(ws, "src", "a.ts"), "export const a = 1;\n");
  writeFileSync(join(ws, "README.md"), "# Hi\n");
});
afterEach(() => { if (ws) rmSync(ws, { recursive: true, force: true }); });

describe("workspace fs", () => {
  test("listDir returns dirs first, then files (relative paths)", async () => {
    const listing = await listDir(ws, "");
    expect(listing).not.toBeNull();
    expect(listing!.entries.map((e) => e.name)).toEqual(["src", "README.md"]);
    expect(listing!.entries[0]).toMatchObject({ name: "src", dir: true, path: "src" });
  });

  test("listDir can recurse into a subdir by relative path", async () => {
    const listing = await listDir(ws, "src");
    expect(listing!.path).toBe("src");
    expect(listing!.entries.map((e) => e.name)).toEqual(["a.ts"]);
    expect(listing!.entries[0]!.path).toBe(join("src", "a.ts"));
  });

  test("readTextFile returns content", async () => {
    const f = await readTextFile(ws, "README.md");
    expect(f).toMatchObject({ content: "# Hi\n", truncated: false });
  });

  test("paths escaping the workspace are rejected", async () => {
    expect(resolveInWorkspace(ws, "../../etc/passwd")).toBeNull();
    expect(await listDir(ws, "../..")).toBeNull();
    expect(await readTextFile(ws, "../../etc/passwd")).toBeNull();
  });

  test("resolveInWorkspace allows the root and nested paths", () => {
    expect(resolveInWorkspace(ws, "")).toBe(realpathSync(ws));
    expect(resolveInWorkspace(ws, "src/a.ts")).toBe(join(realpathSync(ws), "src", "a.ts"));
  });
});
