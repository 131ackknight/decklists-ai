import { describe, expect, it } from "vitest";
import { CardIndex } from "../cards/card-index";
import type { Card } from "../cards/types";
import { applyLandSwaps, cycleKey, deckColors, isFixerRole, landAdvice, landColors, landNote, landRole, usualLands } from "./lands";

const card = (name: string, over: Partial<Card> = {}): Card => ({
  oracleId: name,
  name,
  manaCost: "",
  cmc: 0,
  typeLine: "Land",
  text: "",
  colors: [],
  identity: [],
  keywords: [],
  legal: { standard: "legal" },
  tags: [],
  ...over,
});
const basic = (name: string, color: string) => card(name, { typeLine: `Basic Land — ${name}`, text: `({T}: Add {${color}}.)`, producedMana: [color] });
const shock = (name: string, types: string, a: string, b: string) =>
  card(name, { typeLine: `Land — ${types}`, text: `({T}: Add {${a}} or {${b}}.)\nAs ${name} enters, you may pay 2 life. If you don't, it enters tapped.`, producedMana: [a, b] });
const spell = (name: string, manaCost: string, colors: string[]) => card(name, { manaCost, typeLine: "Instant", colors });

const cards = [
  basic("Island", "U"),
  basic("Swamp", "B"),
  basic("Mountain", "R"),
  shock("Blood Crypt", "Swamp Mountain", "B", "R"),
  shock("Steam Vents", "Island Mountain", "U", "R"),
  shock("Watery Grave", "Island Swamp", "U", "B"),
  card("Blazemire Verge", { text: "{T}: Add {B}.\n{T}: Add {R}. Activate only if you control a Swamp or a Mountain.", producedMana: ["B", "R"] }),
  card("Riverpyre Verge", { text: "{T}: Add {R}.\n{T}: Add {U}. Activate only if you control an Island or a Mountain.", producedMana: ["R", "U"] }),
  card("Starting Town", { text: "{T}: Add {C}.\n{T}, Pay 1 life: Add one mana of any color.", producedMana: ["C", "W", "U", "B", "R", "G"] }),
  card("Multiversal Passage", { text: "As this land enters, choose a basic land type. Then you may pay 2 life. If you don't, it enters tapped.\nThis land is the chosen type." }),
  card("Mutavault", { text: "{T}: Add {C}.\n{1}: Mutavault becomes a 2/2 Mutant creature with all creature types until end of turn. It's still a land.", producedMana: ["C"] }),
  card("Bloodstained Mire", { text: "{T}, Pay 1 life, Sacrifice Bloodstained Mire: Search your library for a Swamp or Mountain card, put it onto the battlefield, then shuffle." }),
  card("Lonely Mountain Hall", { text: "Lonely Mountain Hall enters tapped.\n{T}: Add {W}.", producedMana: ["W"] }),
  spell("Shock", "{R}", ["R"]),
  spell("Duress", "{B}", ["B"]),
  spell("Opt", "{U}", ["U"]),
  spell("Rakdos Cackler", "{B/R}{B/R}", ["B", "R"]),
  spell("Fire // Ice", "{1}{R} // {1}{U}", ["R", "U"]),
];
const index = new CardIndex({ cards, tags: [] });
const get = (name: string) => index.getCard(name)!;
const deck = (...lines: [number, string][]) => new Map(lines.map(([q, n]) => [n, q]));

describe("land cycles", () => {
  it("puts the lands of one cycle under one key, whatever their colors", () => {
    expect(cycleKey(get("Blood Crypt"))).toBe(cycleKey(get("Steam Vents")));
    expect(cycleKey(get("Blood Crypt"))).toBe(cycleKey(get("Watery Grave")));
    // "an Island" and "a Swamp" are the same text.
    expect(cycleKey(get("Blazemire Verge"))).toBe(cycleKey(get("Riverpyre Verge")));
    expect(cycleKey(get("Island"))).toBe(cycleKey(get("Mountain")));
    expect(cycleKey(get("Blood Crypt"))).not.toBe(cycleKey(get("Blazemire Verge")));
    expect(cycleKey(get("Mutavault"))).not.toBe(cycleKey(get("Starting Town")));
  });

  it("reads the colors a land gives: its mana, its basic types, the basics it fetches", () => {
    expect(landColors(get("Blood Crypt"))).toEqual(["B", "R"]);
    expect(landColors(get("Bloodstained Mire"))).toEqual(["B", "R"]);
    expect(landColors(get("Starting Town"))).toBe("any");
    expect(landColors(get("Multiversal Passage"))).toBe("any");
    expect(landColors(get("Mutavault"))).toEqual([]);
    // A basic land type in the land's own name is not a type it has.
    expect(landColors(get("Lonely Mountain Hall"))).toEqual(["W"]);
  });

  it("ranks the colors a deck's spells need, ignoring hybrid pips and back faces", () => {
    expect(deckColors(index, deck([8, "Shock"], [4, "Duress"], [4, "Rakdos Cackler"]))).toEqual(["R", "B"]);
    expect(deckColors(index, deck([8, "Shock"], [4, "Rakdos Cackler"]))).toEqual(["R"]);
    expect(deckColors(index, deck([4, "Shock"], [4, "Fire // Ice"], [3, "Opt"]))).toEqual(["R"]);
    // Reading a real list: a color also needs lands that make it.
    expect(deckColors(index, deck([8, "Shock"], [4, "Duress"], [12, "Mountain"]), true)).toEqual(["R"]);
    expect(deckColors(index, deck([8, "Shock"], [4, "Duress"], [8, "Mountain"], [4, "Blood Crypt"]), true)).toEqual(["R", "B"]);
  });

  it("gives a land its role by the rank of the deck's colors it makes", () => {
    expect(landRole(get("Blood Crypt"), ["R", "B"])).toBe("1+2");
    expect(landRole(get("Swamp"), ["R", "B"])).toBe("2");
    expect(landRole(get("Steam Vents"), ["R", "B"])).toBe("1+x");
    expect(landRole(get("Starting Town"), ["R", "B"])).toBe("any");
    expect(landRole(get("Mutavault"), ["R", "B"])).toBe("none");
  });
});

