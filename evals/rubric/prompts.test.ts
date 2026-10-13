import { describe, expect, it } from "vitest";
import { RUBRIC_PROMPTS } from "./prompts";

describe("rubric prompts", () => {
  it("has 20 prompts with unique ids", () => {
    expect(RUBRIC_PROMPTS).toHaveLength(20);
    expect(new Set(RUBRIC_PROMPTS.map((p) => p.id)).size).toBe(20);
  });

  it("covers formats without Decklist Data", () => {
    expect(RUBRIC_PROMPTS.filter((p) => !p.hasData).length).toBeGreaterThanOrEqual(3);
  });
});
