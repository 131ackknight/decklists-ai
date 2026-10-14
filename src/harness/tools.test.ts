import { describe, expect, it } from "vitest";
import { CardIndex } from "@/cards/card-index";
import type { Card } from "@/cards/types";
import type { DataSource } from "@/data/source";
import { runTool, toolParams, type ToolContext } from "./tools";

const card = (name: string, over: Partial<Card> = {}): Card => ({
  oracleId: name,
  name,
  manaCost: "{R}",
  cmc: 1,
  typeLine: "Instant",
  text: "Deal 3 damage to any target.",
  colors: ["R"],
  identity: ["R"],
  keywords: [],
  legal: { modern: "legal" },
  tags: [],
  ...over,
});

const index = new CardIndex({
  cards: [
    card("Lightning Bolt"),
    card("Mountain", { manaCost: "", cmc: 0, typeLine: "Basic Land — Mountain", colors: [], identity: [], producedMana: ["R"] }),
  ],
  tags: [],
});

const noData: DataSource = {
  hasFormat: () => false,
  meta: () => [],
  archetype: () => null,
  referenceList: () => null,
  cardPlayRate: () => null,
};

const ctx = (): ToolContext => ({ index, data: noData, seen: new Set(), submitted: null });
const deck = { format: "Modern", main: [{ qty: 4, name: "Lightning Bolt" }, { qty: 56, name: "Mountain" }], label: "brew" };

describe("harness tools", () => {
  it("exports a JSON schema for every tool", () => {
    for (const t of toolParams()) expect(t.input_schema.type).toBe("object");
  });

  it("rejects a deck with cards no tool returned, then accepts it after card_info", () => {
    const c = ctx();
    const first = JSON.parse(runTool("submit_deck", deck, c).content);
    expect(first.accepted).toBe(false);
    expect(first.cards).toEqual(["Lightning Bolt", "Mountain"]);

    runTool("card_info", { format: "Modern", names: ["Lightning Bolt", "Mountain"] }, c);
    const second = JSON.parse(runTool("submit_deck", deck, c).content);
    expect(second.accepted).toBe(true);
    expect(c.submitted?.label).toBe("brew");
  });

  it("reports invalid input as an error instead of throwing", () => {
    const r = runTool("draw_odds", { groups: [], turn: 3 }, ctx());
    expect(r.isError).toBe(true);
  });

  it("computes the storm payoff odds", () => {
    const r = JSON.parse(runTool("draw_odds", { groups: [{ name: "Hunting Pack", copies: 4 }], turn: 4 }, ctx()).content);
    expect(r.each[0].percent).toBeCloseTo(52.8, 1);
  });
});

import { normalizeIntent, type Intent } from "@/pipeline/intent";

describe("normalizeIntent", () => {
  const base: Intent = {
    type: "brew",
    format: "Premodern",
    archetype: null,
    namedCards: [],
    colors: { exactly: null, exclude: [] },
    constraints: [],
    pastedList: false,
    goal: "",
  };
  const isCard = (n: string) => (["dream halls", "psychatog"].includes(n.toLowerCase()) ? n : undefined);

  it("requires the card a deck is named after", () => {
    expect(normalizeIntent({ ...base, archetype: "Dream Halls" }, "a Dream Halls deck", isCard).namedCards).toEqual(["Dream Halls"]);
  });

  it("ignores face names and pasted lists when adding the archetype's card", () => {
    const faces = (n: string) => (n.toLowerCase() === "burn" ? "Turn // Burn" : undefined);
    expect(normalizeIntent({ ...base, archetype: "Burn" }, "a burn deck", faces).namedCards).toEqual([]);
    expect(normalizeIntent({ ...base, archetype: "Psychatog", pastedList: true }, "Tune\n4 Psychatog", isCard).namedCards).toEqual([]);
  });

  it("drops cards that only appear in a pasted list", () => {
    const got = normalizeIntent({ ...base, pastedList: true, namedCards: ["Psychatog"] }, "Tune this\n\n4 Psychatog\n4 Island", isCard);
    expect(got.namedCards).toEqual([]);
  });
});
