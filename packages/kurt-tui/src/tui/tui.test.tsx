/**
 * Offline TUI tests — pure view-model logic + an Ink render (no real terminal).
 */

import { describe, expect, test } from "bun:test";
import { render } from "ink-testing-library";
import { applyEvent, pushUser, type Entry } from "./entries.ts";
import { formatTokens, scarcityColor, usedFraction } from "./theme.ts";
import { bannerString } from "./banner.ts";
import { Welcome } from "./welcome.tsx";
import { App, type Compactor } from "./app.tsx";

describe("theme helpers", () => {
  test("formatTokens", () => {
    expect(formatTokens(145_000)).toBe("145k");
    expect(formatTokens(1_000_000)).toBe("1M");
    expect(formatTokens(1_500_000)).toBe("1.5M");
    expect(formatTokens(512)).toBe("512");
  });

  test("usedFraction clamps", () => {
    expect(usedFraction(50, 100)).toBe(0.5);
    expect(usedFraction(200, 100)).toBe(1);
    expect(usedFraction(10, 0)).toBe(0);
  });

  test("scarcityColor: greener when emptier, redder when fuller", () => {
    expect(scarcityColor(10, 100)).toBe("green"); // 90% remaining
    expect(scarcityColor(70, 100)).toBe("yellow"); // 30% remaining
    expect(scarcityColor(95, 100)).toBe("red"); // 5% remaining
  });
});

describe("entries reducer", () => {
  test("merges consecutive llm_delta into one assistant entry", () => {
    let e: Entry[] = [];
    e = applyEvent(e, { type: "llm_delta", text: "Hel" });
    e = applyEvent(e, { type: "llm_delta", text: "lo" });
    expect(e).toEqual([{ kind: "assistant", text: "Hello" }]);
  });

  test("keeps thinking separate from the answer", () => {
    let e: Entry[] = [];
    e = applyEvent(e, { type: "thinking", text: "hmm" });
    e = applyEvent(e, { type: "llm_delta", text: "answer" });
    expect(e.map((x) => x.kind)).toEqual(["thinking", "assistant"]);
  });

  test("attaches a tool_result to its tool_call", () => {
    let e: Entry[] = [];
    e = applyEvent(e, { type: "tool_call", id: "c1", name: "shell", input: { command: "ls" } });
    e = applyEvent(e, { type: "tool_result", id: "c1", content: "a\nb", isError: false });
    expect(e).toHaveLength(1);
    const tool = e[0]!;
    expect(tool.kind).toBe("tool");
    if (tool.kind === "tool") {
      expect(tool.result).toBe("a\nb");
      expect(tool.isError).toBe(false);
    }
  });

  test("error/aborted become notices", () => {
    let e: Entry[] = [];
    e = applyEvent(e, { type: "error", message: "boom", fatal: true });
    e = applyEvent(e, { type: "aborted", reason: "signal" });
    expect(e.map((x) => x.kind)).toEqual(["notice", "notice"]);
  });
});

describe("banner", () => {
  test("block-centers the art with a uniform left margin (no shear, no 'agent')", () => {
    const out = bannerString(60);
    expect(out).not.toContain("a g e n t");
    const lines = out.split("\n");
    expect(lines.length).toBe(4);
    // Every line shares the same leading whitespace → columns stay aligned.
    const leads = lines.map((l) => l.length - l.replace(/^ +/, "").length);
    expect(new Set(leads).size).toBe(1);
  });
});

describe("Welcome", () => {
  test("renders the intro and the command list", () => {
    const { lastFrame, unmount } = render(<Welcome />);
    const frame = lastFrame() ?? "";
    expect(frame).toContain("kurt-agent");
    expect(frame).toContain("/help");
    expect(frame).toContain("/compact");
    unmount();
  });
});

describe("App render (Ink, no TTY)", () => {
  test("renders status bar and accepts no-op run/compact", () => {
    const run = async function* () {
      /* no events */
    };
    const compact: Compactor = async (messages) => ({ messages, summarizedCount: 0 });
    const { lastFrame, unmount } = render(
      <App
        run={run}
        compact={compact}
        models={["deepseek-v4-flash", "deepseek-v4-pro"]}
        config={{ model: "deepseek-v4-flash", contextLimit: 1_000_000, effort: "medium", thinking: true, mode: "agent" }}
      />,
    );
    const frame = lastFrame() ?? "";
    expect(frame).toContain("deepseek-v4-flash");
    expect(frame).toContain("[agent]");
    expect(frame).toContain("ctx");
    unmount();
  });

  test("pushUser adds a user entry", () => {
    expect(pushUser([], "hi")).toEqual([{ kind: "user", text: "hi" }]);
  });
});
