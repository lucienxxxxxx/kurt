/** Model metadata the UI needs but the bridge doesn't send per-model yet. Keyed
 *  by a match on the model id; extend as more vendors/models are wired up. */

const DEFAULT_CONTEXT_WINDOW = 128_000;

/** The model's max context window (tokens) — denominator for the context meter. */
export function modelContextWindow(model: string): number {
  if (/deepseek/i.test(model)) return 128_000;
  return DEFAULT_CONTEXT_WINDOW;
}
