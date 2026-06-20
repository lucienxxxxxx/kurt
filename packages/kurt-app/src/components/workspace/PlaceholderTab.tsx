/** Placeholder pane for tabs whose feature lands in a later phase (terminal →
 *  Phase C, plan → Phase B). Keeps the framework whole so the `+` menu works. */

import type { Lang } from "../../types.ts";
import { T, tr } from "../../i18n/strings.ts";
import { Icon } from "../Icon.tsx";

export function PlaceholderTab({ icon, label, lang }: { icon: string; label: string; lang: Lang }) {
  return (
    <div className="ws-empty ws-placeholder">
      <Icon name={icon} className="ws-placeholder-ico" />
      <div className="ws-placeholder-label">{label}</div>
      <div className="ws-placeholder-sub">{tr(T.tabComingSoon, lang)}</div>
    </div>
  );
}
