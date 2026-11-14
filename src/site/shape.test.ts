import { describe, expect, it } from "vitest";
import { CardIndex } from "@/cards/card-index";
import type { Card } from "@/cards/types";
import type { BrewResult } from "@/harness/run";
import { groupOf, toSiteDeck } from "./shape";

const card = (name: string, typeLine: string) => ({ name, typeLine }) as Card;
const index = new CardIndex({
  cards: [
    card("Ornithopter", "Artifact Creature — Thopter"),
    card("Seat of the Synod", "Artifact Land"),
    card("Urza's Saga", "Enchantment Land — Urza's Saga"),
    card("Dryad Arbor", "Land Creature — Forest Dryad"),
    card("Jace, the Mind Sculptor", "Legendary Planeswalker — Jace"),
    card("Bonecrusher Giant", "Creature — Giant // Sorcery — Adventure"),
    card("Fable of the Mirror-Breaker", "Enchantment — Saga"),
    card("Lightning Bolt", "Instant"),
    card("Duress", "Sorcery"),
    card("Shatterskull Smashing", "Sorcery // Land"),
    card("Mox Opal", "Legendary Artifact"),
    card("Island", "Basic Land — Island"),
    card("Invasion of Gobakhan", "Battle — Siege"),
  ],
  tags: [],
});

const result = (main: { qty: number; name: string }[], side: { qty: number; name: string }[] = []) =>
  ({ text: "notes", deck: { format: "modern", main, side, commander: [], label: "brew", donor: null, warnings: [] } }) as unknown as BrewResult;

describe("groupOf", () => {
  it("picks the group by the brief's rules", () => {
    const g = (n: string) => groupOf(index.getCard(n)?.typeLine);
    expect(g("Ornithopter")).toBe("Creature");
    expect(g("Seat of the Synod")).toBe("Land");
    expect(g("Urza's Saga")).toBe("Land");
    expect(g("Dryad Arbor")).toBe("Creature");
    expect(g("Jace, the Mind Sculptor")).toBe("Planeswalker");
    expect(g("Bonecrusher Giant")).toBe("Creature");
    expect(g("Fable of the Mirror-Breaker")).toBe("Enchantment");
    expect(g("Lightning Bolt")).toBe("Instant");
    expect(g("Duress")).toBe("Sorcery");
    expect(g("Shatterskull Smashing")).toBe("Sorcery");
    expect(g("Mox Opal")).toBe("Artifact");
    expect(g("Island")).toBe("Land");
    expect(g("Invasion of Gobakhan")).toBe("Other");
    expect(g("Not A Card")).toBe("Other");
  });
});

describe("toSiteDeck", () => {
  it("keeps counts and order, groups main and sideboard, and carries name, blurb and format", () => {
    const r = result(
      [
        { qty: 4, name: "Lightning Bolt" },
        { qty: 3, name: "ornithopter" },
        { qty: 20, name: "Island" },
      ],
      [
        { qty: 2, name: "Duress" },
        { qty: 1, name: "Mox Opal" },
      ],
    );
    const d = toSiteDeck(r, index, { name: "Blue Bolts", blurb: "It wins." });
    expect(d).toEqual({
      name: "Blue Bolts",
      blurb: "It wins.",
      format: "modern",
      main: [
        { qty: 4, name: "Lightning Bolt", type: "Instant" },
        { qty: 3, name: "ornithopter", type: "Creature" },
        { qty: 20, name: "Island", type: "Land" },
      ],
      side: [
        { qty: 2, name: "Duress", type: "Sorcery" },
        { qty: 1, name: "Mox Opal", type: "Artifact" },
      ],
    });
  });

  it("throws when no deck was submitted", () => {
    expect(() => toSiteDeck({ deck: null } as unknown as BrewResult, index, { name: "x", blurb: "y" })).toThrow();
  });
});
