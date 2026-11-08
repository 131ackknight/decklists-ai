import { describe, expect, it } from "vitest";
import { CardIndex } from "@/cards/card-index";
import type { Card } from "@/cards/types";
import type { DataSource, RefList } from "@/data/source";
import { borrowList, borrowText, namedCards } from "./borrow";

const card = (name: string, colors: string[], typeLine = "Instant"): Card => ({
  oracleId: name,
  name,
  manaCost: "",
  cmc: 1,
  typeLine,
  text: "",
  colors,
  identity: colors,
  keywords: [],
  legal: { standard: "legal" },
  tags: [],
});

const index = new CardIndex({
  cards: [
    card("Ardyn, the Usurper", ["B"], "Legendary Creature"),
    card("Ardyn", ["B"]),
    card("Overlord of the Balemurk", ["B"], "Enchantment Creature"),
    card("Opt", ["U"]),
    card("Duress", ["B"]),
    card("Niche Trick", ["B"]),
    card("Staple Removal", ["B"]),
    card("Blue Card", ["U"]),
    card("Swamp", [], "Basic Land — Swamp"),
  ],
  tags: [],
});

describe("namedCards", () => {
  it("finds the full names in order, longest first, and skips short ones", () => {
    const found = namedCards(index, "Brew me a Standard deck built around Overlord of the Balemurk and Ardyn, the Usurper. Opt is fine.");
    expect(found.map((c) => c.name)).toEqual(["Overlord of the Balemurk", "Ardyn, the Usurper"]);
  });

  it("matches whole words only", () => {
    expect(namedCards(index, "Duresses").length).toBe(0);
  });
});

describe("borrowList", () => {
  const list = (main: string[], date = "2026-10-01"): RefList => ({ format: "standard", date, strategy: "x", main: main.map((name) => ({ qty: 4, name })) }) as RefList;
  // 20 recent lists: Staple Removal in all of them (too common), Niche Trick and Blue Card in one each.
  const recent = [...Array.from({ length: 18 }, () => list(["Staple Removal", "Swamp"])), list(["Staple Removal", "Niche Trick"]), list(["Staple Removal", "Blue Card"])];
  const data = {
    recentLists: () => recent,
    // Earlier decks: Niche Trick, Blue Card, Duress and Swamp beside Ardyn; Duress also without it.
    mainDecks: () => [
      ["Ardyn, the Usurper", "Niche Trick", "Blue Card", "Swamp", "Duress"],
      ["Ardyn, the Usurper", "Niche Trick"],
      ["Duress", "Staple Removal"],
    ],
  } as unknown as DataSource;
  const named = namedCards(index, "built around Ardyn, the Usurper");

  it("keeps little-played nonland spells in the named cards' colors, most often alongside first", () => {
    expect(borrowList(index, data, "standard", named).map((c) => c.name)).toEqual(["Niche Trick"]);
  });

  it("is empty without named cards or recent lists", () => {
    expect(borrowList(index, data, "standard", [])).toEqual([]);
    expect(borrowText("Standard", [])).toBeNull();
  });

  it("writes one line per card", () => {
    const text = borrowText("Standard", borrowList(index, data, "standard", named))!;
    expect(text).toContain("- Niche Trick: in 5% of recent lists; beside a requested card in 2 earlier decks");
  });
});
