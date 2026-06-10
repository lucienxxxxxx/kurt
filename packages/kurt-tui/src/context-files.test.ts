import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadContextPrelude } from "./context-files.ts";

let home: string;
let ws: string;
const savedHome = process.env.KURT_HOME;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "kurt-home-"));
  ws = mkdtempSync(join(tmpdir(), "kurt-ws-"));
  process.env.KURT_HOME = home;
});
afterEach(() => {
  if (savedHome === undefined) delete process.env.KURT_HOME;
  else process.env.KURT_HOME = savedHome;
  rmSync(home, { recursive: true, force: true });
  rmSync(ws, { recursive: true, force: true });
});

describe("loadContextPrelude", () => {
  test("returns empty when no context files exist", async () => {
    expect(await loadContextPrelude(ws)).toBe("");
  });

  test("includes global memory and project rules when present", async () => {
    writeFileSync(join(home, "memory.md"), "remember: prefer Bun");
    mkdirSync(join(ws, ".kurt"), { recursive: true });
    writeFileSync(join(ws, ".kurt", "rules.md"), "always run the gate");

    const prelude = await loadContextPrelude(ws);
    expect(prelude).toContain("# Memory (global)");
    expect(prelude).toContain("prefer Bun");
    expect(prelude).toContain("# Project rules");
    expect(prelude).toContain("always run the gate");
  });

  test("ignores empty files", async () => {
    writeFileSync(join(home, "memory.md"), "   \n  ");
    expect(await loadContextPrelude(ws)).toBe("");
  });
});
