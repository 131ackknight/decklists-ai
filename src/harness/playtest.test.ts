import { describe, expect, it } from "vitest";
import { dealGame } from "./playtest";

const deck = [
  { qty: 4, name: "Lightning Bolt" },
  { qty: 36, name: "Goblin Guide" },
  { qty: 20, name: "Mountain" },
];

describe("dealGame", () => {
  it("deals a hand, eight draws and a mulligan hand from the deck itself", () => {
    const d = dealGame(deck, 7);
    expect(d.hand).toHaveLength(7);
    expect(d.draws).toHaveLength(8);
    expect(d.backupHand).toHaveLength(7);
    const dealt = [...d.hand, ...d.draws, ...d.backupHand];
    expect(dealt.filter((c) => c === "Lightning Bolt").length).toBeLessThanOrEqual(4);
    expect(dealt.every((c) => deck.some((l) => l.name === c))).toBe(true);
  });

  it("deals the same cards for the same seed and different ones for another", () => {
    expect(dealGame(deck, 42)).toEqual(dealGame(deck, 42));
    const a = [...dealGame(deck, 1).hand, ...dealGame(deck, 1).draws].join();
    const b = [...dealGame(deck, 2).hand, ...dealGame(deck, 2).draws].join();
    expect(a).not.toEqual(b);
  });
});
