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

    // GitHub-style table: a header row followed by a |---|---| separator row.
    if (line.includes("|") && i + 1 < lines.length && isTableSep(lines[i + 1]!)) {
      const header = splitRow(line);
      const aligns = splitRow(lines[i + 1]!).map(cellAlign);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i]!.trim() !== "" && lines[i]!.includes("|")) { rows.push(splitRow(lines[i]!)); i++; }
      elements.push(
        <table key={k++} className="md-table">
          <thead>
            <tr>{header.map((c, ci) => <th key={ci} style={{ textAlign: aligns[ci] ?? "left" }}>{renderInline(c)}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => (
              <tr key={ri}>{header.map((_, ci) => <td key={ci} style={{ textAlign: aligns[ci] ?? "left" }}>{renderInline(r[ci] ?? "")}</td>)}</tr>
            ))}
          </tbody>
        </table>,
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

/** A markdown table separator row: only `| - : space`, with at least one `-` and `|`. */
function isTableSep(line: string): boolean {
  const s = line.trim();
  return /^[:\-\s|]+$/.test(s) && s.includes("-") && s.includes("|");
}

/** Split a `| a | b |` row into trimmed cells (tolerating missing edge pipes). */
function splitRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  return s.split("|").map((c) => c.trim());
}

/** Column alignment from a separator cell (`:--` left, `--:` right, `:-:` center). */
function cellAlign(cell: string): "left" | "center" | "right" {
  const c = cell.trim();
  const l = c.startsWith(":");
  const r = c.endsWith(":");
  if (l && r) return "center";
  if (r) return "right";
  return "left";
}
