import { describe, expect, it } from "vitest";
import { costUsd, MODELS, usageOf } from "./models";
import { addUsage } from "./run";

const haiku = MODELS["claude-haiku-5-5"];
const opus = MODELS["claude-opus-5-5"];
const api = (prompt: number, output: number) => ({ input_tokens: 0, output_tokens: output, cache_read_input_tokens: prompt, cache_creation_input_tokens: 0 });

describe("long-prompt pricing", () => {
  it("prices a whole Haiku 5.5 request over 100K prompt tokens at 5 times", () => {
    expect(costUsd(haiku, usageOf(haiku, api(100_000, 1000)))).toBeCloseTo((100_000 * 0.01 + 1000 * 0.5) / 1e6, 10);
    expect(costUsd(haiku, usageOf(haiku, api(100_001, 1000)))).toBeCloseTo((5 * (100_001 * 0.01 + 1000 * 0.5)) / 1e6, 10);
  });

  it("leaves models without the tier unchanged", () => {
    expect(usageOf(opus, api(500_000, 10)).long).toBeUndefined();
  });

  it("adds long usage without changing a shallow copy's source", () => {
    const first = usageOf(haiku, api(200_000, 10));
    const total = { ...first };
    addUsage(total, usageOf(haiku, api(150_000, 20)));
    addUsage(total, usageOf(haiku, api(50_000, 5)));
    expect(first.long?.cacheRead).toBe(200_000);
    expect(total.long?.cacheRead).toBe(350_000);
    expect(costUsd(haiku, total)).toBeCloseTo((5 * (350_000 * 0.01 + 30 * 0.5) + (50_000 * 0.01 + 5 * 0.5)) / 1e6, 10);
  });
});
