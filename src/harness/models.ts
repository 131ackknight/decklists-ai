/** Models the harness runs on, with list prices (USD per million tokens). */
export interface ModelConfig {
  id: string;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  /** Sends output_config.effort. Haiku 4.5 rejects it. */
  effort: boolean;
  /**
   * A request whose prompt (input + cache read + cache write) is over `over` tokens costs `factor` times
   * the list price, all of it (Haiku 5.5: $0.10 / $0.50 up to 100K, $0.50 / $2.50 beyond). Cache prices are
   * assumed to scale the same way, which errs on the high side.
   */
  longPrompt?: { over: number; factor: number };
}

export const MODELS: Record<string, ModelConfig> = {
  "claude-haiku-4-5": { id: "claude-haiku-4-5", input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25, effort: false },
  "claude-haiku-5-5": { id: "claude-haiku-5-5", input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125, effort: true, longPrompt: { over: 100_000, factor: 5 } },
  "claude-sonnet-5-5": { id: "claude-sonnet-5-5", input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5, effort: true },
  "claude-opus-5-5": { id: "claude-opus-5-5", input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5, effort: true },
  "claude-fable-5-1": { id: "claude-fable-5-1", input: 10, output: 50, cacheRead: 0.25, cacheWrite: 12.5, effort: true },
};

export interface Usage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  /** The part of the counts above from requests priced at the long-prompt rate (ModelConfig.longPrompt). */
  long?: Omit<Usage, "long">;
}

/** One API response's usage, with the whole request also counted under `long` when its prompt is over the model's long-prompt line. */
export function usageOf(
  model: ModelConfig,
  u: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null },
): Usage {
  const base = { input: u.input_tokens, output: u.output_tokens, cacheRead: u.cache_read_input_tokens ?? 0, cacheWrite: u.cache_creation_input_tokens ?? 0 };
  return model.longPrompt && base.input + base.cacheRead + base.cacheWrite > model.longPrompt.over ? { ...base, long: { ...base } } : base;
}

export function costUsd(model: ModelConfig, u: Usage): number {
  const price = (x: Omit<Usage, "long">) => (x.input * model.input + x.output * model.output + x.cacheRead * model.cacheRead + x.cacheWrite * model.cacheWrite) / 1e6;
  return price(u) + (u.long && model.longPrompt ? (model.longPrompt.factor - 1) * price(u.long) : 0);
}
