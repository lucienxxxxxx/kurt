import { describe, expect, test } from "bun:test";
import { SkillTool } from "./skill.ts";
import { skillCatalog } from "../skills/index.ts";
import type { SkillProvider, SkillMeta } from "../skills/index.ts";

const ctx = () => ({ signal: new AbortController().signal, toolCallId: "t", emit: () => {} });

function provider(skills: Record<string, { description: string; body: string }>): SkillProvider {
  const metas: SkillMeta[] = Object.entries(skills).map(([name, s]) => ({ name, description: s.description }));
  return {
    list: () => metas,
    load: async (name) => (name in skills ? skills[name]!.body : null),
  };
}

describe("skillCatalog", () => {
  test("lists name + description, empty when none", () => {
    expect(skillCatalog([])).toBe("");
    const cat = skillCatalog([{ name: "pdf", description: "extract text from PDFs" }]);
    expect(cat).toContain("# Skills");
    expect(cat).toContain("- pdf: extract text from PDFs");
    expect(cat).toContain("call the `skill` tool");
  });
});

describe("SkillTool", () => {
  test("advertises the skill names as an enum", () => {
    const tool = new SkillTool(provider({ a: { description: "d", body: "x" }, b: { description: "d2", body: "y" } }));
    expect(tool.spec.name).toBe("skill");
    expect(tool.spec.inputSchema.properties?.name?.enum).toEqual(["a", "b"]);
  });

  test("loads a skill body with a header", async () => {
    const tool = new SkillTool(provider({ deploy: { description: "deploy", body: "1. build\n2. ship" } }));
    const res = await tool.execute({ name: "deploy" }, ctx());
    expect(res.isError).toBeFalsy();
    expect(res.content).toBe("# Skill: deploy\n\n1. build\n2. ship");
  });

  test("unknown skill → error listing what's available", async () => {
    const tool = new SkillTool(provider({ deploy: { description: "d", body: "b" } }));
    const res = await tool.execute({ name: "nope" }, ctx());
    expect(res.isError).toBe(true);
    expect(res.content).toContain("Unknown skill");
    expect(res.content).toContain("deploy");
  });

  test("invalid input → error", async () => {
    const tool = new SkillTool(provider({ a: { description: "d", body: "b" } }));
    const res = await tool.execute({}, ctx());
    expect(res.isError).toBe(true);
  });
});
