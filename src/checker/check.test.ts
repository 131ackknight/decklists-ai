import { describe, expect, it } from "vitest";
import { CardIndex } from "@/cards/card-index";
import type { Card } from "@/cards/types";
import { buildProfile, compareToArchetype } from "./archetype-mana";
import { checkDeck } from "./check";
import { analyzeMana, sourcesNeeded } from "./mana";
import { fromMtgoList } from "./mtgo";

const legalEverywhere = { legacy: "legal", vintage: "legal", duel: "legal", premodern: "legal" } as const;

function card(name: string, over: Partial<Card> = {}): Card {
  return {
    oracleId: name,
    name,
    manaCost: "{R}",
    cmc: 1,
    typeLine: "Instant",
    text: "",
    colors: ["R"],
    identity: ["R"],
    keywords: [],
    legal: { ...legalEverywhere },
    tags: [],
    ...over,
  };
}

const land = (name: string, produced: string[], over: Partial<Card> = {}) =>
  card(name, { manaCost: "", cmc: 0, typeLine: "Basic Land — Mountain", colors: [], identity: [], producedMana: produced, ...over });

const index = new CardIndex({
  cards: [
    card("Lightning Bolt"),
    card("Goblin Guide", { typeLine: "Creature — Goblin Scout" }),
    card("Fireblast", { manaCost: "{4}{R}{R}", cmc: 6 }),
    land("Mountain", ["R"]),
    land("Island", ["U"], { typeLine: "Basic Land — Island" }),
    land("Wooded Foothills", [], {
      typeLine: "Land",
      text: "{T}, Pay 1 life, Sacrifice Wooded Foothills: Search your library for a Mountain or Forest card, put it onto the battlefield, then shuffle.",
    }),
    card("Mox Ruby", { manaCost: "{0}", cmc: 0, typeLine: "Artifact", colors: [], identity: [], producedMana: ["R"], legal: { vintage: "restricted", legacy: "banned" } }),
    card("Mind Twist", { manaCost: "{X}{B}", colors: ["B"], identity: ["B"], typeLine: "Sorcery", legal: { legacy: "banned", vintage: "restricted" } }),
    card("Relentless Rats", { manaCost: "{1}{B}{B}", cmc: 3, colors: ["B"], identity: ["B"], typeLine: "Creature — Rat", text: "A deck can have any number of cards named Relentless Rats." }),
    card("Krenko, Mob Boss", { manaCost: "{2}{R}{R}", cmc: 4, typeLine: "Legendary Creature — Goblin Warrior" }),
    card("Counterspell", { manaCost: "{U}{U}", cmc: 2, colors: ["U"], identity: ["U"] }),
    card("Grist, the Hunger Tide", {
      manaCost: "{1}{B}{G}",
      cmc: 3,
      typeLine: "Legendary Planeswalker — Grist",
      text: "As long as Grist isn't on the battlefield, it's a 1/1 Insect creature in addition to its other types.",
      colors: ["B", "G"],
      identity: ["B", "G"],
    }),
  ],
  tags: [],
});

const burn = (lands = 20) => [
  { qty: 4, name: "Lightning Bolt" },
  { qty: 4, name: "Goblin Guide" },
  { qty: 4, name: "Fireblast" },
  { qty: 28, name: "Lightning Bolt" }, // merged with the first line: 32 total
  { qty: lands, name: "Mountain" },
];

