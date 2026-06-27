import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseSkill, loadSkills } from "./skills.ts";

describe("parseSkill", () => {
  test("reads name + description from frontmatter, body after", () => {
    const s = parseSkill("---\nname: pdf\ndescription: extract pdf text\n---\n# Steps\n1. open\n", "fallback");
    expect(s).toEqual({ name: "pdf", description: "extract pdf text", body: "# Steps\n1. open" });
  });

  test("no frontmatter → name=fallback, description=first non-empty line", () => {
    const s = parseSkill("# Deploy guide\n\ndo the thing", "deploy");
    expect(s?.name).toBe("deploy");
    expect(s?.description).toBe("Deploy guide"); // heading markers stripped
    expect(s?.body).toBe("# Deploy guide\n\ndo the thing");
  });

  test("empty body → null", () => {
    expect(parseSkill("---\nname: x\ndescription: y\n---\n   \n", "x")).toBeNull();
    expect(parseSkill("   ", "x")).toBeNull();
  });

  test("partial frontmatter (name only) keeps body for description fallback", () => {
    const s = parseSkill("---\nname: only-name\n---\nfirst line here\nmore", "fb");
    expect(s?.name).toBe("only-name");
    expect(s?.description).toBe("first line here");
  });
});

describe("loadSkills (global + project)", () => {
  const saved = process.env.KURT_HOME;
  let home = "";
  let ws = "";
  afterEach(() => {
    if (saved === undefined) delete process.env.KURT_HOME;
    else process.env.KURT_HOME = saved;
    if (home) rmSync(home, { recursive: true, force: true });
    if (ws) rmSync(ws, { recursive: true, force: true });
  });

  function setup(): void {
    home = realpathSync(mkdtempSync(join(tmpdir(), "kurt-home-")));
    ws = realpathSync(mkdtempSync(join(tmpdir(), "kurt-ws-")));
    process.env.KURT_HOME = home;
  }

  test("discovers <name>/SKILL.md and flat <name>.md; project overrides global", async () => {
    setup();
    // global: a dir-skill and a flat-skill
    mkdirSync(join(home, "skills", "shared"), { recursive: true });
    writeFileSync(join(home, "skills", "shared", "SKILL.md"), "---\nname: shared\ndescription: global version\n---\nGLOBAL body");
    writeFileSync(join(home, "skills", "flat.md"), "---\nname: flat\ndescription: a flat skill\n---\nflat body");
    // project: override "shared", add "only-project"
    mkdirSync(join(ws, ".kurt", "skills", "shared"), { recursive: true });
    writeFileSync(join(ws, ".kurt", "skills", "shared", "SKILL.md"), "---\nname: shared\ndescription: project version\n---\nPROJECT body");
    mkdirSync(join(ws, ".kurt", "skills", "only-project"), { recursive: true });
    writeFileSync(join(ws, ".kurt", "skills", "only-project", "SKILL.md"), "---\nname: only-project\ndescription: p\n---\npbody");

    const { provider, catalog, metas, infos } = await loadSkills(ws);
    expect(metas.map((m) => m.name).sort()).toEqual(["flat", "only-project", "shared"]);
    expect(metas.find((m) => m.name === "shared")?.description).toBe("project version");
    expect(await provider.load("shared")).toBe("PROJECT body"); // project wins
    expect(await provider.load("flat")).toBe("flat body");
    expect(await provider.load("nope")).toBeNull();
    expect(catalog).toContain("- shared: project version");

    // infos carries scope + path for the `/skills` display.
    const flat = infos.find((i) => i.name === "flat");
    expect(flat?.scope).toBe("global");
    expect(flat?.path).toBe(join(home, "skills", "flat.md"));
    const onlyProject = infos.find((i) => i.name === "only-project");
    expect(onlyProject?.scope).toBe("project");
    expect(onlyProject?.path).toBe(join(ws, ".kurt", "skills", "only-project", "SKILL.md"));
    // project override → scope flips to project, path points at the project file.
    const shared = infos.find((i) => i.name === "shared");
    expect(shared?.scope).toBe("project");
    expect(shared?.path).toBe(join(ws, ".kurt", "skills", "shared", "SKILL.md"));
  });

  test("no skills dirs → empty provider + empty catalog + empty infos (never throws)", async () => {
    setup();
    const { metas, catalog, provider, infos } = await loadSkills(ws);
    expect(metas).toEqual([]);
    expect(catalog).toBe("");
    expect(provider.list()).toEqual([]);
    expect(infos).toEqual([]);
  });
});
