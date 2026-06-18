import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { Ask } from "./Ask.tsx";
import type { AskRequest } from "../lib/bridge.ts";

afterEach(cleanup);

const req: AskRequest = { id: "q1", question: "Which one do you want?", options: ["Apples", "Oranges"] };

describe("Ask panel", () => {
  test("shows the question and the options", () => {
    render(<Ask req={req} lang="en" onAnswer={vi.fn()} />);
    expect(screen.getByText("Which one do you want?")).toBeInTheDocument();
    expect(screen.getByText("Apples")).toBeInTheDocument();
    expect(screen.getByText("Oranges")).toBeInTheDocument();
  });

  test("clicking an option answers with that option's text", () => {
    const onAnswer = vi.fn();
    render(<Ask req={req} lang="en" onAnswer={onAnswer} />);
    fireEvent.click(screen.getByText("Oranges"));
    expect(onAnswer).toHaveBeenCalledWith("Oranges");
  });

  test("typing free-form and pressing Enter answers with the text", () => {
    const onAnswer = vi.fn();
    render(<Ask req={req} lang="en" onAnswer={onAnswer} />);
    const input = screen.getByPlaceholderText("Type your answer…");
    fireEvent.change(input, { target: { value: "Bananas" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onAnswer).toHaveBeenCalledWith("Bananas");
  });

  test("Skip answers with an empty string", () => {
    const onAnswer = vi.fn();
    render(<Ask req={req} lang="en" onAnswer={onAnswer} />);
    fireEvent.click(screen.getByText("Skip"));
    expect(onAnswer).toHaveBeenCalledWith("");
  });

  test("free-form works with no options", () => {
    const onAnswer = vi.fn();
    render(<Ask req={{ id: "q2", question: "Your name?" }} lang="en" onAnswer={onAnswer} />);
    const input = screen.getByPlaceholderText("Type your answer…");
    fireEvent.change(input, { target: { value: "Lew" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onAnswer).toHaveBeenCalledWith("Lew");
  });
});
