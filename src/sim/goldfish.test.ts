import { describe, expect, it } from "vitest";
import { CardIndex } from "@/cards/card-index";
import type { Card } from "@/cards/types";
import { goldfish } from "./goldfish";

const card = (name: string, over: Partial<Card> = {}): Card => ({
  oracleId: name,
  name,
  manaCost: "{R}",
  cmc: 1,
  typeLine: "Instant",
  text: "",
  colors: ["R"],
  identity: ["R"],
  keywords: [],
  legal: { modern: "legal" },
  tags: [],
  ...over,
});
const land = (name: string, makes: string) =>
  card(name, { manaCost: "", cmc: 0, typeLine: `Basic Land — ${name}`, colors: [], identity: [], producedMana: [makes] });

const index = new CardIndex({
  cards: [
    card("Lightning Bolt"),
    card("Counterspell", { manaCost: "{U}{U}", cmc: 2, colors: ["U"], identity: ["U"] }),
    land("Mountain", "R"),
    land("Island", "U"),
  ],
  tags: [],
});

describe("goldfish", () => {
  it("is reproducible and sane for a mono-red deck", () => {
    const deck = { main: [{ qty: 24, name: "Mountain" }, { qty: 36, name: "Lightning Bolt" }], engine: [{ name: "Bolt", cards: ["Lightning Bolt"] }], targetTurn: 1 };
    const a = goldfish(index, deck);
    const b = goldfish(index, deck);
    expect(a).toEqual(b);
    expect(a.mulliganRate).toBeLessThan(25);
    expect(a.colorOkByTurn.every((x) => x === 100)).toBe(true);
    expect(a.engineReadyByTarget).toBeGreaterThan(80);
  });

  it("sees color screw when blue spells meet mostly red lands", () => {
    const r = goldfish(index, { main: [{ qty: 22, name: "Mountain" }, { qty: 2, name: "Island" }, { qty: 36, name: "Counterspell" }] });
    expect(r.colorOkByTurn[2]).toBeLessThan(50);
  });
});
