// Anthropic Claude pricing, USD per 1M tokens. Update periodically.
// Reference: https://www.anthropic.com/pricing (as of 2026-04)
export const pricing: Record<
  string,
  {
    input: number;
    output: number;
    cache_write: number;
    cache_read: number;
  }
> = {
  "claude-opus-4-7": {
    input: 15,
    output: 75,
    cache_write: 18.75,
    cache_read: 1.5,
  },
  "claude-sonnet-4-6": {
    input: 3,
    output: 15,
    cache_write: 3.75,
    cache_read: 0.3,
  },
  "claude-haiku-4-5-20251001": {
    input: 1,
    output: 5,
    cache_write: 1.25,
    cache_read: 0.1,
  },
};

export type Usage = {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
};

export function computeCost(model: string, usage: Usage): number {
  const p = pricing[model];
  if (!p) return 0;
  return (
    (usage.input_tokens * p.input +
      usage.output_tokens * p.output +
      (usage.cache_creation_input_tokens ?? 0) * p.cache_write +
      (usage.cache_read_input_tokens ?? 0) * p.cache_read) /
    1_000_000
  );
}
