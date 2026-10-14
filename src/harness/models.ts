/** Models the harness runs on, with list prices (USD per million tokens). */
export interface ModelConfig {
  id: string;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  /** Sends output_config.effort. Haiku 4.5 rejects it. */
  effort: boolean;
}

export const MODELS: Record<string, ModelConfig> = {
  "claude-haiku-4-5": { id: "claude-haiku-4-5", input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25, effort: false },
  "claude-haiku-5-5": { id: "claude-haiku-5-5", input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125, effort: true },
  "claude-sonnet-5-5": { id: "claude-sonnet-5-5", input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5, effort: true },
  "claude-opus-5-5": { id: "claude-opus-5-5", input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5, effort: true },
  "claude-fable-5-1": { id: "claude-fable-5-1", input: 10, output: 50, cacheRead: 0.25, cacheWrite: 12.5, effort: true },
};

export interface Usage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export function costUsd(model: ModelConfig, u: Usage): number {
  return (u.input * model.input + u.output * model.output + u.cacheRead * model.cacheRead + u.cacheWrite * model.cacheWrite) / 1e6;
}