describe("checkDeck", () => {
  it("flags copies across lines and zones, but never basics", () => {
    const r = checkDeck(index, { format: "legacy", main: burn(), side: [{ qty: 1, name: "Goblin Guide" }] });
    const codes = r.errors.map((e) => e.code);
    expect(codes.filter((c) => c === "too-many-copies")).toHaveLength(2); // Bolt 32, Guide 5
    expect(r.errors.some((e) => e.cards?.includes("Mountain"))).toBe(false);
  });

  it("checks deck size, sideboard size and banned cards", () => {
    const r = checkDeck(index, {
      format: "legacy",
      main: [{ qty: 4, name: "Lightning Bolt" }, { qty: 20, name: "Mountain" }],
      side: [{ qty: 16, name: "Mountain" }, { qty: 1, name: "Mind Twist" }],
    });
    const codes = r.errors.map((e) => e.code);
    expect(codes).toContain("main-size");
    expect(codes).toContain("sideboard-size");
    expect(r.errors.find((e) => e.code === "not-legal")?.message).toMatch(/Mind Twist is banned/);
  });

  it("enforces the restricted list unless legality is skipped", () => {
    const deck = { format: "vintage", main: [{ qty: 4, name: "Mox Ruby" }, { qty: 36, name: "Relentless Rats" }, { qty: 20, name: "Mountain" }] };
    expect(checkDeck(index, deck).errors.map((e) => e.code)).toContain("too-many-copies");
    expect(checkDeck(index, deck, { skipLegality: true }).errors).toEqual([]);
  });

  it("allows any number of Relentless Rats", () => {
    const r = checkDeck(index, { format: "legacy", main: [{ qty: 40, name: "Relentless Rats" }, { qty: 20, name: "Mountain" }] });
    expect(r.errors.filter((e) => e.code === "too-many-copies")).toEqual([]);
  });

  it("suggests close names for unknown cards", () => {
    const r = checkDeck(index, { format: "legacy", main: [{ qty: 4, name: "Lightening Bolt" }] });
    expect(r.errors[0].message).toMatch(/Did you mean Lightning Bolt/);
  });

  it("checks commander color identity", () => {
    const main = [
      { qty: 1, name: "Counterspell" },
      ...Array.from({ length: 98 }, () => ({ qty: 1, name: "Mountain" })),
    ];
    const r = checkDeck(index, { format: "duel", main, commander: [{ qty: 1, name: "Krenko, Mob Boss" }] });
    expect(r.errors.map((e) => e.code)).toContain("outside-identity");
  });

  it("warns when lands are far off, using the given tolerance", () => {
    const r = checkDeck(index, { format: "legacy", main: [{ qty: 50, name: "Relentless Rats" }, { qty: 10, name: "Mountain" }] }, { landTolerance: 3 });
    expect(r.warnings.map((w) => w.code)).toContain("land-count");
  });
});

describe("mana", () => {
  it("counts fetches for basic types in the deck and Moxen as sources", () => {
    const m = analyzeMana(index, [
      { qty: 4, card: index.getCard("Wooded Foothills")! },
      { qty: 1, card: index.getCard("Mox Ruby")! },
      { qty: 4, card: index.getCard("Lightning Bolt")! },
    ]);
    expect(m.sources.R).toBe(5);
    expect(m.lands).toBe(4);
  });

  it("asks for more sources for heavier and earlier pips", () => {
    expect(sourcesNeeded(1, 1, 60)).toBe(14);
    expect(sourcesNeeded(2, 3, 60)).toBe(18);
    expect(sourcesNeeded(1, 1, 99)).toBeGreaterThan(14);
  });
});

describe("fromMtgoList", () => {
  it("moves the commander out of the MTGO sideboard slot, including Grist", () => {
    const deck = fromMtgoList(index, {
      format: "duel",
      main: [{ qty: 99, name: "Mountain" }],
      side: [{ qty: 1, name: "Grist, the Hunger Tide" }],
    });
    expect(deck.commander).toEqual([{ qty: 1, name: "Grist, the Hunger Tide" }]);
    expect(deck.side).toEqual([]);
  });
});

describe("compareToArchetype", () => {
  it("flags land counts outside the archetype's real band", () => {
    const real = [20, 20, 20, 21, 20].map((l) =>
      analyzeMana(index, [
        { qty: l, card: index.getCard("Mountain")! },
        { qty: 60 - l, card: index.getCard("Lightning Bolt")! },
      ]),
    );
    const profile = buildProfile("legacy", "Burn", real);
    const short = analyzeMana(index, [
      { qty: 16, card: index.getCard("Mountain")! },
      { qty: 44, card: index.getCard("Lightning Bolt")! },
    ]);
    const issues = compareToArchetype(short, profile);
    expect(issues.map((i) => i.code)).toEqual(["land-count", "colored-sources"]);
    expect(compareToArchetype(real[0], profile)).toEqual([]);
  });
});
