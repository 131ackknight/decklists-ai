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
  copyRate: () => null,
  recentLists: () => [],
  playedWith: () => null,
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
    expect(first.cards).toEqual(["Lightning Bolt"]); // basics never need a lookup

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

describe("pipeline locks", () => {
  const lockIndex = new CardIndex({
    cards: [
      card("Lightning Bolt"),
      card("Counterspell", { manaCost: "{U}{U}", cmc: 2, colors: ["U"], identity: ["U"] }),
      card("Mountain", { manaCost: "", cmc: 0, typeLine: "Basic Land — Mountain", colors: [], identity: [], producedMana: ["R"] }),
    ],
    tags: [],
  });
  const fresh = (): ToolContext => ({ index: lockIndex, data: noData, seen: new Set(["lightning bolt", "counterspell", "mountain"]), submitted: null });

  it("submit_engine requires the player's named cards and the requested colors", () => {
    const c = fresh();
    c.lock = { cards: [{ name: "Lightning Bolt", minQty: 1 }], colorsAllowed: ["R"] };
    const bad = JSON.parse(runTool("submit_engine", {
      format: "Modern", thesis: "x", winCondition: "x", targetTurn: 3, beats: [], losesTo: [],
      cards: [{ name: "Counterspell", qty: 4, role: "payoff" }],
    }, c).content);
    expect(bad.accepted).toBe(false);
    expect(bad.problems.join(" ")).toMatch(/outside the requested colors/);
    expect(bad.problems.join(" ")).toMatch(/named Lightning Bolt/);
  });

  it("submit_deck keeps the locked engine and the engine share", () => {
    const c = fresh();
    runTool("submit_engine", {
      format: "Modern", thesis: "x", winCondition: "x", targetTurn: 3, beats: [], losesTo: [],
      cards: [{ name: "Lightning Bolt", qty: 4, role: "payoff" }],
    }, c);
    c.lock = { ...c.lock!, minEngineShare: 0.25 };
    const missing = JSON.parse(runTool("submit_deck", {
      format: "Modern", label: "brew", main: [{ qty: 2, name: "Lightning Bolt" }, { qty: 58, name: "Mountain" }],
    }, c).content);
    expect(missing.accepted).toBe(false);
    expect(missing.errors.join(" ")).toMatch(/at least 4/);
    const ok = JSON.parse(runTool("submit_deck", {
      format: "Modern", label: "brew", main: [{ qty: 4, name: "Lightning Bolt" }, { qty: 56, name: "Mountain" }],
    }, c).content);
    expect(ok.accepted).toBe(true);
  });
});

describe("lock fixes from the v3 run", () => {
  const idx = new CardIndex({
    cards: [
      // A blue transform card whose back face adds green to its identity.
      card("Tamiyo", { manaCost: "{U}", colors: ["U"], identity: ["U", "G"], typeLine: "Legendary Creature — Moonfolk // Legendary Planeswalker — Tamiyo", faces: ["Tamiyo", "Tamiyo Back"] }),
      card("Island", { manaCost: "", cmc: 0, typeLine: "Basic Land — Island", colors: [], identity: [], producedMana: ["U"], legal: { modern: "legal", commander: "legal" } }),
      card("Atraxa", { manaCost: "{G}{W}{U}{B}", cmc: 4, typeLine: "Legendary Creature — Phyrexian Angel Horror", colors: ["W", "U", "B", "G"], identity: ["W", "U", "B", "G"], legal: { commander: "legal" } }),
    ],
    tags: [],
  });

  it("judges 60-card colors by the front face's cost, not identity", () => {
    const c: ToolContext = { index: idx, data: noData, seen: new Set(["tamiyo"]), submitted: null, lock: { cards: [], colorsAllowed: ["U", "B"] } };
    const r = JSON.parse(runTool("submit_deck", { format: "Modern", label: "tuned", main: [{ qty: 4, name: "Tamiyo" }, { qty: 56, name: "Island" }] }, c).content);
    expect(r.accepted).toBe(true);
  });

  it("counts the commander zone for locked cards and never asks to look up basics", () => {
    const c: ToolContext = { index: idx, data: noData, seen: new Set(["atraxa"]), submitted: null, lock: { cards: [{ name: "Atraxa", minQty: 1 }] } };
    const r = JSON.parse(runTool("submit_deck", { format: "Commander", label: "brew", commander: [{ qty: 1, name: "Atraxa" }], main: [{ qty: 99, name: "Island" }] }, c).content);
    expect(r.accepted).toBe(true);
  });

  it("a copy limit sends back a brew that is mostly one existing list, but not a stock list", () => {
    const copying: DataSource = {
      ...noData,
      copyRate: () => ({ rate: 0.9, closest: { strategy: "Mono-Red", event: "Modern Challenge", date: "2026-10-01" } }),
    };
    const c: ToolContext = { index, data: copying, seen: new Set(["lightning bolt"]), submitted: null, lock: { cards: [], maxCopyRate: 0.65 } };
    const brew = JSON.parse(runTool("submit_deck", { ...deck, label: "brew" }, c).content);
    expect(brew.accepted).toBe(false);
    expect(brew.errors.join(" ")).toMatch(/Mono-Red/);
    expect(JSON.parse(runTool("submit_deck", { ...deck, label: "stock" }, c).content).accepted).toBe(true);
    expect(JSON.parse(runTool("check_deck", deck, c).content).copy.percentOfOneExistingList).toBe(90);
  });
});

