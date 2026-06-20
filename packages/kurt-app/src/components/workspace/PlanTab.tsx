/** Plan pane — renders the agent's current plan (from update_plan, delivered via
 *  the `plan` run frame) as a checklist. Plan state is live (per launch); a
 *  reloaded session shows the empty state until the agent records a plan again. */

import type { Lang } from "../../types.ts";
import type { PlanStep } from "../../lib/bridge.ts";
import { T, tr } from "../../i18n/strings.ts";
import { Icon } from "../Icon.tsx";

const MARK: Record<PlanStep["status"], { icon: string; cls: string }> = {
  done: { icon: "check", cls: "done" },
  in_progress: { icon: "spark", cls: "active" },
  pending: { icon: "dots3", cls: "pending" },
};

export function PlanTab({ steps, lang }: { steps: PlanStep[] | undefined; lang: Lang }) {
  if (!steps || steps.length === 0) {
    return <div className="ws-empty">{tr(T.planEmpty, lang)}</div>;
  }
  const done = steps.filter((s) => s.status === "done").length;
  return (
    <div className="plan-tab">
      <div className="plan-progress">{tr(T.planProgress, lang, { done, total: steps.length })}</div>
      <ol className="plan-list">
        {steps.map((s, i) => {
          const m = MARK[s.status];
          return (
            <li key={i} className={"plan-item " + m.cls}>
              <span className="plan-mark"><Icon name={m.icon} /></span>
              <span className="plan-title">{s.title}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
