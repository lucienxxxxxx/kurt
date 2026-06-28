import { describe, expect, test } from "vitest";
import { buildSessionProjects } from "./projects.ts";
import type { SessionMeta } from "../types.ts";

const s = (id: string, workspace: string): SessionMeta => ({ id, title: id, icon: "chat", workspace });

describe("buildSessionProjects", () => {
  test("groups only workspaces with three or more sessions", () => {
    const projects = buildSessionProjects([
      s("a1", "/Users/me/komorebi"),
      s("a2", "/Users/me/komorebi"),
      s("a3", "/Users/me/komorebi"),
      s("b1", "/Users/me/other"),
      s("b2", "/Users/me/other"),
    ]);
    expect(projects).toHaveLength(1);
    expect(projects[0]?.workspace).toBe("/Users/me/komorebi");
    expect(projects[0]?.sessions.map((x) => x.id)).toEqual(["a1", "a2", "a3"]);
  });

  test("uses folder name first and adds parent path segments for duplicate names", () => {
    const projects = buildSessionProjects([
      s("a1", "/Users/me/work/komorebi"),
      s("a2", "/Users/me/work/komorebi"),
      s("a3", "/Users/me/work/komorebi"),
      s("b1", "/private/tmp/work/komorebi"),
      s("b2", "/private/tmp/work/komorebi"),
      s("b3", "/private/tmp/work/komorebi"),
    ]);
    expect(projects.map((p) => p.label).sort()).toEqual(["me/work/komorebi", "tmp/work/komorebi"]);
  });
});
