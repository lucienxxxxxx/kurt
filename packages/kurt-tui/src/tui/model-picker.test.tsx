import { describe, expect, test } from "bun:test";
import { render } from "ink-testing-library";
import { ModelPicker, type ModelOption } from "./model-picker.tsx";

const ITEMS: ModelOption[] = [
  { model: "deepseek-v4-flash", provider: "DeepSeek" },
  { model: "gpt-4o", provider: "OpenAI" },
];

describe("ModelPicker render", () => {
  test("lists models with provider labels and marks the current one", () => {
    const { lastFrame, unmount } = render(<ModelPicker items={ITEMS} selected={0} current="deepseek-v4-flash" />);
    const frame = lastFrame() ?? "";
    expect(frame).toContain("deepseek-v4-flash");
    expect(frame).toContain("DeepSeek");
    expect(frame).toContain("gpt-4o");
    expect(frame).toContain("OpenAI");
    expect(frame).toContain("●"); // current marker
    unmount();
  });

  test("empty list points to /provider", () => {
    const { lastFrame, unmount } = render(<ModelPicker items={[]} selected={0} current="" />);
    expect(lastFrame() ?? "").toContain("/provider");
    unmount();
  });
});
