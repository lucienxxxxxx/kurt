import type { Lang } from "../types.ts";
import type { SkillInfo } from "../lib/bridge.ts";
import { T, tr } from "../i18n/strings.ts";
import { MdBlock } from "./Markdown.tsx";
import { Icon } from "./Icon.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { ScrollArea } from "@/components/ui/scroll-area.tsx";

export function SkillsPage({ skills, selected, body, loading, lang, onSelect, onUse, onRefresh, onClose }: {
  skills: SkillInfo[];
  selected: string | null;
  body: string;
  loading: boolean;
  lang: Lang;
  onSelect: (name: string) => void;
  onUse: (skill: SkillInfo) => void;
  onRefresh: () => void;
  onClose: () => void;
}) {
  const current = skills.find((s) => s.name === selected) ?? skills[0] ?? null;
  return (
    <div className="skills-page">
      <div className="skills-head" data-tauri-drag-region>
        <div>
          <h1>{tr(T.skills, lang)}</h1>
          <p>{tr(T.skillsSubtitle, lang)}</p>
        </div>
        <div className="skills-actions">
          <Button variant="ghost" size="icon" onClick={onRefresh} title={tr(T.refresh, lang)}><Icon name="refresh" /></Button>
          <Button variant="ghost" size="icon" onClick={onClose} title={tr(T.close, lang)}><Icon name="x" /></Button>
        </div>
      </div>
      <div className="skills-layout">
        <ScrollArea className="skills-list">
          {skills.map((skill) => (
            <button key={skill.name} className={"skill-list-item" + (skill.name === current?.name ? " active" : "")}
              onClick={() => onSelect(skill.name)} title={skill.path}>
              <span className="skill-list-main">
                <span className="skill-name">{skill.displayName}</span>
                <span className="skill-desc">{skill.description}</span>
              </span>
              <Badge>{skill.source}</Badge>
            </button>
          ))}
          {skills.length === 0 && <div className="skills-empty">{tr(T.skillsEmpty, lang)}</div>}
        </ScrollArea>
        <div className="skill-detail">
          {current ? (
            <>
              <div className="skill-detail-top">
                <div className="skill-title-block">
                  <div className="skill-title-row">
                    <h2>{current.displayName}</h2>
                    <Badge>{current.scope}</Badge>
                  </div>
                  <p title={current.path}>{current.path}</p>
                </div>
                <Button onClick={() => onUse(current)}><Icon name="skills" />{tr(T.useSkill, lang)}</Button>
              </div>
              <ScrollArea className="skill-body">
                {loading ? <div className="skills-loading" /> : <MdBlock text={body || current.description} lang={lang} />}
              </ScrollArea>
            </>
          ) : (
            <div className="skills-empty">{tr(T.skillsEmpty, lang)}</div>
          )}
        </div>
      </div>
    </div>
  );
}
