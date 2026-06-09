/**
 * Shared marker for tool-call arguments that a model produced but that didn't
 * parse as JSON — almost always because the output was cut off by the token
 * limit mid-arguments (e.g. writing a very large file in one call). The provider
 * tags such inputs; tools turn it into a clear, actionable error instead of a
 * confusing "missing field" message.
 */

export const MALFORMED_ARGS = "__malformedArgs";

/** If `input` is a malformed-args marker, return a helpful message; else null. */
export function malformedArgsError(input: unknown): string | null {
  const o = input as Record<string, unknown> | null;
  if (!o || o[MALFORMED_ARGS] !== true) return null;
  const truncated = o.truncated === true;
  return (
    "The tool arguments were not valid JSON" +
    (truncated ? " — they were cut off by the model's output token limit." : ".") +
    " For large content (e.g. writing a big file), raise the model's max output" +
    " (env DEEPSEEK_MAX_TOKENS) or split the work into several smaller calls" +
    " (e.g. write the file in parts)."
  );
}
