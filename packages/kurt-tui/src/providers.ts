/**
 * Multi-provider model config for the TUI (persisted inside ~/.kurt/config.json
 * under `providers`). Mirrors the desktop bridge's provider model so the two
 * front-ends stay consistent.
 *
 * Four providers: three built-ins (openai / claude / deepseek — the user just
 * supplies an API key; baseURL + a starter model list are defaulted) and `custom`
 * (free-form: baseURL + models + wire format). Each has an `enabled` toggle.
 * OpenAI / DeepSeek / custom use the OpenAI-compatible client; `claude` is stored
 * as `format:"claude"` but still routed through the OpenAI-compatible transport
 * for now (native Anthropic provider lands later — see agent.ts modelFor).
 *
 * Pure data + resolution helpers (unit-testable); all I/O lives in config.ts.
 */

export type ProviderId = "deepseek" | "openai" | "claude" | "custom";
// DeepSeek first: it's the primary channel, so it's the default model/fallback.
export const PROVIDER_IDS: ProviderId[] = ["deepseek", "openai", "claude", "custom"];

export type WireFormat = "openai" | "claude";

export interface ProviderConfig {
  enabled: boolean;
  apiKey: string;
  /** Built-ins default from PROVIDER_META; custom must set its own. */
  baseURL?: string;
  /** Selectable model ids; built-ins ship a starter list, all are editable. */
  models?: string[];
  /** Wire format. Fixed for built-ins; settable for custom. */
  format?: WireFormat;
}

export interface ProvidersConfig {
  providers: Record<ProviderId, ProviderConfig>;
}

/** Built-in defaults (label + baseURL + starter models + fixed wire format). */
export const PROVIDER_META: Record<
  ProviderId,
  { label: string; baseURL: string; models: string[]; format: WireFormat; custom: boolean }
> = {
  deepseek: { label: "DeepSeek", baseURL: "https://api.deepseek.com", models: ["deepseek-v4-flash", "deepseek-v4-pro"], format: "openai", custom: false },
  openai: { label: "OpenAI", baseURL: "https://api.openai.com/v1", models: ["gpt-4o", "gpt-4o-mini", "o3-mini"], format: "openai", custom: false },
  claude: { label: "Claude", baseURL: "https://api.anthropic.com", models: ["claude-opus-4-8", "claude-sonnet-4-6", "claude-haiku-4-5"], format: "claude", custom: false },
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
  format: WireFormat;
  custom: boolean;
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
    custom: meta.custom,
  };
}

/** Every provider, resolved (for the config UI). */
export function allProviders(cfg: ProvidersConfig): ResolvedProvider[] {
  return PROVIDER_IDS.map((id) => resolveProvider(id, cfg.providers[id]));
}

/** Enabled providers with a usable config (models + baseURL). */
export function enabledProviders(cfg: ProvidersConfig): ResolvedProvider[] {
  return allProviders(cfg).filter((p) => p.enabled && p.models.length > 0 && p.baseURL);
}

/** Usable providers = enabled + a key (the TUI needs a key to actually run). */
export function usableProviders(cfg: ProvidersConfig): ResolvedProvider[] {
  return enabledProviders(cfg).filter((p) => p.apiKey.length > 0);
}

/** Flat union of usable providers' models (the model dropdown's options). */
export function usableModels(cfg: ProvidersConfig): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of usableProviders(cfg)) for (const m of p.models) if (!seen.has(m)) { seen.add(m); out.push(m); }
  return out;
}

/** Which usable provider serves `modelId` (first listing it), else the first usable one. */
export function resolveModel(cfg: ProvidersConfig, modelId: string): ResolvedProvider | null {
  const usable = usableProviders(cfg);
  if (usable.length === 0) return null;
  return usable.find((p) => p.models.includes(modelId)) ?? usable[0]!;
}

/** The default model id (first usable provider's first model), or "". */
export function defaultModel(cfg: ProvidersConfig): string {
  return usableProviders(cfg)[0]?.models[0] ?? "";
}

/** A blank config with everything disabled. */
export function emptyProviders(): ProvidersConfig {
  const providers = {} as Record<ProviderId, ProviderConfig>;
  for (const id of PROVIDER_IDS) providers[id] = { enabled: false, apiKey: "" };
  return { providers };
}

/** Old single-provider shape (pre multi-provider TUI config). */
interface LegacyShape {
  apiKey?: string;
  baseURL?: string;
  models?: string[];
  model?: string;
  format?: WireFormat;
  providers?: Record<string, ProviderConfig>;
}

/**
 * Build a ProvidersConfig from the persisted config object (new `providers` shape
 * or the legacy flat {apiKey,baseURL,model}) plus env keys. Env keys turn a
 * provider on for dev without clobbering an explicit file key.
 */
export function normalizeProviders(raw: unknown, env: Record<string, string | undefined> = process.env): ProvidersConfig {
  const cfg = emptyProviders();
  const obj: LegacyShape = raw && typeof raw === "object" ? (raw as LegacyShape) : {};

  if (obj.providers && typeof obj.providers === "object") {
    const p = obj.providers;
    for (const id of PROVIDER_IDS) {
      const v = p[id];
      if (v && typeof v === "object") {
        cfg.providers[id] = { enabled: !!v.enabled, apiKey: v.apiKey ?? "", baseURL: v.baseURL, models: v.models, format: v.format };
      }
    }
  } else if (obj.apiKey || obj.baseURL || obj.model || obj.models?.length) {
    // Legacy single provider → map onto deepseek / claude / custom by its baseURL.
    const models = obj.models?.length ? obj.models : obj.model ? [obj.model] : undefined;
    const url = obj.baseURL ?? "";
    const target: ProviderId =
      obj.format === "claude" || /anthropic/.test(url) ? "claude" : !url || /deepseek/.test(url) ? "deepseek" : "custom";
    cfg.providers[target] = {
      enabled: true,
      apiKey: obj.apiKey ?? "",
      baseURL: target === "custom" ? url : undefined,
      models,
      format: target === "custom" ? obj.format ?? "openai" : undefined,
    };
  }

  const envKey = (id: ProviderId, key: string | undefined): void => {
    if (key && !cfg.providers[id].apiKey) {
      cfg.providers[id].apiKey = key;
      cfg.providers[id].enabled = true;
    }
  };
  envKey("deepseek", env.DEEPSEEK_API_KEY);
  envKey("openai", env.OPENAI_API_KEY);
  envKey("claude", env.ANTHROPIC_API_KEY);

  return cfg;
}

/** Merge a partial patch onto the current config (per-provider). */
export function mergeProviders(cur: ProvidersConfig, patch: Partial<Record<ProviderId, Partial<ProviderConfig>>>): ProvidersConfig {
  const next: ProvidersConfig = { providers: { ...cur.providers } };
  for (const id of PROVIDER_IDS) {
    const p = patch[id];
    if (p) next.providers[id] = { ...cur.providers[id], ...p };
  }
  return next;
}
