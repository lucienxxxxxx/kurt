import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Message } from "kurt-agent";
import { SessionStore } from "./session-store.ts";

let dir: string;
let store: SessionStore;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "kurt-sessions-"));
  store = new SessionStore(dir);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const userMsg = (text: string): Message => ({ role: "user", content: [{ type: "text", text }] });

describe("SessionStore", () => {
  test("create → save → load round-trips messages and metadata", async () => {
    const rec = store.create("/ws/a", "deepseek-v4-flash");
    rec.title = "hello world";
    rec.messages = [userMsg("hi"), userMsg("again")];
    await store.save(rec);

    const back = await store.load(rec.id);
    expect(back).not.toBeNull();
    expect(back!.title).toBe("hello world");
    expect(back!.messages).toHaveLength(2);
    expect(back!.messageCount).toBe(2);
    expect(back!.workspace).toBe("/ws/a");
  });

  test("list filters by workspace and sorts newest first", async () => {
    const a1 = store.create("/ws/a", "m");
    a1.messages = [userMsg("a1")];
    await store.save(a1);
    const b1 = store.create("/ws/b", "m");
    await store.save(b1);
    const a2 = store.create("/ws/a", "m");
    await store.save(a2); // saved last → newest

    const aOnly = await store.list("/ws/a");
    expect(aOnly.map((m) => m.id)).toEqual([a2.id, a1.id]); // newest first, /ws/b excluded
    expect((await store.list()).length).toBe(3); // unfiltered sees all
  });

  test("remove deletes a session; load then returns null", async () => {
    const rec = store.create("/ws", "m");
    await store.save(rec);
    await store.remove(rec.id);
    expect(await store.load(rec.id)).toBeNull();
    expect(await store.list("/ws")).toHaveLength(0);
  });

  test("list returns empty when the dir doesn't exist yet", async () => {
    const fresh = new SessionStore(join(dir, "nope"));
    expect(await fresh.list()).toEqual([]);
  });
});
