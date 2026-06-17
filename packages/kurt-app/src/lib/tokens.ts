/** Rough, offline token estimation for the context meter. The model API only
 *  reports input/output/total — never a thinking/tool split — so the per-category
 *  breakdown is ESTIMATED from text length (CJK ≈ 1 token/char, else ≈ 1/4). */

export function estimateTokens(text: string): number {
  if (!text) return 0;
  const cjk = (text.match(/[㐀-鿿豈-﫿぀-ヿ가-힯]/g) ?? []).length;
  const rest = text.length - cjk;
  return Math.ceil(cjk + rest / 4);
}
