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

  test("abort kills the whole process group and returns promptly", async () => {
    // A backgrounded child would (without group-kill) keep the stdout pipe open
    // and hang the read until it exits ~5s later. Group-kill must end it fast.
    const ac = new AbortController();
    const start = Date.now();
    const p = new DirectSandbox().exec(
      { cmd: ["/bin/bash", "-c", "sleep 5 & sleep 5; wait"], policy: { writablePaths: [], allowNetwork: false }, timeoutMs: 10_000 },
      ac.signal,
    );
    setTimeout(() => ac.abort(), 100);
    await expect(p).rejects.toThrow(/abort/i);
    expect(Date.now() - start).toBeLessThan(2000);
  });

  test("idle timeout kills a quiet command (and reports it)", async () => {
    const start = Date.now();
    const r = await new DirectSandbox().exec(
      { cmd: ["/bin/bash", "-c", "sleep 3"], policy: { writablePaths: [], allowNetwork: false }, idleTimeoutMs: 300, timeoutMs: 10_000 },
      new AbortController().signal,
    );
    expect(r.timedOut).toBe(true);
    expect(r.timeoutReason).toBe("idle");
    expect(Date.now() - start).toBeLessThan(1500);
  });

  test("an actively-printing command is NOT idle-killed", async () => {
    const r = await new DirectSandbox().exec(
      {
        cmd: ["/bin/bash", "-c", "for i in 1 2 3 4 5 6; do echo $i; sleep 0.1; done"],
        policy: { writablePaths: [], allowNetwork: false },
        idleTimeoutMs: 400,
        timeoutMs: 10_000,
      },
      new AbortController().signal,
    );
    expect(r.timedOut).toBe(false);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("6");
  });

  test("streams output chunks via onOutput", async () => {
    const chunks: string[] = [];
    const r = await new DirectSandbox().exec(
      {
        cmd: ["/bin/bash", "-c", "echo hello; echo world"],
        policy: { writablePaths: [], allowNetwork: false },
        onOutput: (t) => chunks.push(t),
      },
      new AbortController().signal,
    );
    expect(chunks.join("")).toContain("hello");
    expect(chunks.join("")).toContain("world");
    expect(r.stdout).toContain("hello");
  });
});
