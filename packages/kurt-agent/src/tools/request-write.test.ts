import { describe, expect, test } from "bun:test";
import { RequestWriteAccessTool } from "./request-write.ts";
import { allowAllPermission, denyAllPermission } from "../permission/index.ts";

const ctx = () => ({ signal: new AbortController().signal, toolCallId: "t", emit: () => {} });

describe("RequestWriteAccessTool", () => {
  test("accepts `directory` and grants on approval (adds to writable roots)", async () => {
    const writable: string[] = [];
    const tool = new RequestWriteAccessTool(writable, allowAllPermission);
    const res = await tool.execute({ directory: "/tmp/kurt-a" }, ctx());
    expect(res.isError).toBeFalsy();
    expect(writable).toContain("/tmp/kurt-a");
  });

  test("accepts `path` as an alias for `directory`", async () => {
    const writable: string[] = [];
    const tool = new RequestWriteAccessTool(writable, allowAllPermission);
    const res = await tool.execute({ path: "/tmp/kurt-b" }, ctx());
    expect(res.isError).toBeFalsy();
    expect(writable).toContain("/tmp/kurt-b");
  });

  test("deny → error, not granted", async () => {
    const writable: string[] = [];
    const tool = new RequestWriteAccessTool(writable, denyAllPermission);
    const res = await tool.execute({ path: "/tmp/kurt-c" }, ctx());
    expect(res.isError).toBe(true);
    expect(writable).not.toContain("/tmp/kurt-c");
  });

  test("missing directory/path → invalid", async () => {
    const tool = new RequestWriteAccessTool([], allowAllPermission);
    const res = await tool.execute({}, ctx());
    expect(res.isError).toBe(true);
  });
});
