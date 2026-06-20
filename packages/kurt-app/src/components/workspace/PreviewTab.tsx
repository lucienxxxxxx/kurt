/** Preview pane — renders a tab's target as markdown / html / pdf / code / tool
 *  output. Content-driven: `meta.content` is shown directly; `meta.file` carries
 *  the source path (label/subtitle). Replaces the old DetailPanel body. */

import type { Lang, PreviewKind, Tab } from "../../types.ts";
import { T, tr } from "../../i18n/strings.ts";
import { MdBlock } from "../Markdown.tsx";

/** Pick how to render a file from its extension. */
export function previewKindFor(file: string): PreviewKind {
  const ext = file.toLowerCase().split(".").pop() ?? "";
  if (ext === "md" || ext === "markdown") return "markdown";
  if (ext === "html" || ext === "htm") return "html";
  if (ext === "pdf") return "pdf";
  if (["js", "ts", "tsx", "jsx", "json", "py", "rs", "css", "sh", "toml", "yaml", "yml"].includes(ext)) return "code";
  return "text";
}

export function PreviewTab({ tab, lang }: { tab: Tab; lang: Lang }) {
  const meta = tab.meta ?? {};
  const kind = meta.previewKind ?? "text";
  const content = meta.content ?? "";

  let body: React.ReactNode;
  if (kind === "markdown") {
    body = <div className="fp-md"><MdBlock text={content || tr(T.previewNoFile, lang)} lang={lang} /></div>;
  } else if (kind === "html") {
    // Sandboxed: no scripts, no same-origin — a safe static render of the markup.
    body = <iframe className="ws-iframe" sandbox="" srcDoc={content} title={tab.title} />;
  } else if (kind === "pdf") {
    body = content
      ? <iframe className="ws-iframe" src={content} title={tab.title} />
      : <div className="ws-empty">{tr(T.previewUnavailable, lang)}</div>;
  } else {
    // code / output / plain text
    body = <pre className="fp-code"><code>{content || tr(T.previewNoFile, lang)}</code></pre>;
  }

  return (
    <div className="ws-preview">
      {meta.subtitle && <div className="ws-subtitle" title={meta.subtitle}>{meta.subtitle}</div>}
      <div className="ws-preview-body">{body}</div>
    </div>
  );
}
