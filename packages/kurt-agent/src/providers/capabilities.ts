/**
 * ModelCapabilities — a per-model "what can this model actually do" descriptor.
 *
 * 铁律 #3: this is pure metadata living in the PROVIDER layer, never in the
 * engine. The orchestration layer reads it to drive defaults (context window,
 * max output tokens) and to decide which knobs are even meaningful for a given
 * model (does it think? can effort be set? which sampling params get rejected in
 * thinking mode?). The engine core stays a zero-diff seam.
 *
 * Values are sourced from the vendor docs, e.g. DeepSeek's thinking-mode guide
 * (https://api-docs.deepseek.com/zh-cn/guides/thinking_mode) and model/pricing
 * page. DeepSeek's "K"/"M" are 1024-based (8K = 8192, 128K = 131072), so 1M and
 * 384K below are 1024-based too.
 */

/** Reasoning / "thinking" support for a model. */
export interface ThinkingCapability {
  /** Does the model support a reasoning pass at all? */
  supported: boolean;
  /** The vendor API's own default when we send no `thinking` field. */
  apiDefaultEnabled: boolean;
  /**
   * Effort levels the model actually DISTINGUISHES (canonical wire values),
   * coarsest→finest. DeepSeek V4 only distinguishes "high" and "max"; the
   * familiar low/medium/high knob collapses onto "high".
   */
  effortLevels: string[];
  /** Default effort when the caller doesn't specify one. */
  defaultEffort: string;
  /**
   * Sampling params the API REJECTS while thinking is enabled, so the request
   * builder must omit them. DeepSeek: temperature/top_p/presence/frequency.
   */
  unsupportedParams: string[];
}

/** Everything the orchestration layer needs to know about one model id. */
export interface ModelCapabilities {
  /** The model id this describes (e.g. "deepseek-v4-pro"). */
  id: string;
  /** Human-friendly label for UIs. */
  label: string;
  /** Context window (input + output) in tokens. */
  maxContextTokens: number;
  /** Largest single completion the model can produce, in tokens. */
  maxOutputTokens: number;
  /** Function / tool calling. */
  tools: boolean;
  /** Reasoning support. */
  thinking: ThinkingCapability;
}

/** A `ModelProvider` that advertises what it can do. (Engine-free seam.) */
export interface CapableModel {
  readonly capabilities: ModelCapabilities;
}

// ── DeepSeek V4 family ───────────────────────────────────────────────────────
// thinking_mode guide: enable via body `thinking:{type:"enabled"|"disabled"}`
// (API default enabled); effort via `reasoning_effort:"high"|"max"`; thinking
// mode rejects temperature/top_p/presence_penalty/frequency_penalty.
const DEEPSEEK_V4_THINKING: ThinkingCapability = {
  supported: true,
  apiDefaultEnabled: true,
  effortLevels: ["high", "max"],
  defaultEffort: "high",
  unsupportedParams: ["temperature", "top_p", "presence_penalty", "frequency_penalty"],
};

function deepseekV4(id: string, label: string): ModelCapabilities {
  return {
    id,
    label,
    maxContextTokens: 1_048_576, // "1M" (1024-based)
    maxOutputTokens: 393_216, // "384K" (1024-based)
    tools: true,
    thinking: DEEPSEEK_V4_THINKING,
  };
}

/** Known models, keyed by id. Unknown ids fall back to {@link UNKNOWN_MODEL}. */
export const MODEL_CAPABILITIES: Record<string, ModelCapabilities> = {
  "deepseek-v4-flash": deepseekV4("deepseek-v4-flash", "DeepSeek V4 Flash"),
  "deepseek-v4-pro": deepseekV4("deepseek-v4-pro", "DeepSeek V4 Pro"),
};

/** Conservative descriptor for a model we have no metadata for: no thinking, so
 * the request builder never sends vendor-specific reasoning fields. */
export function unknownModel(id: string): ModelCapabilities {
  return {
    id,
    label: id,
    maxContextTokens: 128_000,
    maxOutputTokens: 8_192,
    tools: true,
    thinking: {
      supported: false,
      apiDefaultEnabled: false,
      effortLevels: [],
      defaultEffort: "",
      unsupportedParams: [],
    },
  };
}

/** Look up a model's capabilities, falling back to a safe default. */
export function capabilitiesFor(id: string): ModelCapabilities {
  return MODEL_CAPABILITIES[id] ?? unknownModel(id);
}

/**
 * Map a requested effort (a UI/legacy value like low/medium/high/xhigh/max) onto
 * a wire value the model actually distinguishes. DeepSeek's documented mapping:
 * low/medium → high, xhigh → max; high/max pass through. Anything unrecognized
 * falls back to the model's default effort.
 */
export function mapEffort(effort: string | undefined, cap: ThinkingCapability): string {
  const e = (effort ?? cap.defaultEffort).trim().toLowerCase();
  const canonical = e === "xhigh" ? "max" : e === "low" || e === "medium" ? "high" : e;
  return cap.effortLevels.includes(canonical) ? canonical : cap.defaultEffort;
}
