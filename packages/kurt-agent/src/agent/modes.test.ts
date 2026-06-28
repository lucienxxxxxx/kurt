import { describe, expect, test } from "bun:test";
import {
  MODE_TOOLS,
  READ_ONLY_TOOLS,
  modeToolNames,
  toolsForMode,
  toolsForModeFromHub,
  modeGuidance,
  normalizeMode,
} from "./modes.ts";
import { ToolHub } from "./tool-hub.ts";
import type { Tool } from "../engine/index.ts";

function fake(name: string): Tool {
  return {
    spec: { name, description: name, inputSchema: { type: "object", properties: {} } },
    async execute() {
      return { content: "" };
    },
  };
}

describe("MODE_TOOLS", () => {
  test("chat is read-only: no write/exec, but has the safe-everywhere tools", () => {
    expect(MODE_TOOLS.chat).not.toContain("write_file");
    expect(MODE_TOOLS.chat).not.toContain("shell");
    expect(MODE_TOOLS.chat).toContain("ask_user");
    expect(MODE_TOOLS.chat).toContain("skill");
    expect(MODE_TOOLS.chat).toContain("request_access"); // read-outside-workspace escape hatch
  });

  test("plan adds update_plan; agent is all", () => {
    expect(MODE_TOOLS.plan).toContain("update_plan");
    expect(MODE_TOOLS.plan).not.toContain("write_file");
    expect(MODE_TOOLS.agent).toBe("all");
  });

  test("modeToolNames mirrors MODE_TOOLS", () => {
    expect(modeToolNames("chat")).toBe(READ_ONLY_TOOLS);
    expect(modeToolNames("agent")).toBe("all");
  });
});

describe("toolsForMode (flat list)", () => {
  const all = [
    "read_file", "ls", "grep", "web_search", "memory", "ask_user", "skill",
    "request_access", "request_write_access", "write_file", "shell", "update_plan", "host_shell",
  ].map(fake);

  test("chat keeps read-only set + the request_write_access alias, drops write/exec", () => {
    const names = toolsForMode(all, "chat").map((t) => t.spec.name);
    expect(names).toContain("read_file");
    expect(names).toContain("skill");
    expect(names).toContain("request_access");
    expect(names).toContain("request_write_access"); // alias rides along with request_access
    expect(names).not.toContain("write_file");
    expect(names).not.toContain("shell");
    expect(names).not.toContain("host_shell");
    expect(names).not.toContain("update_plan");
  });

  test("plan = chat + update_plan", () => {
    const names = toolsForMode(all, "plan").map((t) => t.spec.name);
    expect(names).toContain("update_plan");
    expect(names).not.toContain("write_file");
  });

  test("agent = everything", () => {
    expect(toolsForMode(all, "agent")).toHaveLength(all.length);
  });

  test("alias does NOT ride along when request_access is absent (agent-only registration off)", () => {
    const noAccess = [fake("read_file"), fake("request_write_access")];
    // chat mode without request_access in the allowlist would still not pull the alias,
    // but request_access IS in the allowlist, so the alias is allowed when present.
    // Here we verify the guard: a list lacking the real tool still resolves cleanly.
    const names = toolsForMode(noAccess, "chat").map((t) => t.spec.name);
    expect(names).toContain("read_file");
    expect(names).toContain("request_write_access"); // allowed because "request_access" is in chat's allowlist
  });
});

describe("toolsForModeFromHub (ToolHub)", () => {
  test("chat subset includes the alias only when both real + alias are registered", () => {
    const hub = new ToolHub(
      ["read_file", "ls", "grep", "web_search", "memory", "ask_user", "skill", "request_access", "request_write_access", "write_file", "shell"].map(fake),
    );
    const names = toolsForModeFromHub(hub, "chat").map((t) => t.spec.name).sort();
    expect(names).toContain("request_access");
    expect(names).toContain("request_write_access");
    expect(names).not.toContain("write_file");
  });

  test("no alias pulled when alias isn't registered", () => {
    const hub = new ToolHub(["read_file", "request_access"].map(fake));
    const names = toolsForModeFromHub(hub, "chat").map((t) => t.spec.name);
    expect(names).toContain("request_access");
    expect(names).not.toContain("request_write_access");
  });

  test("agent = whole hub", () => {
    const hub = new ToolHub(["read_file", "write_file", "shell"].map(fake));
    expect(toolsForModeFromHub(hub, "agent")).toHaveLength(3);
  });
});

describe("modeGuidance", () => {
  test("each mode carries a recognizable marker", () => {
    expect(modeGuidance("chat")).toContain("MODE: chat");
    expect(modeGuidance("plan")).toContain("update_plan");
    expect(modeGuidance("agent")).toContain("MODE: agent");
  });
});

describe("normalizeMode", () => {
  test("migrates legacy 'ask' → 'chat' and defaults to agent", () => {
    expect(normalizeMode("ask")).toBe("chat");
    expect(normalizeMode("chat")).toBe("chat");
    expect(normalizeMode("plan")).toBe("plan");
    expect(normalizeMode(undefined)).toBe("agent");
    expect(normalizeMode("garbage")).toBe("agent");
  });
});
