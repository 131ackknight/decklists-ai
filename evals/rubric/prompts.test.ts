import { describe, expect, it } from "vitest";
import { RUBRIC_PROMPTS } from "./prompts";

describe("rubric prompts", () => {
  it("has 22 prompts with unique ids", () => {
    expect(RUBRIC_PROMPTS).toHaveLength(22);
    expect(new Set(RUBRIC_PROMPTS.map((p) => p.id)).size).toBe(22);
  });

  it("covers formats without Decklist Data", () => {
    expect(RUBRIC_PROMPTS.filter((p) => !p.hasData).length).toBeGreaterThanOrEqual(3);
  });
});
