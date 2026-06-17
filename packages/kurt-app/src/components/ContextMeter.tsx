/** Context-usage meter shown below the composer (bottom-right): a double-ring
 *  donut of "current context tokens / model max context". Clicking it opens a card
 *  with the per-category token breakdown (your messages / thinking / tools /
 *  replies / system). Category numbers are ESTIMATED from text length — the model
 *  API only reports input/output/total, never a thinking-vs-tool split. */

import { useEffect, useState } from "react";
import type { Lang, Step } from "../types.ts";
import { T, tr } from "../i18n/strings.ts";
import { estimateTokens } from "../lib/tokens.ts";
import { modelContextWindow } from "../lib/models.ts";

const SYSTEM_PROMPT_EST = 300; // the bridge's system prompt isn't sent to the app; rough fixed estimate

interface Breakdown { you: number; thinking: number; tools: number; replies: number; system: number; total: number }

function breakdownOf(steps: Step[], lang: Lang): Breakdown {
  const b = { you: 0, thinking: 0, tools: 0, replies: 0, system: SYSTEM_PROMPT_EST };
  for (const s of steps) {
    if (s.type === "user") b.you += estimateTokens(tr(s.text, lang));
    else if (s.type === "thinking") b.thinking += estimateTokens(tr(s.text, lang));
    else if (s.type === "text") b.replies += estimateTokens(tr(s.text, lang));
    else if (s.type === "tool") b.tools += estimateTokens(s.cmd) + estimateTokens(tr(s.out, lang));
    else if (s.type === "read") b.tools += estimateTokens(s.file) + estimateTokens(s.lines);
    else if (s.type === "skill") b.tools += estimateTokens(tr(s.input ?? "", lang)) + estimateTokens(tr(s.output ?? "", lang));
  }
  return { ...b, total: b.you + b.thinking + b.tools + b.replies + b.system };
}

const fmt = (n: number): string => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`);

export function ContextMeter({ steps, model, lang, apiTokens }: {
  steps: Step[];
  model: string;
  lang: Lang;
  /** Real total tokens reported by the API for the current run, if any. */
  apiTokens?: number;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const close = (): void => setOpen(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [open]);

  const b = breakdownOf(steps, lang);
  const max = modelContextWindow(model);
  const pct = Math.min(100, Math.round((b.total / max) * 100));
  const level = pct >= 90 ? "high" : pct >= 70 ? "med" : "low";

  const C = 2 * Math.PI * 16; // ring circumference (r=16)
  const rows: { label: string; n: number; cls: string }[] = [
    { label: tr(T.ctxYou, lang), n: b.you, cls: "you" },
    { label: tr(T.ctxThinking, lang), n: b.thinking, cls: "thinking" },
    { label: tr(T.ctxTools, lang), n: b.tools, cls: "tools" },
    { label: tr(T.ctxReplies, lang), n: b.replies, cls: "replies" },
    { label: tr(T.ctxSystem, lang), n: b.system, cls: "system" },
  ];

  return (
    <div className="ctx-meter" onClick={(e) => e.stopPropagation()}>
      {open && (
        <div className="ctx-card">
          <div className="ctx-card-head">
            <span className="ctx-card-title">{tr(T.ctxTitle, lang)}</span>
            <span className="ctx-card-used">{tr(T.ctxUsed, lang, { used: fmt(b.total), max: fmt(max) })} · {pct}%</span>
          </div>
          <div className="ctx-rows">
            {rows.map((r) => (
              <div key={r.cls} className="ctx-row">
                <span className="ctx-row-label">{r.label}</span>
                <span className="ctx-bar"><span className={"ctx-bar-fill " + r.cls} style={{ width: `${b.total ? Math.round((r.n / b.total) * 100) : 0}%` }} /></span>
                <span className="ctx-row-n">{fmt(r.n)}</span>
              </div>
            ))}
          </div>
          <div className="ctx-note">{tr(T.ctxApprox, lang)}</div>
          {apiTokens ? <div className="ctx-note">{tr(T.ctxApiTotal, lang, { n: fmt(apiTokens) })}</div> : null}
        </div>
      )}
      <button className={"ctx-ring-btn " + level} onClick={() => setOpen((o) => !o)} title={tr(T.ctxTitle, lang)} aria-label={tr(T.ctxTitle, lang)}>
        <svg viewBox="0 0 40 40" className="ctx-ring" aria-hidden="true">
          <circle className="ctx-ring-track" cx="20" cy="20" r="16" fill="none" strokeWidth="4" />
          <circle className="ctx-ring-val" cx="20" cy="20" r="16" fill="none" strokeWidth="4" strokeLinecap="round"
            strokeDasharray={`${(pct / 100) * C} ${C}`} transform="rotate(-90 20 20)" />
          <text className="ctx-ring-text" x="20" y="20" textAnchor="middle" dominantBaseline="central">{pct}%</text>
        </svg>
      </button>
    </div>
  );
}
