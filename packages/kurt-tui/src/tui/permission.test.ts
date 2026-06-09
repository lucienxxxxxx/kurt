import { afterEach, describe, expect, test } from "bun:test";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Allowlist } from "../allowlist.ts";
import { PermissionBridge } from "./permission.ts";

const wsRoot = join(tmpdir(), `kurt-perm-${process.pid}`);
afterEach(() => rmSync(wsRoot, { recursive: true, force: true }));

const req = (key = "rm") => ({ key, title: "rm — delete files", command: "rm -rf x", explanation: "e", risk: "r" });

describe("PermissionBridge", () => {
  test("whitelisted key auto-allows without a prompt", async () => {
    const al = await Allowlist.load(wsRoot);
    await al.add("rm");
    const bridge = new PermissionBridge(al);
    expect(await bridge.request(req())).toBe("allow");
    expect(bridge.getSnapshot()).toBeNull();
  });

  test("deny resolves 'deny' and clears the pending prompt", async () => {
    const bridge = new PermissionBridge(await Allowlist.load(wsRoot));
    let notified = 0;
    bridge.subscribe(() => notified++);
    const p = bridge.request(req("sudo"));
    expect(bridge.getSnapshot()?.key).toBe("sudo");
    bridge.decide("deny");
    expect(await p).toBe("deny");
    expect(bridge.getSnapshot()).toBeNull();
    expect(notified).toBeGreaterThanOrEqual(2); // set + clear
  });

  test("'always' allows, persists, and auto-allows next time", async () => {
    const al = await Allowlist.load(wsRoot);
    const bridge = new PermissionBridge(al);
    const p = bridge.request(req("rm"));
    bridge.decide("always");
    expect(await p).toBe("allow");
    expect(al.has("rm")).toBe(true);
    expect(await bridge.request(req("rm"))).toBe("allow"); // no new prompt
    expect(bridge.getSnapshot()).toBeNull();
  });
});
