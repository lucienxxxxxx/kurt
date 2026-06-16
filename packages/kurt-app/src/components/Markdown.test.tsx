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
});
