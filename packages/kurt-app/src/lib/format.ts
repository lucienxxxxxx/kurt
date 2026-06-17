/** Small display formatters for the run-status indicator. */

/** Elapsed time as a compact string: "44s", "2m 44s". */
export function fmtElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

/** Token count, abbreviated: 999 → "999", 1500 → "1.5k", 12000 → "12k". */
export function fmtTokens(n: number): string {
  if (n < 1000) return `${n}`;
  const k = n / 1000;
  return `${k % 1 === 0 || k >= 100 ? Math.round(k) : k.toFixed(1)}k`;
}
