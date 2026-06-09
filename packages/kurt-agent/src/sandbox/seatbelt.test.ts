/**
 * Phase 2 acceptance — the sandbox blocks unauthorized file access and network,
 * and enforces timeout + output truncation. Skipped automatically off macOS.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SeatbeltSandbox, DirectSandbox, buildProfile } from "./index.ts";

const onDarwin = process.platform === "darwin" && existsSync("/usr/bin/sandbox-exec");
const describeSeatbelt = onDarwin ? describe : describe.skip;

describe("buildProfile", () => {
  test("denies by default and opens only the requested writable subpaths", () => {
    const profile = buildProfile({ writablePaths: ["/some/dir"], allowNetwork: false });
    expect(profile).toContain("(deny default)");
    expect(profile).toContain('(allow file-write* (subpath "/some/dir"))');
    expect(profile).not.toContain("(allow network*)");
  });

  test("opens network only when granted", () => {
    expect(buildProfile({ writablePaths: [], allowNetwork: true })).toContain("(allow network*)");
  });
});

describeSeatbelt("SeatbeltSandbox (macOS)", () => {
  let work: string;
  const sandbox = new SeatbeltSandbox();
  const ac = new AbortController();

  beforeAll(() => {
    work = mkdtempSync(join(tmpdir(), "kurt-test-"));
  });
  afterAll(() => {
    rmSync(work, { recursive: true, force: true });
  });

  test("allows writing inside a granted path", async () => {
    const r = await sandbox.exec(
      { cmd: ["/bin/bash", "-c", `echo hi > ${work}/ok.txt`], policy: { writablePaths: [work], allowNetwork: false } },
      ac.signal,
    );
    expect(r.exitCode).toBe(0);
    expect(existsSync(join(work, "ok.txt"))).toBe(true);
  });

  test("blocks writing outside granted paths", async () => {
    const escape = join(tmpdir(), `kurt-escape-${Date.now()}.txt`);
    const r = await sandbox.exec(
      { cmd: ["/bin/bash", "-c", `echo nope > ${escape}`], policy: { writablePaths: [work], allowNetwork: false } },
      ac.signal,
    );
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr.toLowerCase()).toContain("not permitted");
    expect(existsSync(escape)).toBe(false);
  });

  test("blocks network when not granted", async () => {
    const r = await sandbox.exec(
      {
        cmd: ["/bin/bash", "-c", "exec 3<>/dev/tcp/1.1.1.1/80 && echo connected || echo blocked"],
        policy: { writablePaths: [work], allowNetwork: false },
        timeoutMs: 5000,
      },
      ac.signal,
    );
    expect(r.stdout.trim()).toBe("blocked");
  });

  test("enforces a timeout (SIGKILL)", async () => {
    const r = await sandbox.exec(
      { cmd: ["/bin/bash", "-c", "sleep 10"], policy: { writablePaths: [], allowNetwork: false }, timeoutMs: 500 },
      ac.signal,
    );
    expect(r.timedOut).toBe(true);
    expect(r.exitCode).toBeNull();
  });

  test("truncates output past the cap", async () => {
    const r = await sandbox.exec(
      {
        cmd: ["/bin/bash", "-c", "yes ABCDEFGH | head -c 100000"],
        policy: { writablePaths: [], allowNetwork: false },
        maxOutputBytes: 500,
      },
      ac.signal,
    );
    expect(r.truncated).toBe(true);
    expect(r.stdout.length).toBeLessThanOrEqual(500);
  });
});

describe("DirectSandbox", () => {
  test("runs a command with no isolation", async () => {
    const r = await new DirectSandbox().exec(
      { cmd: ["/bin/bash", "-c", "echo direct-ok"], policy: { writablePaths: [], allowNetwork: false } },
      new AbortController().signal,
    );
    expect(r.exitCode).toBe(0);
    expect(r.stdout.trim()).toBe("direct-ok");
  });
});
