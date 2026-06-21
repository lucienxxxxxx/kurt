/** Markdown renderer for messages, thinking, tool output and file preview.
 *  Backed by react-markdown + remark-gfm (CommonMark + GFM: blockquotes, *italic*,
 *  ~~strike~~, tables, task lists, nested lists, autolinks, …) — no hand-rolled
 *  parser, and safe by construction (react-markdown builds React nodes, never
 *  dangerouslySetInnerHTML). Element → className mapping keeps the existing visual
 *  style, and fenced code keeps its language label + copy button. */

import type { ComponentPropsWithoutRef, ReactElement, ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Lang } from "../types.ts";
import { CopyButton } from "./MessageActions.tsx";

/** Flatten a code element's children to a raw string (for the copy button). */
function codeText(node: ReactNode): string {
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(codeText).join("");
  if (node && typeof node === "object" && "props" in node) {
    return codeText((node as ReactElement<{ children?: ReactNode }>).props.children);
  }
  return "";
}

export function MdBlock({ text, lang = "en" }: { text: string; lang?: Lang }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h1: ({ children }) => <h2 className="md-h1">{children}</h2>,
        h2: ({ children }) => <h3 className="md-h2">{children}</h3>,
        h3: ({ children }) => <h4 className="md-h3">{children}</h4>,
        h4: ({ children }) => <h4 className="md-h3">{children}</h4>,
        a: ({ children, href }) => <a className="md-link" href={href}>{children}</a>,
        ul: ({ children }) => <ul className="md-ul">{children}</ul>,
        ol: ({ children }) => <ol className="md-ol">{children}</ol>,
        hr: () => <hr className="md-hr" />,
        blockquote: ({ children }) => <blockquote className="md-quote">{children}</blockquote>,
        table: ({ children }) => <table className="md-table">{children}</table>,
        // Inline code: fenced blocks are handled by `pre` below (which owns the chrome).
        code: ({ className, children }: ComponentPropsWithoutRef<"code">) =>
          className && className.startsWith("language-")
            ? <code className={className}>{children}</code>
            : <code className="inl">{children}</code>,
        // Fenced code block: language label + copy button + the code.
        pre: ({ children }) => {
          const el = children as ReactElement<{ className?: string; children?: ReactNode }>;
          const cls = el?.props?.className ?? "";
          const fence = /language-(\w+)/.exec(cls)?.[1] ?? "";
          const code = codeText(el?.props?.children).replace(/\n$/, "");
          return (
            <pre className="md-pre">
              {fence && <div className="md-pre-lang">{fence}</div>}
              <CopyButton text={code} lang={lang} compact className="md-pre-copy" />
              <code>{code}</code>
            </pre>
          );
        },
      }}
    >
      {text}
    </ReactMarkdown>
  );
}
