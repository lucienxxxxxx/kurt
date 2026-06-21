/** Thread step renderers (ported from prototype/ui.jsx). One per step type;
 *  dispatched by `renderStep`. Each reads `lang` and renders the prototype's
 *  exact class structure. */

import type { ReactNode } from "react";
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

/** Max lines shown inline for a tool/skill IN or OUT block before it clips to "…". */
const MAX_LINES = 5;
function clip(text: string): { display: string; truncated: boolean } {
  const lines = text.split("\n");
  if (lines.length <= MAX_LINES) return { display: text, truncated: false };
  return { display: lines.slice(0, MAX_LINES).join("\n"), truncated: true };
}

/** The last path segment — what we show after a file tool's name. */
function basename(path: string): string {
  const clean = path.replace(/[/\\]+$/, "");
  const i = Math.max(clean.lastIndexOf("/"), clean.lastIndexOf("\\"));
  return i >= 0 ? clean.slice(i + 1) : clean;
}

/** Unified expand/collapse header shared by thinking / tool / skill steps:
 *  [icon] label  sub  [chevron]. `sub` carries e.g. the file a tool writes
 *  (a clickable link). The whole row toggles. */
function StepHead({ icon, label, sub, open, onToggle, lang }: {
  icon: string; label: string; sub?: ReactNode; open: boolean; onToggle: () => void; lang: Lang;
}) {
  return (
    <div className={"step-head" + (open ? " open" : "")} onClick={onToggle} title={tr(open ? T.collapse : T.expand, lang)}>
      <Icon name={icon} className="step-head-icon" />
      <span className="step-head-label">{label}</span>
      {sub && <span className="step-head-sub">{sub}</span>}
      <Icon name="chevR" className="step-head-chev" />
    </div>
  );
}

export function ThinkingStepView({ step, open, onToggle, typing, lang }: {
  step: ThinkingStep; open: boolean; onToggle: () => void; typing: boolean; lang: Lang;
}) {
  const label = typing ? tr(T.thinking, lang) : step.sec != null ? tr(T.thoughtFor, lang, { n: step.sec }) : tr(T.thoughtDone, lang);
  return (
    <div className="step thinking-step">
      <StepHead icon="brain" label={label} open={open} onToggle={onToggle} lang={lang} />
      {open && <div className="think-body"><MdBlock text={tr(step.text, lang)} lang={lang} /></div>}
    </div>
  );
}

export function TextStepView({ step, typing, lang, showActions }: { step: TextStep; typing: boolean; lang: Lang; showActions: boolean }) {
  const txt = tr(step.text, lang);
  return (
    <div className="step">
      <div className={"step-text" + (typing ? " typing-cursor streaming" : "")}>
        <MdBlock text={txt} lang={lang} />
      </div>
      {/* Only the run's FINAL reply carries the copy/time footer — intermediate
          text (interleaved with tools) stays clean. */}
      {!typing && showActions && (
        <div className="msg-actions">
          <CopyButton text={txt} lang={lang} />
          <MessageTime ts={step.ts} />
        </div>
      )}
    </div>
  );
}

