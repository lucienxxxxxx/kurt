import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SkillsPage } from "./SkillsPage.tsx";
import type { SkillInfo } from "../lib/bridge.ts";

afterEach(cleanup);

const skills: SkillInfo[] = [
  { name: "codex:openai-docs", displayName: "openai-docs", description: "OpenAI docs", scope: "codex", source: "Codex", path: "/x/SKILL.md" },
  { name: "project:deploy", displayName: "deploy", description: "Deploy guide", scope: "project", source: "Project", path: "/w/.kurt/skills/deploy/SKILL.md" },
];

describe("SkillsPage", () => {
  test("renders skills and selects a row", () => {
    const onSelect = vi.fn();
    render(<SkillsPage skills={skills} selected="codex:openai-docs" body="# Body" loading={false} lang="en"
      onSelect={onSelect} onUse={vi.fn()} onRefresh={vi.fn()} onClose={vi.fn()} />);
    fireEvent.click(screen.getByText("deploy"));
    expect(onSelect).toHaveBeenCalledWith("project:deploy");
    expect(screen.getByText("OpenAI docs")).toBeInTheDocument();
  });

  test("use button sends the selected skill", () => {
    const onUse = vi.fn();
    render(<SkillsPage skills={skills} selected="project:deploy" body="steps" loading={false} lang="en"
      onSelect={vi.fn()} onUse={onUse} onRefresh={vi.fn()} onClose={vi.fn()} />);
    fireEvent.click(screen.getByText("Use"));
    expect(onUse).toHaveBeenCalledWith(skills[1]);
  });
});
