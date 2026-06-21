import { afterEach, describe, expect, test } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MdBlock } from "./Markdown.tsx";

afterEach(cleanup);

describe("MdBlock — used for both user messages and agent replies", () => {
  test("renders **bold** as <strong>, not literal asterisks", () => {
    const { container } = render(<MdBlock text="hello **world**" />);
    expect(container.querySelector("strong")?.textContent).toBe("world");
    expect(container.textContent).not.toContain("**");
  });

  test("renders `code` as inline <code>", () => {
    const { container } = render(<MdBlock text="run `bun test` now" />);
    const code = container.querySelector("code.inl");
    expect(code?.textContent).toBe("bun test");
  });

  test("renders ## heading as a heading element", () => {
    const { container } = render(<MdBlock text="## Title" />);
    expect(container.querySelector("h3.md-h2")?.textContent).toBe("Title");
  });

  test("renders a bullet list", () => {
    const { container } = render(<MdBlock text={"- one\n- two"} />);
    const items = container.querySelectorAll("ul.md-ul li");
    expect(items.length).toBe(2);
    expect(screen.getByText("one")).toBeInTheDocument();
    expect(screen.getByText("two")).toBeInTheDocument();
  });

  test("renders a fenced code block", () => {
    const { container } = render(<MdBlock text={"```ts\nconst x = 1;\n```"} />);
    expect(container.querySelector("pre.md-pre code")?.textContent).toBe("const x = 1;");
  });

  test("a code block carries a copy button", () => {
    const { container } = render(<MdBlock text={"```\nhi\n```"} />);
    expect(container.querySelector("pre.md-pre .md-pre-copy")).toBeInTheDocument();
  });

  test("renders a GitHub-style table with header + body cells", () => {
    const md = "| Name | Age |\n|------|----:|\n| Ann | 30 |\n| Bo | 25 |";
    const { container } = render(<MdBlock text={md} />);
    const table = container.querySelector("table.md-table");
    expect(table).toBeInTheDocument();
    const headers = Array.from(container.querySelectorAll("thead th")).map((h) => h.textContent);
    expect(headers).toEqual(["Name", "Age"]);
    const rows = container.querySelectorAll("tbody tr");
    expect(rows.length).toBe(2);
    const firstRow = Array.from(rows[0]!.querySelectorAll("td")).map((c) => c.textContent);
    expect(firstRow).toEqual(["Ann", "30"]);
    // right-aligned "Age" column from the `----:` separator
    expect((container.querySelector("thead th:nth-child(2)") as HTMLElement).style.textAlign).toBe("right");
  });

  test("renders markdown inside table cells (bold/code)", () => {
    const md = "| col |\n|-----|\n| **hi** `x` |";
    const { container } = render(<MdBlock text={md} />);
    expect(container.querySelector("tbody td strong")?.textContent).toBe("hi");
    expect(container.querySelector("tbody td code.inl")?.textContent).toBe("x");
  });

  // Previously-unsupported syntax (the point of moving to a real library):
  test("renders a blockquote (>)", () => {
    const { container } = render(<MdBlock text={"> a quote"} />);
    expect(container.querySelector("blockquote.md-quote")?.textContent).toContain("a quote");
  });

  test("renders *single-asterisk* emphasis as <em>", () => {
    const { container } = render(<MdBlock text={"an *italic* word"} />);
    expect(container.querySelector("em")?.textContent).toBe("italic");
    expect(container.textContent).not.toContain("*");
  });

  test("renders ~~strikethrough~~ (GFM) as <del>", () => {
    const { container } = render(<MdBlock text={"~~gone~~"} />);
    expect(container.querySelector("del")?.textContent).toBe("gone");
  });

  test("renders a nested list", () => {
    const { container } = render(<MdBlock text={"- a\n  - a1\n- b"} />);
    expect(container.querySelector("ul.md-ul ul.md-ul")).toBeInTheDocument();
  });
});