describe("usual lands", () => {
  const izzet = deck([12, "Opt"], [8, "Shock"], [4, "Steam Vents"], [4, "Riverpyre Verge"], [3, "Starting Town"], [6, "Island"], [4, "Mountain"]);
  const lists = Array.from({ length: 10 }, () => ({ deck: izzet, colors: deckColors(index, izzet, true) }));
  const copies = (slots: { name: string }[]) => {
    const n: Record<string, number> = {};
    for (const s of slots) n[s.name] = (n[s.name] ?? 0) + 1;
    return n;
  };

  it("carries what blue-red decks play over to a red-black deck, cycle by cycle", () => {
    expect(lists[0].colors).toEqual(["U", "R"]);
    const u = usualLands(index, lists, ["R", "B"], () => true)!;
    expect(u.lists).toBe(10);
    expect(u.avgLands).toBe(21);
    expect(u.avgBasics).toBe(10);
    // The main color's basic is the one the lists play six of.
    expect(copies(u.slots)).toEqual({ "Blood Crypt": 4, "Blazemire Verge": 4, "Starting Town": 3, Mountain: 6, Swamp: 4 });
    expect(u.slots.find((s) => s.name === "Blood Crypt")).toMatchObject({ share: 1, basic: false, role: "1+2" });
    expect(u.slots.find((s) => s.name === "Starting Town")).toMatchObject({ role: "any" });
  });

  it("skips a cycle with no legal land in the deck's colors, and needs enough lists", () => {
    const u = usualLands(index, lists, ["R", "B"], (c) => c.name !== "Blood Crypt")!;
    expect(copies(u.slots)["Blood Crypt"]).toBeUndefined();
    expect(copies(u.slots)["Blazemire Verge"]).toBe(4);
    expect(usualLands(index, lists.slice(0, 9), ["R", "B"], () => true)).toBeNull();
  });
});

describe("land advice", () => {
  const izzet = deck([12, "Opt"], [8, "Shock"], [4, "Steam Vents"], [4, "Riverpyre Verge"], [3, "Starting Town"], [6, "Island"], [4, "Mountain"]);
  const lists = Array.from({ length: 10 }, () => ({ deck: izzet, colors: deckColors(index, izzet, true) }));
  const usual = usualLands(index, lists, ["R", "B"], () => true)!;
  // A red-black brew with 15 basics, half the shock lands and no any-color land.
  const brew = deck([12, "Shock"], [8, "Duress"], [2, "Blood Crypt"], [4, "Blazemire Verge"], [1, "Mutavault"], [9, "Mountain"], [6, "Swamp"]);

  it("knows which lands fix colors", () => {
    expect(isFixerRole("any")).toBe(true);
    expect(isFixerRole("1+2")).toBe(true);
    expect(isFixerRole("1+x")).toBe(false);
    expect(isFixerRole("2")).toBe(false);
    expect(isFixerRole("none")).toBe(false);
  });

  it("lists the fixers the deck has fewer of, and swaps one in for each basic above the usual count", () => {
    const a = landAdvice(index, brew, usual);
    expect(a.basics).toBe(15);
    expect(a.usualBasics).toBe(10);
    expect(a.missing).toEqual([
      { name: "Blood Crypt", copies: 4, have: 2, share: 1 },
      { name: "Starting Town", copies: 3, have: 0, share: 1 },
    ]);
    // Five basics over: two Blood Crypts and three Starting Towns come in.
    expect(a.swaps.reduce((n, s) => n + s.copies, 0)).toBe(5);
    const fixed = applyLandSwaps(index, brew, a.swaps);
    expect(fixed.get("Blood Crypt")).toBe(4);
    expect(fixed.get("Starting Town")).toBe(3);
    expect((fixed.get("Mountain") ?? 0) + (fixed.get("Swamp") ?? 0)).toBe(10);
    expect([...fixed.values()].reduce((x, y) => x + y, 0)).toBe([...brew.values()].reduce((x, y) => x + y, 0));
    // The basics come out of whichever the deck has more of.
    expect(fixed.get("Mountain")).toBe(5);
    expect(fixed.get("Swamp")).toBe(5);
    expect(fixed.get("Mutavault")).toBe(1);
  });

  it("swaps nothing when the deck has no more basics than usual, and then gives no note", () => {
    const lean = deck([12, "Shock"], [8, "Duress"], [2, "Blood Crypt"], [4, "Blazemire Verge"], [5, "Mountain"], [5, "Swamp"]);
    const a = landAdvice(index, lean, usual);
    expect(a.swaps).toEqual([]);
    expect(a.missing.map((m) => m.name)).toEqual(["Blood Crypt", "Starting Town"]);
    expect(landNote("Standard", 2, usual, a)).toBeNull();
  });

  it("writes the note from the numbers", () => {
    const note = landNote("Standard", 2, usual, landAdvice(index, brew, usual))!;
    expect(note).toContain("this deck plays 15 basic lands");
    expect(note).toContain("Standard two-color decks from the last 90 days (10 lists) average 10.0 basic lands out of 21.0 lands");
    expect(note).toContain("- Blood Crypt: 4 copies in 100% of those decks; this deck has 2");
    expect(note).toContain("- Starting Town: 3 copies in 100% of those decks; this deck has 0");
    expect(note).toContain("down to about 10 basics");
  });
});
