/**
 * Multi-provider model config for the desktop, persisted at ~/.kurt/desktop.json.
 *
 * Four providers: three built-ins (openai / claude / deepseek — the user just
 * supplies an API key; baseURL + a starter model list are defaulted) and `custom`
 * (the original free-form construction: baseURL + models + wire format). Each has
 * an `enabled` toggle. OpenAI / DeepSeek / custom use the OpenAI-compatible client;
 * `claude` is `format:"claude"` (native Anthropic provider lands in Phase 2).
 *
 * Pure data + resolution helpers so it's unit-testable; I/O (read/write/env) is at
 * the edges (`loadDesktopConfig` / `saveDesktopConfig`).
 */

export type ProviderId = "openai" | "claude" | "deepseek" | "custom";
export const PROVIDER_IDS: ProviderId[] = ["openai", "claude", "deepseek", "custom"];

export interface ProviderConfig {
  enabled: boolean;
  apiKey: string;
  /** Built-ins default from PROVIDER_META; custom must set its own. */
  baseURL?: string;
  /** Selectable model ids; built-ins ship a starter list, all are editable. */
  models?: string[];
  /** Wire format. Fixed for built-ins; settable for custom. */
  format?: "openai" | "claude";
}

export interface DesktopConfig {
  providers: Record<ProviderId, ProviderConfig>;
}

/** Built-in defaults (label + baseURL + starter models + fixed wire format). */
export const PROVIDER_META: Record<ProviderId, { label: string; baseURL: string; models: string[]; format: "openai" | "claude"; custom: boolean }> = {
  openai: { label: "OpenAI", baseURL: "https://api.openai.com/v1", models: ["gpt-4o", "gpt-4o-mini", "o3-mini"], format: "openai", custom: false },
  claude: { label: "Claude", baseURL: "https://api.anthropic.com", models: ["claude-opus-4-8", "claude-sonnet-4-6", "claude-haiku-4-5"], format: "claude", custom: false },
  deepseek: { label: "DeepSeek", baseURL: "https://api.deepseek.com", models: ["deepseek-v4-flash", "deepseek-v4-pro"], format: "openai", custom: false },
  custom: { label: "Custom", baseURL: "", models: [], format: "openai", custom: true },
};

/** The effective settings of a provider (config overrides merged onto defaults). */
export interface ResolvedProvider {
  id: ProviderId;
  label: string;
  enabled: boolean;
  apiKey: string;
  baseURL: string;
  models: string[];
  format: "openai" | "claude";
}

export function resolveProvider(id: ProviderId, c: ProviderConfig | undefined): ResolvedProvider {
  const meta = PROVIDER_META[id];
  const models = c?.models && c.models.length ? c.models : meta.models;
  return {
    id,
    label: meta.label,
    enabled: c?.enabled ?? false,
    apiKey: c?.apiKey ?? "",
    baseURL: (c?.baseURL && c.baseURL.trim()) || meta.baseURL,
    models: id === "custom" ? (c?.models ?? []) : models,
    format: meta.custom ? (c?.format ?? "openai") : meta.format,
  };
}

/** Enabled providers that actually have a usable config (a model list; built-ins
 *  also need a key, except via env). */
export function enabledProviders(cfg: DesktopConfig): ResolvedProvider[] {
  return PROVIDER_IDS.map((id) => resolveProvider(id, cfg.providers[id])).filter((p) => p.enabled && p.models.length > 0 && p.baseURL);
}

/** Flat union of all enabled providers' models (the composer's options). */
export function allModels(cfg: DesktopConfig): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of enabledProviders(cfg)) for (const m of p.models) if (!seen.has(m)) { seen.add(m); out.push(m); }
  return out;
}

/** Grouped models for the dropdown: one entry per enabled provider. */
export function providerGroups(cfg: DesktopConfig): { id: ProviderId; label: string; models: string[] }[] {
  return enabledProviders(cfg).map((p) => ({ id: p.id, label: p.label, models: p.models }));
}

