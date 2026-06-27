import { describe, expect, test } from "bun:test";
import {
  normalizeProviders,
  resolveProvider,
  enabledProviders,
  usableProviders,
  usableModels,
  resolveModel,
  defaultModel,
  mergeProviders,
  emptyProviders,
} from "./providers.ts";

const NO_ENV = {} as Record<string, string | undefined>;

describe("resolveProvider", () => {
  test("built-in defaults fill baseURL + models + fixed format", () => {
    const p = resolveProvider("deepseek", { enabled: true, apiKey: "sk" });
    expect(p.baseURL).toBe("https://api.deepseek.com");
    expect(p.models).toEqual(["deepseek-v4-flash", "deepseek-v4-pro"]);
    expect(p.format).toBe("openai");
    expect(p.custom).toBe(false);
  });

  test("custom uses its own baseURL/models/format", () => {
    const p = resolveProvider("custom", { enabled: true, apiKey: "k", baseURL: "https://x.test/v1", models: ["m1"], format: "claude" });
    expect(p.baseURL).toBe("https://x.test/v1");
    expect(p.models).toEqual(["m1"]);
    expect(p.format).toBe("claude");
    expect(p.custom).toBe(true);
  });
});

describe("normalizeProviders", () => {
  test("new providers shape is preserved", () => {
    const cfg = normalizeProviders({ providers: { deepseek: { enabled: true, apiKey: "sk-ds" } } }, NO_ENV);
    expect(cfg.providers.deepseek).toEqual({ enabled: true, apiKey: "sk-ds", baseURL: undefined, models: undefined, format: undefined });
  });

  test("legacy flat {apiKey,model} migrates to deepseek (default baseURL)", () => {
    const cfg = normalizeProviders({ apiKey: "sk-old", model: "deepseek-v4-pro" }, NO_ENV);
    expect(cfg.providers.deepseek.enabled).toBe(true);
    expect(cfg.providers.deepseek.apiKey).toBe("sk-old");
    expect(cfg.providers.deepseek.models).toEqual(["deepseek-v4-pro"]);
  });

  test("legacy custom baseURL migrates to custom provider", () => {
    const cfg = normalizeProviders({ apiKey: "k", baseURL: "https://api.moonshot.cn/v1", model: "kimi" }, NO_ENV);
    expect(cfg.providers.custom.enabled).toBe(true);
    expect(cfg.providers.custom.baseURL).toBe("https://api.moonshot.cn/v1");
  });

  test("env key enables a provider without clobbering a file key", () => {
    const cfg = normalizeProviders({ providers: { deepseek: { enabled: false, apiKey: "file" } } }, { OPENAI_API_KEY: "sk-env" });
    expect(cfg.providers.openai.apiKey).toBe("sk-env");
    expect(cfg.providers.openai.enabled).toBe(true);
    expect(cfg.providers.deepseek.apiKey).toBe("file"); // untouched
  });
});

describe("usable models + resolution", () => {
  test("usableProviders requires enabled + key; usableModels is their union", () => {
    const cfg = normalizeProviders(
      { providers: { deepseek: { enabled: true, apiKey: "sk" }, openai: { enabled: true, apiKey: "" } } },
      NO_ENV,
    );
    expect(usableProviders(cfg).map((p) => p.id)).toEqual(["deepseek"]); // openai has no key
    expect(enabledProviders(cfg).map((p) => p.id).sort()).toEqual(["deepseek", "openai"]); // enabled (key not required)
    expect(usableModels(cfg)).toEqual(["deepseek-v4-flash", "deepseek-v4-pro"]);
    expect(defaultModel(cfg)).toBe("deepseek-v4-flash");
  });

  test("resolveModel finds the provider listing the model, else first usable", () => {
    const cfg = normalizeProviders(
      { providers: { deepseek: { enabled: true, apiKey: "a" }, openai: { enabled: true, apiKey: "b" } } },
      NO_ENV,
    );
    expect(resolveModel(cfg, "gpt-4o")?.id).toBe("openai");
    expect(resolveModel(cfg, "deepseek-v4-pro")?.id).toBe("deepseek");
    expect(resolveModel(cfg, "unknown")?.id).toBe("deepseek"); // first usable fallback
    expect(resolveModel(emptyProviders(), "x")).toBeNull();
  });
});

describe("mergeProviders", () => {
  test("per-provider shallow merge", () => {
    const cur = normalizeProviders({ providers: { deepseek: { enabled: true, apiKey: "a" } } }, NO_ENV);
    const next = mergeProviders(cur, { deepseek: { apiKey: "b" }, openai: { enabled: true, apiKey: "c" } });
    expect(next.providers.deepseek).toEqual({ enabled: true, apiKey: "b", baseURL: undefined, models: undefined, format: undefined });
    expect(next.providers.openai.apiKey).toBe("c");
  });
});
