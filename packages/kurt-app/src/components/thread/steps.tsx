/** Thread step renderers (ported from prototype/ui.jsx). One per step type;
 *  dispatched by `renderStep`. Each reads `lang` and renders the prototype's
 *  exact class structure. */

import type { Lang, Step } from "../../types.ts";
import { T, tr } from "../../i18n/strings.ts";
import { Icon } from "../Icon.tsx";
import { MdBlock } from "../Markdown.tsx";
import { CopyButton, MessageTime } from "../MessageActions.tsx";

type ThinkingStep = Extract<Step, { type: "thinking" }>;
type TextStep = Extract<Step, { type: "text" | "user" }>;
type ToolStep = Extract<Step, { type: "tool" }>;
type ReadStep = Extract<Step, { type: "read" }>;
type SkillStep = Extract<Step, { type: "skill" }>;

export interface OpenOutput {
  stepId: number;
  name: string;
  title: string;
  content: string;
}

export function ThinkingStepView({ step, open, onToggle, typing, lang }: {
  step: ThinkingStep; open: boolean; onToggle: () => void; typing: boolean; lang: Lang;
}) {
  return (
    <div className="step thinking-step">
      <div className={"think-head" + (open ? " open" : "")} onClick={onToggle}>
        <Icon name="chevR" className="chev" />
        <span>{typing ? tr(T.thinking, lang) : tr(T.thoughtFor, lang, { n: step.sec ?? 0 })}</span>
      </div>
      {open && <div className="think-body"><MdBlock text={tr(step.text, lang)} lang={lang} /></div>}
    </div>
  );
}

export function TextStepView({ step, typing, lang }: { step: TextStep; typing: boolean; lang: Lang }) {
  const txt = tr(step.text, lang);
  return (
    <div className="step">
      <div className={"step-text" + (typing ? " typing-cursor" : "")}>
        <MdBlock text={txt} lang={lang} />
      </div>
      {!typing && (
        <div className="msg-actions">
          <CopyButton text={txt} lang={lang} />
          <MessageTime ts={step.ts} />
        </div>
      )}
    </div>
  );
}

export function ToolStepView({ step, open, onToggle, lang, onOpenOutput }: {
  step: ToolStep; open: boolean; onToggle: () => void; lang: Lang; onOpenOutput?: (o: OpenOutput) => void;
}) {
  const outText = tr(step.out, lang);
  const outLines = outText.split("\n");
  const MAX_LINES = 5;
  const isTruncated = outLines.length > MAX_LINES;
  const displayOut = isTruncated ? outLines.slice(0, MAX_LINES).join("\n") : outText;

  const handleClickOut = () => {
    if (isTruncated && onOpenOutput) {
      onOpenOutput({ stepId: step._id, name: step.name, title: tr(step.title, lang), content: outText });
    }
  };

  return (
    <div className="step act">
      <div className="tool-line" onClick={onToggle} title={tr(open ? T.collapse : T.expand, lang)}>
        <span className="tool-name">{step.name}</span>
        <span className="tool-title">{tr(step.title, lang)}</span>
        <button className="icon-btn tool-toggle" tabIndex={-1} aria-hidden="true">
          <Icon name={open ? "chevD" : "chevR"} />
        </button>
      </div>
      {open && (
        <div className="tool-card">
          <div className="tool-row">
            <span className="tool-tag">IN</span>
            <div className="tool-content">{step.cmd}</div>
          </div>
          <div className={"tool-row out" + (isTruncated ? " clickable" : "")} onClick={handleClickOut}>
            <span className="tool-tag">OUT</span>
            <div className="tool-content">
              {displayOut}
              {isTruncated && <span className="tool-ellipsis">…</span>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function ReadStepView({ step, lang, onOpen }: { step: ReadStep; lang: Lang; onOpen?: (file: string) => void }) {
  return (
    <div className="step act">
      <div className="read-line">
        <span className="tool-name">{tr(T.readPrefix, lang)}</span>
        <button className="read-file-link" onClick={() => onOpen?.(step.file)}>{step.file}</button>
        <span className="read-meta">({tr(T.linesLabel, lang, { range: step.lines })})</span>
      </div>
    </div>
  );
}

export function SkillStepView({ step, open, onToggle, lang }: {
  step: SkillStep; open: boolean; onToggle: () => void; lang: Lang;
}) {
  return (
    <div className="step skill-step">
      <div className="skill-line" onClick={onToggle} title={tr(open ? T.collapse : T.expand, lang)}>
        <span className="skill-badge"><Icon name="skills" /></span>
        <span className="skill-name">{step.name}</span>
        <span className="skill-title">{tr(step.title, lang)}</span>
        <button className="icon-btn tool-toggle" tabIndex={-1} aria-hidden="true">
          <Icon name={open ? "chevD" : "chevR"} />
        </button>
      </div>
      {open && (
        <div className="skill-card">
          {step.input && (
            <div className="skill-section">
              <div className="skill-section-label">INPUT</div>
              <div className="skill-section-body">{tr(step.input, lang)}</div>
            </div>
          )}
          {step.output && (
            <div className="skill-section out">
              <div className="skill-section-label">OUTPUT</div>
              <div className="skill-section-body"><MdBlock text={tr(step.output, lang)} lang={lang} /></div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function renderStep(
  step: Step,
  ctx: { lang: Lang; collapsed: Set<number>; collapseDetails: boolean; liveId: number | null; onToggle: (id: number) => void; onOpenFile: (f: string) => void; onOpenOutput: (o: OpenOutput) => void },
) {
  // `collapsed` is a "toggled away from the default" set. Default open unless the
  // "collapse details by default" setting is on (then detail steps start collapsed).
  const open = ctx.collapseDetails ? ctx.collapsed.has(step._id) : !ctx.collapsed.has(step._id);
  const typing = step._id === ctx.liveId;
  switch (step.type) {
    case "thinking":
      return <ThinkingStepView key={step._id} step={step} open={open} typing={typing} onToggle={() => ctx.onToggle(step._id)} lang={ctx.lang} />;
    case "tool":
      return <ToolStepView key={step._id} step={step} open={open} onToggle={() => ctx.onToggle(step._id)} lang={ctx.lang} onOpenOutput={ctx.onOpenOutput} />;
    case "read":
      return <ReadStepView key={step._id} step={step} lang={ctx.lang} onOpen={ctx.onOpenFile} />;
    case "skill":
      return <SkillStepView key={step._id} step={step} open={open} onToggle={() => ctx.onToggle(step._id)} lang={ctx.lang} />;
    default:
      return <TextStepView key={step._id} step={step} typing={typing} lang={ctx.lang} />;
  }
}
