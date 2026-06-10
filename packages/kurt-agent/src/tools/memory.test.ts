import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MemoryTool } from "./memory.ts";

let dir: string;
let globalPath: string;
let projectPath: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "kurt-mem-"));
  globalPath = join(dir, "global", "memory.md");
  projectPath = join(dir, "proj", ".kurt", "memory.md");
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const ctx = () => ({ signal: new AbortController().signal, toolCallId: "t", emit: () => {} });

describe("MemoryTool", () => {
  test("view reports empty, append persists, view returns it", async () => {
    const tool = new MemoryTool({ globalPath, projectPath });
    expect((await tool.execute({ action: "view" }, ctx())).content).toContain("empty");
    await tool.execute({ action: "append", text: "- prefers Bun" }, ctx());
    expect((await tool.execute({ action: "view" }, ctx())).content).toContain("prefers Bun");
    expect(await Bun.file(globalPath).text()).toContain("prefers Bun");
  });

  test("appends accumulate as separate blocks; replace overwrites", async () => {
    const tool = new MemoryTool({ globalPath, projectPath });
    await tool.execute({ action: "append", text: "- one" }, ctx());
    await tool.execute({ action: "append", text: "- two" }, ctx());
    const after = await Bun.file(globalPath).text();
    expect(after).toContain("- one");
    expect(after).toContain("- two");

    await tool.execute({ action: "replace", text: "# fresh\n- only this" }, ctx());
    const replaced = await Bun.file(globalPath).text();
    expect(replaced).toContain("only this");
    expect(replaced).not.toContain("- one");
  });

  test("project scope writes the project file; missing project path errors", async () => {
    const withProject = new MemoryTool({ globalPath, projectPath });
    await withProject.execute({ action: "append", text: "- proj note", scope: "project" }, ctx());
    expect(await Bun.file(projectPath).text()).toContain("proj note");
    expect(await Bun.file(globalPath).exists()).toBe(false); // global untouched

    const noProject = new MemoryTool({ globalPath });
    const res = await noProject.execute({ action: "append", text: "x", scope: "project" }, ctx());
    expect(res.isError).toBe(true);
    expect(res.content).toContain("No project memory");
  });

  test("append beyond the cap is refused with a curate hint", async () => {
    const tool = new MemoryTool({ globalPath, projectPath, maxBytes: 100 });
    const res = await tool.execute({ action: "append", text: "x".repeat(200) }, ctx());
    expect(res.isError).toBe(true);
    expect(res.content).toContain("replace");
  });

  test("append/replace require non-empty text; bad action errors", async () => {
    const tool = new MemoryTool({ globalPath, projectPath });
    expect((await tool.execute({ action: "append" }, ctx())).isError).toBe(true);
    expect((await tool.execute({ action: "nope" }, ctx())).isError).toBe(true);
  });
});
