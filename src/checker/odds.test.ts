import { describe, expect, it } from "vitest";
import { cardsSeen, probAtLeast, probEachGroup } from "./odds";

describe("odds", () => {
  it("matches the Premodern storm walkthrough", () => {
    // 4 Hunting Packs by turn 4 on the play: 52.8%. 8 payoffs: 79.0%.
    expect(probAtLeast(60, 4, cardsSeen(4), 1)).toBeCloseTo(0.528, 3);
    expect(probAtLeast(60, 8, cardsSeen(4), 1)).toBeCloseTo(0.79, 2);
  });

  it("matches Fable's two-piece engine numbers", () => {
    // Both pieces by turn 3 on the play: 22% with 4 + 4, 55% with 8 + 8.
    expect(probEachGroup(60, [4, 4], cardsSeen(3))).toBeCloseTo(0.22, 2);
    expect(probEachGroup(60, [8, 8], cardsSeen(3))).toBeCloseTo(0.55, 2);
  });

  it("handles edge cases", () => {
    expect(probAtLeast(60, 0, 10, 1)).toBe(0);
    expect(probAtLeast(60, 60, 10, 1)).toBeCloseTo(1);
    expect(probEachGroup(60, [], 10)).toBe(1);
  });
});
