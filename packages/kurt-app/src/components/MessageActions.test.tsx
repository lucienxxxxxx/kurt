import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CopyButton, MessageTime } from "./MessageActions.tsx";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function withClipboard(writeText: (t: string) => Promise<void>): void {
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
}

describe("CopyButton", () => {
  test("writes the text to the clipboard and flips to the copied state", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    withClipboard(writeText);
    render(<CopyButton text="hello world" lang="en" />);
    fireEvent.click(screen.getByRole("button"));
    expect(writeText).toHaveBeenCalledWith("hello world");
    await waitFor(() => expect(screen.getByRole("button").className).toContain("done"));
    expect(screen.getByRole("button").textContent).toContain("Copied");
  });

  test("compact mode renders icon only (no label)", () => {
    render(<CopyButton text="x" lang="en" compact />);
    expect(screen.getByRole("button").textContent).toBe("");
    expect(screen.getByRole("button").className).toContain("compact");
  });
});

describe("MessageTime", () => {
  test("renders zero-padded HH:MM", () => {
    const ts = new Date(2026, 0, 1, 9, 5).getTime();
    const { container } = render(<MessageTime ts={ts} />);
    expect(container.querySelector(".msg-time")?.textContent).toBe("09:05");
  });

  test("renders nothing without a timestamp", () => {
    const { container } = render(<MessageTime />);
    expect(container.querySelector(".msg-time")).toBeNull();
  });
});
