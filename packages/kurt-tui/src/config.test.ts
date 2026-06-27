import { afterEach, describe, expect, test } from "bun:test";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig, sanitize, saveConfig } from "./config.ts";
import { resolveSettings } from "./agent.ts";
import { capabilitiesFor } from "kurt-agent";

const tmpCfg = join(tmpdir(), `kurt-cfg-${process.pid}.json`);
process.env.KURT_CONFIG_PATH = tmpCfg;
afterEach(() => rmSync(tmpCfg, { force: true }));

describe("persisted config", () => {
  test("missing file → empty; save then load round-trips", async () => {
    expect(await loadConfig()).toEqual({});
    await saveConfig({ model: "deepseek-v4-pro", thinking: true });
    expect(await loadConfig()).toEqual({ model: "deepseek-v4-pro", thinking: true });
  });

  test("save merges patches", async () => {
    await saveConfig({ model: "m1", effort: "high" });
    await saveConfig({ model: "m2" });
    expect(await loadConfig()).toEqual({ model: "m2", effort: "high" });
  });

  test("sanitize drops unknown keys", () => {
    expect(sanitize({ model: "x", junk: 1 } as never)).toEqual({ model: "x" });
  });

  test("sanitize keeps apiKey (known key)", () => {
    expect(sanitize({ model: "x", apiKey: "sk-secret" } as never)).toEqual({ model: "x", apiKey: "sk-secret" });
  });

  test("providers config round-trips through save/load", async () => {
    const providers = {
      deepseek: { enabled: true, apiKey: "sk-ds" },
      openai: { enabled: false, apiKey: "" },
      claude: { enabled: false, apiKey: "" },
      custom: { enabled: true, apiKey: "k", baseURL: "https://x.test/v1", models: ["m1"], format: "openai" as const },
    };
    await saveConfig({ providers });
    expect((await loadConfig()).providers).toEqual(providers);
  });
});

describe("resolveSettings precedence (persisted > env > default)", () => {
  test("uses defaults when nothing set", () => {
    const s = resolveSettings({}, {});
    expect(s.modelId).toBe("deepseek-v4-flash");
    expect(s.effort).toBe("medium");
    expect(s.mode).toBe("agent");
    // Default maxTokens = the model's output ceiling (from capabilities), not 8192.
    expect(s.maxTokens).toBe(capabilitiesFor("deepseek-v4-flash").maxOutputTokens);
  });

  test("maxTokens: env then persisted override the model-metadata default", () => {
    expect(resolveSettings({}, { DEEPSEEK_MAX_TOKENS: "16000" }).maxTokens).toBe(16000);
    expect(resolveSettings({ maxTokens: 4096 }, { DEEPSEEK_MAX_TOKENS: "16000" }).maxTokens).toBe(4096);
  });

  test("env overrides default; persisted overrides env", () => {
    expect(resolveSettings({}, { DEEPSEEK_MODEL: "from-env" }).modelId).toBe("from-env");
    expect(resolveSettings({ model: "from-cfg" }, { DEEPSEEK_MODEL: "from-env" }).modelId).toBe("from-cfg");
  });

  test("thinking: persisted false beats reasoner auto-detect", () => {
    expect(resolveSettings({}, {}).thinking).toBe(false);
    expect(resolveSettings({}, { DEEPSEEK_MODEL: "deepseek-reasoner" }).thinking).toBe(true);
    expect(resolveSettings({ thinking: false }, { DEEPSEEK_MODEL: "deepseek-reasoner" }).thinking).toBe(false);
  });
});
