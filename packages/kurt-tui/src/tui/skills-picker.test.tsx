import { describe, expect, test } from "bun:test";
import { render } from "ink-testing-library";
import { SkillsPicker } from "./skills-picker.tsx";
import type { SkillInfo } from "../skills.ts";

const SKILLS: SkillInfo[] = [
  { name: "pdf", description: "extract pdf text", scope: "global", path: "/home/.kurt/skills/pdf/SKILL.md" },
  { name: "deploy", description: "ship the app", scope: "project", path: "/ws/.kurt/skills/deploy.md" },
];

describe("SkillsPicker render", () => {
  test("lists each skill's name, scope badge, and description", () => {
    const { lastFrame, unmount } = render(<SkillsPicker skills={SKILLS} selected={0} />);
    const frame = lastFrame() ?? "";
    expect(frame).toContain("pdf");
    expect(frame).toContain("extract pdf text");
    expect(frame).toContain("[global]");
    expect(frame).toContain("deploy");
    expect(frame).toContain("ship the app");
    expect(frame).toContain("[project]");
    unmount();
  });

  test("empty list shows a neutral hint", () => {
    const { lastFrame, unmount } = render(<SkillsPicker skills={[]} selected={0} />);
    expect(lastFrame() ?? "").toContain("No skills loaded");
    unmount();
  });
});
