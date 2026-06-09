import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Allowlist } from "./allowlist.ts";

const wsRoot = join(tmpdir(), `kurt-allow-${process.pid}`);
afterEach(() => rmSync(wsRoot, { recursive: true, force: true }));

describe("Allowlist", () => {
  test("missing file → empty", async () => {
    const a = await Allowlist.load(wsRoot);
    expect(a.has("rm")).toBe(false);
    expect(a.keys()).toEqual([]);
  });

  test("add persists to <ws>/.kurt/allowlist.json and reloads", async () => {
    const a = await Allowlist.load(wsRoot);
    await a.add("rm");
    expect(a.has("rm")).toBe(true);
    expect(existsSync(join(wsRoot, ".kurt", "allowlist.json"))).toBe(true);

    const reloaded = await Allowlist.load(wsRoot);
    expect(reloaded.has("rm")).toBe(true);
  });
});
