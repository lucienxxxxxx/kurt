import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MarkdownMemoryStore } from "./markdown-store.ts";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "kurt-memory-store-"));
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("MarkdownMemoryStore", () => {
  test("reads missing scopes as empty and writes markdown files", async () => {
    const globalPath = join(dir, "global", "memory.md");
    const projectPath = join(dir, "project", ".kurt", "memory.md");
    const store = new MarkdownMemoryStore({ globalPath, projectPath });

    expect(store.supports("global")).toBe(true);
    expect(store.supports("project")).toBe(true);
    expect(await store.read("global")).toBe("");

    await store.write("project", "# Project\n- note\n");
    expect(await store.read("project")).toContain("note");
  });

  test("project scope is unavailable when no project path was supplied", async () => {
    const store = new MarkdownMemoryStore({ globalPath: join(dir, "memory.md") });

    expect(store.supports("global")).toBe(true);
    expect(store.supports("project")).toBe(false);
    await expect(store.write("project", "x")).rejects.toThrow("No project memory");
  });
});
