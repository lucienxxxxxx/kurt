import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { atomicWrite } from "./fs-atomic.ts";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "kurt-atomic-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("atomicWrite", () => {
  test("writes a file and reads back identical content", async () => {
    const p = join(dir, "a.json");
    await atomicWrite(p, '{"x":1}');
    expect(await Bun.file(p).text()).toBe('{"x":1}');
  });

  test("overwrites existing content", async () => {
    const p = join(dir, "a.txt");
    await atomicWrite(p, "old");
    await atomicWrite(p, "new");
    expect(await Bun.file(p).text()).toBe("new");
  });

  test("creates parent directories", async () => {
    const p = join(dir, "nested", "deep", "f.txt");
    await atomicWrite(p, "hi");
    expect(await Bun.file(p).text()).toBe("hi");
  });

  test("leaves no .tmp file behind", async () => {
    const p = join(dir, "a.txt");
    await atomicWrite(p, "x");
    expect(readdirSync(dir)).toEqual(["a.txt"]);
  });

  test("concurrent writes all complete and the file ends valid (never torn)", async () => {
    const p = join(dir, "race.json");
    await Promise.all(Array.from({ length: 20 }, (_, i) => atomicWrite(p, JSON.stringify({ n: i }))));
    const parsed = JSON.parse(await Bun.file(p).text()) as { n: number };
    expect(parsed.n).toBeGreaterThanOrEqual(0); // a complete, parseable JSON — not a half-written blob
    expect(readdirSync(dir).filter((f) => f.endsWith(".tmp"))).toEqual([]);
  });
});
