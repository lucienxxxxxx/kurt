/** Tiny markdown renderer (ported from prototype/ui.jsx): inline code/bold/links
 *  + block headers/lists/code-fences/hr. Faithful to the prototype's subset. */

import type { ReactNode } from "react";

export function renderInline(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const re = /(`[^`]+`|\*\*[^*]+\*\*|\[([^\]]+)\]\(([^)]+)\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("`")) parts.push(<code key={k++} className="inl">{tok.slice(1, -1)}</code>);
    else if (tok.startsWith("**")) parts.push(<strong key={k++}>{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith("[")) parts.push(<a key={k++} className="md-link" href={m[3]}>{m[2]}</a>);
    last = m.index + tok.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

export function MdBlock({ text }: { text: string }) {
  const lines = text.split("\n");
  const elements: ReactNode[] = [];
  let i = 0;
  let k = 0;

  while (i < lines.length) {
    const line = lines[i]!;

    if (line.trim() === "") { elements.push(<div key={k++} style={{ height: 6 }} />); i++; continue; }

    if (line.trim().startsWith("```")) {
      const lang = line.trim().slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i]!.trim().startsWith("```")) { codeLines.push(lines[i]!); i++; }
      i++;
      elements.push(
        <pre key={k++} className="md-pre">
          {lang && <div className="md-pre-lang">{lang}</div>}
          <code>{codeLines.join("\n")}</code>
        </pre>,
      );
      continue;
    }

    if (line.startsWith("### ")) { elements.push(<h4 key={k++} className="md-h3">{renderInline(line.slice(4))}</h4>); i++; continue; }
    if (line.startsWith("## ")) { elements.push(<h3 key={k++} className="md-h2">{renderInline(line.slice(3))}</h3>); i++; continue; }
    if (line.startsWith("# ")) { elements.push(<h2 key={k++} className="md-h1">{renderInline(line.slice(2))}</h2>); i++; continue; }

    if (/^---+$/.test(line.trim())) { elements.push(<hr key={k++} className="md-hr" />); i++; continue; }

    if (/^[-*] /.test(line.trim())) {
      const items: string[] = [];
      while (i < lines.length && /^[-*] /.test(lines[i]!.trim())) { items.push(lines[i]!.trim().replace(/^[-*] /, "")); i++; }
      elements.push(<ul key={k++} className="md-ul">{items.map((tt, j) => <li key={j}>{renderInline(tt)}</li>)}</ul>);
      continue;
    }

    if (/^\d+[.)]\s/.test(line.trim())) {
      const items: string[] = [];
      while (i < lines.length && /^\d+[.)]\s/.test(lines[i]!.trim())) { items.push(lines[i]!.trim().replace(/^\d+[.)]\s/, "")); i++; }
      elements.push(<ol key={k++} className="md-ol">{items.map((tt, j) => <li key={j}>{renderInline(tt)}</li>)}</ol>);
      continue;
    }

    elements.push(<p key={k++}>{renderInline(line)}</p>);
    i++;
  }
  return <>{elements}</>;
}
