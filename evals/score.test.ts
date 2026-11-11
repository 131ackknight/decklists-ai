import { describe, expect, it } from "vitest";
import { CardIndex } from "../src/cards/card-index";
import type { Card } from "../src/cards/types";
import { toCounts, type Round4Item } from "./round4/items";
import { addedScore, bestPart, earlierLists, partScorer, partScores, peerPart, unnamedSignature, type RefList } from "./score";

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

describe("the score on part of a deck", () => {
  const spellsOnly = (k: string) => !k.startsWith("Land");

  it("is the match % for whole 60-card decks", () => {
    expect(partScorer([deck({ A: 30, B: 30 })], () => true)(deck({ A: 30, B: 10, C: 20 }))).toBeCloseTo((40 / 60) * 100);
  });

  it("takes the rejected cards out of both piles and divides by their average size", () => {
    // Real: 36 spells and 24 lands. Build: 40 spells (20 shared) and 20 other lands.
    const settled = [deck({ A: 20, B: 16, "Land X": 24 })];
    expect(partScorer(settled, spellsOnly)(deck({ A: 20, C: 20, "Land Y": 20 }))).toBeCloseTo(((2 * 20) / (40 + 36)) * 100);
  });

  it("counts a card that earns nothing in the size of the build's pile", () => {
    const settled = [deck({ A: 20, B: 16, "Land X": 24 })];
    const built = deck({ A: 20, C: 20, "Land Y": 20 });
    const legalOnTheDate = deck({ A: 20, "Land Y": 20 });
    expect(partScorer(settled, spellsOnly)(legalOnTheDate, built)).toBeCloseTo(((2 * 20) / (40 + 36)) * 100);
  });

  it("scores real lists against each other, and the best possible pile", () => {
    const settled = [deck({ A: 4, B: 4 }), deck({ A: 4, C: 4 })];
    expect(peerPart(settled, () => true)).toBeCloseTo(50);
    // 8 cards: A and one of B or C, 75. All 12: 2 * 8 / (12 + 8) against each list, 80.
    expect(bestPart(settled, () => true, 8)).toBeCloseTo(75);
    expect(bestPart(settled, () => true)).toBeCloseTo(80);
  });
});

describe("the cards a prompt hides", () => {
  const card = (name: string, typeLine: string): Card => ({ oracleId: name, name, manaCost: "", cmc: 0, typeLine, text: "", colors: [], identity: [], keywords: [], legal: { modern: "legal" }, tags: [] });
  const index = new CardIndex({ cards: [card("Named", "Creature"), card("Hidden", "Creature"), card("Staple", "Instant"), card("Sometimes", "Instant"), card("New Land", "Land"), card("Island", "Basic Land — Island")], tags: [] });
  const list = (date: string, strategy: string, cards: Record<string, number>): RefList => ({ format: "modern", date, strategy, main: Object.entries(cards).map(([name, qty]) => ({ qty, name })) });
  // Before the deck: 20 lists of another deck, all with Staple. Then 10 lists of the new deck.
  const lists = [
    ...Array.from({ length: 20 }, () => list("2026-01-01", "old", { Staple: 4, Island: 20 })),
    ...Array.from({ length: 10 }, (_, i) => list(`2026-03-${String(i + 1).padStart(2, "0")}`, "new", { Named: 4, Hidden: 4, Staple: 4, "New Land": 4, Island: 16, ...(i < 5 ? { Sometimes: 2 } : {}) })),
  ];
  const item = { id: "x", keyCards: ["Named"], before: "2026-03-01", target: { format: "modern", strategy: "new", firstSeen: "2026-03-01" } } as unknown as Round4Item;
  const counts = (l: RefList) => toCounts(index, l.main);
  const keyOf = (name: string) => [...toCounts(index, [{ qty: 1, name }]).keys()][0];

  it("finds the signature cards the prompt doesn't name: not lands, not staples, not cards in half the lists", () => {
    const hidden = unnamedSignature(index, lists, item, counts, () => true);
    expect([...hidden]).toEqual([keyOf("Hidden")]);
    expect(unnamedSignature(index, lists, item, counts, () => false).size).toBe(0);
  });

  it("scores a build three ways", () => {
    const p = partScores(index, lists, item, counts, () => true, 0, 30);
    expect(p.settled.length).toBe(10);
    // The build: the named card, the staple, no hidden card, other lands.
    const build = new Map([[keyOf("Named"), 4], [keyOf("Staple"), 4], [keyOf("Sometimes"), 4], [keyOf("Island"), 20]]);
    const [whole, noLands, rest] = p.of(build);
    expect(whole).toBeCloseTo(((4 + 4 + 16 + 0.5 * 2) / 60) * 100);
    // Spells: the build has 12; the lists 14 (with Sometimes) or 12. Shared 10 or 8.
    expect(noLands).toBeCloseTo((((2 * 10) / (12 + 14) + (2 * 8) / (12 + 12)) / 2) * 100);
    // Hidden card out too: the lists have 10 or 8 spells left.
    expect(rest).toBeCloseTo((((2 * 10) / (12 + 10) + (2 * 8) / (12 + 8)) / 2) * 100);
    expect(p.sizes(build)).toEqual([32, 12, 12]);
  });
});
