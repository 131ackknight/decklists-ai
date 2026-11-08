import { describe, expect, it } from "vitest";
import { addedScore, earlierLists, type RefList } from "./score";

const deck = (cards: Record<string, number>) => new Map(Object.entries(cards));

describe("addedScore", () => {
  // The settled deck: 30 A + 30 B. Two earlier lists: one shares 20 cards with the brew, one 40.
  const settled = [deck({ A: 30, B: 30 })];
  const brew = deck({ A: 30, B: 10, C: 20 });
  const near = deck({ A: 30, C: 10, D: 20 }); // shares 30 A + 10 C = 40 with the brew; scores 30/60 = 50
  const far = deck({ B: 10, E: 50 }); // shares 10 B with the brew; scores 10/60 = 17

  it("compares the deck with its closest earlier list, not the best one", () => {
    const r = addedScore(brew, settled, [far, near]);
    expect(r.match).toBe(67); // 40/60
    expect(r.copy).toBeCloseTo(40 / 60);
    expect(r.base).toBe(50);
    expect(r.added).toBe(17);
  });

  it("counts the whole match as added when nothing earlier shares a card", () => {
    expect(addedScore(brew, settled, []).added).toBe(67);
  });
});

describe("earlierLists", () => {
  it("keeps the format's lists from before the date", () => {
    const lists: RefList[] = [
      { format: "modern", date: "2026-01-01", strategy: "x", main: [] },
      { format: "modern", date: "2026-02-01", strategy: "x", main: [] },
      { format: "legacy", date: "2026-01-01", strategy: "x", main: [] },
    ];
    expect(earlierLists(lists, "modern", "2026-02-01", () => new Map()).length).toBe(1);
  });
});
