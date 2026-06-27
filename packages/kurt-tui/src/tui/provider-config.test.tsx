import { describe, expect, test } from "bun:test";
import { render } from "ink-testing-library";
import { ProviderConfigView, editFields, type ProvEdit } from "./provider-config.tsx";
import type { ResolvedProvider } from "../providers.ts";

const ROWS: ResolvedProvider[] = [
  { id: "deepseek", label: "DeepSeek", enabled: true, apiKey: "sk-ds", baseURL: "https://api.deepseek.com", models: ["deepseek-v4-flash"], format: "openai", custom: false },
  { id: "custom", label: "Custom", enabled: false, apiKey: "", baseURL: "", models: [], format: "openai", custom: true },
];

describe("editFields", () => {
  test("custom adds the format field", () => {
    expect(editFields(false)).toEqual(["apiKey", "baseURL", "models"]);
    expect(editFields(true)).toEqual(["apiKey", "baseURL", "models", "format"]);
  });
});

describe("ProviderConfigView render", () => {
  test("list mode shows enabled marks, key status, and models", () => {
    const { lastFrame, unmount } = render(<ProviderConfigView rows={ROWS} selected={0} edit={null} />);
    const frame = lastFrame() ?? "";
    expect(frame).toContain("DeepSeek");
    expect(frame).toContain("[x]");
    expect(frame).toContain("key:set");
    expect(frame).toContain("Custom");
    expect(frame).toContain("[ ]");
    expect(frame).toContain("key:none");
    unmount();
  });

  test("edit mode masks the API key and lists fields", () => {
    const edit: ProvEdit = { id: "deepseek", label: "DeepSeek", custom: false, field: 0, apiKey: "sk-123456", baseURL: "", models: "", format: "openai" };
    const { lastFrame, unmount } = render(<ProviderConfigView rows={ROWS} selected={0} edit={edit} />);
    const frame = lastFrame() ?? "";
    expect(frame).toContain("Edit DeepSeek");
    expect(frame).toContain("API key");
    expect(frame).toContain("3456"); // last 4 shown
    expect(frame).not.toContain("sk-123456"); // full key never rendered
    unmount();
  });
});