export function ToolStepView({ step, open, onToggle, lang, onOpenOutput, onOpenFile }: {
  step: ToolStep; open: boolean; onToggle: () => void; lang: Lang; onOpenOutput?: (o: OpenOutput) => void; onOpenFile?: (file: string) => void;
}) {
  const title = tr(step.title, lang);
  const inText = step.cmd;
  const outText = tr(step.out, lang);
  const inClip = clip(inText);
  const outClip = clip(outText);

  const openFull = (tag: string, content: string) =>
    onOpenOutput?.({ stepId: step._id, name: step.name, title: title ? `${title} · ${tag}` : tag, content });

  // File tools (write_file, …) carry the path in `title`; show just the filename
  // as a link that opens the side preview.
  const fileLink = title && onOpenFile ? (
    <button className="step-head-file" title={title} onClick={(e) => { e.stopPropagation(); onOpenFile(title); }}>
      {basename(title)}
    </button>
  ) : undefined;

  return (
    <div className="step act">
      <StepHead icon="wrench" label={step.name} sub={fileLink} open={open} onToggle={onToggle} lang={lang} />
      {open && (
        <div className="tool-card">
          <div className={"tool-row" + (inClip.truncated ? " clickable" : "")} onClick={() => inClip.truncated && openFull("IN", inText)}>
            <span className="tool-tag">IN</span>
            <div className="tool-content">
              {inClip.display}
              {inClip.truncated && <span className="tool-ellipsis">…</span>}
            </div>
          </div>
          <div className={"tool-row out" + (outClip.truncated ? " clickable" : "")} onClick={() => outClip.truncated && openFull("OUT", outText)}>
            <span className="tool-tag">OUT</span>
            <div className="tool-content">
              {outClip.display}
              {outClip.truncated && <span className="tool-ellipsis">…</span>}
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
        <button className="read-file-link" title={step.file} onClick={() => onOpen?.(step.file)}>{basename(step.file)}</button>
        <span className="read-meta">({tr(T.linesLabel, lang, { range: step.lines })})</span>
      </div>
    </div>
  );
}

export function SkillStepView({ step, open, onToggle, lang, onOpenOutput }: {
  step: SkillStep; open: boolean; onToggle: () => void; lang: Lang; onOpenOutput?: (o: OpenOutput) => void;
}) {
  const title = tr(step.title, lang);
  const inText = step.input ? tr(step.input, lang) : "";
  const inClip = clip(inText);
  return (
    <div className="step act skill-step">
      <StepHead icon="skills" label={step.name} open={open} onToggle={onToggle} lang={lang} />
      {open && (
        <div className="tool-card">
          {title && <div className="tool-card-title">{title}</div>}
          {step.input && (
            <div className={"tool-row" + (inClip.truncated ? " clickable" : "")} onClick={() => inClip.truncated && onOpenOutput?.({ stepId: step._id, name: step.name, title: title ? `${title} · IN` : "IN", content: inText })}>
              <span className="tool-tag">IN</span>
              <div className="tool-content">
                {inClip.display}
                {inClip.truncated && <span className="tool-ellipsis">…</span>}
              </div>
            </div>
          )}
          {step.output && (
            <div className="tool-row out skill-out">
              <span className="tool-tag">OUT</span>
              <div className="tool-content"><MdBlock text={tr(step.output, lang)} lang={lang} /></div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function renderStep(
  step: Step,
  ctx: { lang: Lang; collapsed: Set<number>; collapseDetails: boolean; liveId: number | null; lastTextId: number | null; onToggle: (id: number) => void; onOpenFile: (f: string) => void; onOpenOutput: (o: OpenOutput) => void },
) {
  // `collapsed` is a "toggled away from the default" set. Default open unless the
  // "collapse details by default" setting is on (then detail steps start collapsed).
  const open = ctx.collapseDetails ? ctx.collapsed.has(step._id) : !ctx.collapsed.has(step._id);
  const typing = step._id === ctx.liveId;
  switch (step.type) {
    case "thinking":
      return <ThinkingStepView key={step._id} step={step} open={open} typing={typing} onToggle={() => ctx.onToggle(step._id)} lang={ctx.lang} />;
    case "tool":
      return <ToolStepView key={step._id} step={step} open={open} onToggle={() => ctx.onToggle(step._id)} lang={ctx.lang} onOpenOutput={ctx.onOpenOutput} onOpenFile={ctx.onOpenFile} />;
    case "read":
      return <ReadStepView key={step._id} step={step} lang={ctx.lang} onOpen={ctx.onOpenFile} />;
    case "skill":
      return <SkillStepView key={step._id} step={step} open={open} onToggle={() => ctx.onToggle(step._id)} lang={ctx.lang} onOpenOutput={ctx.onOpenOutput} />;
    default:
      return <TextStepView key={step._id} step={step} typing={typing} lang={ctx.lang} showActions={step._id === ctx.lastTextId} />;
  }
}
