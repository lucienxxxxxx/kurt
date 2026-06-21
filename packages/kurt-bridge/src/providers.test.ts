import { describe, expect, test } from "bun:test";
import { normalizeConfig, resolveModel, allModels, providerGroups, mergeConfig, enabledProviders } from "./providers.ts";

const noEnv = {} as NodeJS.ProcessEnv;

describe("multi-provider config", () => {
  test("legacy deepseek config migrates to the deepseek provider (enabled)", () => {
    const cfg = normalizeConfig({ apiKey: "sk-d", baseURL: "https://api.deepseek.com", models: ["deepseek-v4-pro"] }, noEnv);
    expect(cfg.providers.deepseek.enabled).toBe(true);
    expect(cfg.providers.deepseek.apiKey).toBe("sk-d");
    expect(resolveModel(cfg, "deepseek-v4-pro")?.id).toBe("deepseek");
  });

  test("legacy custom baseURL migrates to the custom provider", () => {
    const cfg = normalizeConfig({ apiKey: "sk-x", baseURL: "https://gw.example/v1", models: ["m1"], format: "openai" }, noEnv);
    expect(cfg.providers.custom.enabled).toBe(true);
    expect(cfg.providers.custom.baseURL).toBe("https://gw.example/v1");
    expect(allModels(cfg)).toEqual(["m1"]);
  });

  test("env keys enable a provider", () => {
    const cfg = normalizeConfig({}, { OPENAI_API_KEY: "sk-o" } as NodeJS.ProcessEnv);
    expect(cfg.providers.openai.enabled).toBe(true);
    expect(cfg.providers.openai.apiKey).toBe("sk-o");
    // openai built-in ships default models → resolvable
    expect(resolveModel(cfg, "gpt-4o")?.id).toBe("openai");
  });

  test("new multi-provider shape round-trips; groups list each enabled provider", () => {
    const cfg = normalizeConfig({ providers: {
      openai: { enabled: true, apiKey: "k1" },
      deepseek: { enabled: true, apiKey: "k2" },
      claude: { enabled: false, apiKey: "" },
      custom: { enabled: false, apiKey: "" },
    } }, noEnv);
    const groups = providerGroups(cfg).map((g) => g.id);
    expect(groups).toEqual(["openai", "deepseek"]);
    // union of both providers' default models
    expect(allModels(cfg)).toContain("gpt-4o");
    expect(allModels(cfg)).toContain("deepseek-v4-flash");
  });

  test("resolveModel falls back to the first enabled provider for an unknown id", () => {
    const cfg = normalizeConfig({ providers: { openai: { enabled: true, apiKey: "k" }, claude: { enabled: false, apiKey: "" }, deepseek: { enabled: false, apiKey: "" }, custom: { enabled: false, apiKey: "" } } }, noEnv);
    expect(resolveModel(cfg, "nonexistent")?.id).toBe("openai");
  });

  test("a custom provider with no models/baseURL is not enabled-usable", () => {
    const cfg = normalizeConfig({ providers: { custom: { enabled: true, apiKey: "k" }, openai: { enabled: false, apiKey: "" }, claude: { enabled: false, apiKey: "" }, deepseek: { enabled: false, apiKey: "" } } }, noEnv);
    expect(enabledProviders(cfg)).toHaveLength(0); // no models + no baseURL → excluded
  });

  test("mergeConfig patches one provider, leaving others intact", () => {
    const cur = normalizeConfig({ providers: { deepseek: { enabled: true, apiKey: "d" }, openai: { enabled: false, apiKey: "" }, claude: { enabled: false, apiKey: "" }, custom: { enabled: false, apiKey: "" } } }, noEnv);
    const next = mergeConfig(cur, { providers: { openai: { enabled: true, apiKey: "o" } } as never });
    expect(next.providers.openai.enabled).toBe(true);
    expect(next.providers.deepseek.apiKey).toBe("d");
  });
});