/** Which provider serves `modelId` (first enabled provider listing it), else the
 *  first enabled provider (so an empty/unknown id still resolves to a default). */
export function resolveModel(cfg: DesktopConfig, modelId: string): ResolvedProvider | null {
  const enabled = enabledProviders(cfg);
  if (enabled.length === 0) return null;
  return enabled.find((p) => p.models.includes(modelId)) ?? enabled[0]!;
}

/** The default model id (first enabled provider's first model). */
export function defaultModel(cfg: DesktopConfig): string {
  return enabledProviders(cfg)[0]?.models[0] ?? "";
}

/** A blank config with built-in defaults and everything disabled. */
export function emptyConfig(): DesktopConfig {
  const providers = {} as Record<ProviderId, ProviderConfig>;
  for (const id of PROVIDER_IDS) providers[id] = { enabled: false, apiKey: "" };
  return { providers };
}

/** Old single-provider shape (pre multi-provider). */
interface LegacyConfig { apiKey?: string; baseURL?: string; models?: string[]; model?: string; format?: "openai" | "claude" }

/** Build a DesktopConfig from a parsed file (new or legacy shape) + env keys. */
export function normalizeConfig(raw: unknown, env: NodeJS.ProcessEnv = process.env): DesktopConfig {
  const cfg = emptyConfig();
  const obj = (raw && typeof raw === "object") ? (raw as Record<string, unknown>) : {};

  if (obj.providers && typeof obj.providers === "object") {
    // Already the new shape — copy known providers.
    const p = obj.providers as Record<string, ProviderConfig>;
    for (const id of PROVIDER_IDS) if (p[id] && typeof p[id] === "object") cfg.providers[id] = { enabled: !!p[id].enabled, apiKey: p[id].apiKey ?? "", baseURL: p[id].baseURL, models: p[id].models, format: p[id].format };
  } else {
    // Legacy single provider → map onto deepseek / claude / custom by its baseURL.
    const legacy = obj as LegacyConfig;
    const models = legacy.models?.length ? legacy.models : legacy.model ? [legacy.model] : undefined;
    if (legacy.apiKey || legacy.baseURL || models) {
      const url = legacy.baseURL ?? "";
      const target: ProviderId = legacy.format === "claude" || /anthropic/.test(url) ? "claude"
        : !url || /deepseek/.test(url) ? "deepseek"
        : "custom";
      cfg.providers[target] = { enabled: true, apiKey: legacy.apiKey ?? "", baseURL: target === "custom" ? url : undefined, models, format: target === "custom" ? (legacy.format ?? "openai") : undefined };
    }
  }

  // Env keys turn a provider on for dev (don't clobber an explicit file key).
  const envKey = (id: ProviderId, key?: string): void => {
    if (key && !cfg.providers[id].apiKey) { cfg.providers[id].apiKey = key; cfg.providers[id].enabled = true; }
  };
  envKey("deepseek", env.DEEPSEEK_API_KEY);
  envKey("openai", env.OPENAI_API_KEY);
  envKey("claude", env.ANTHROPIC_API_KEY);

  // Fresh install with nothing configured → enable deepseek so the app is runnable
  // out of the box once a key is added (matches the previous default).
  if (enabledProviders(cfg).length === 0 && !PROVIDER_IDS.some((id) => cfg.providers[id].apiKey)) {
    cfg.providers.deepseek.enabled = true;
  }
  return cfg;
}

/** Merge a partial DesktopConfig patch onto the current config (per-provider). */
export function mergeConfig(cur: DesktopConfig, patch: Partial<DesktopConfig>): DesktopConfig {
  if (!patch || !patch.providers) return cur;
  const next: DesktopConfig = { providers: { ...cur.providers } };
  for (const id of PROVIDER_IDS) {
    const p = patch.providers[id];
    if (p) next.providers[id] = { ...cur.providers[id], ...p };
  }
  return next;
}
