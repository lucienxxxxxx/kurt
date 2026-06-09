/**
 * Pure display helpers for the TUI (no Ink imports → trivially testable).
 */

/** Compact a token count: 145000 → "145k", 1000000 → "1M". */
export function formatTokens(n: number): string {
  if (n >= 1_000_000) {
    const m = n / 1_000_000;
    return `${m % 1 === 0 ? m.toFixed(0) : m.toFixed(1)}M`;
  }
  if (n >= 1_000) return `${Math.round(n / 1000)}k`;
  return String(n);
}

/** Fraction of the context window consumed, clamped to [0, 1]. */
export function usedFraction(used: number, limit: number): number {
  if (limit <= 0) return 0;
  return Math.min(1, Math.max(0, used / limit));
}

/**
 * Color for the "remaining context" dot. The fuller the window, the redder:
 * lots of room → green, getting tight → yellow, nearly full → red.
 */
export function scarcityColor(used: number, limit: number): "green" | "yellow" | "red" {
  const remaining = 1 - usedFraction(used, limit);
  if (remaining > 0.5) return "green";
  if (remaining > 0.2) return "yellow";
  return "red";
}
