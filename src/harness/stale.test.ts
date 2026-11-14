import { describe, expect, it } from "vitest";
import { CardIndex } from "@/cards/card-index";
import type { Card } from "@/cards/types";
import type { DataSource, RefList } from "@/data/source";
import { STALE_HARD_ROUNDS, STALE_MIN_LISTS, staleUnnamed } from "./stale";
import { runTool, type ToolContext } from "./tools";

const card = (name: string, over: Partial<Card> = {}): Card => ({
  oracleId: name,
  name,
  manaCost: "{U}",
  cmc: 1,
  typeLine: "Creature — Faerie Wizard",
  text: "Flash. Flying.",
  colors: ["U"],
  identity: ["U"],
  keywords: [],
  legal: { modern: "legal" },
  tags: [],
  released: "2008-01-01",
  ...over,
});

const index = new CardIndex({
  cards: [
    card("Spellstutter Sprite"),
    card("Scion of Oona"),
    card("Harbinger of the Seas"),
    card("Brand New Faerie", { released: "2026-09-01" }),
    card("Island", { manaCost: "", cmc: 0, typeLine: "Basic Land — Island", colors: [], identity: [], producedMana: ["U"] }),
    card("Old Land", { manaCost: "", cmc: 0, typeLine: "Land", colors: [], identity: [] }),
  ],
  tags: [],
});

const list = (date: string, names: string[]): RefList =>
  ({ format: "modern", date, event: "League", place: null, strategy: "Merfolk", archetype: "Merfolk", main: names.map((name) => ({ qty: 4, name })), side: [] }) as unknown as RefList;

const dataWith = (lists: RefList[]): DataSource =>
  ({
    hasFormat: () => true,
    meta: () => [],
    archetype: () => null,
    referenceList: () => null,
    cardPlayRate: () => null,
    copyRate: () => null,
    recentLists: () => lists,
    playedWith: () => null,
    manaBase: () => null,
    mainDecks: () => [],
  }) as DataSource;

const lists = Array.from({ length: STALE_MIN_LISTS }, (_, i) => list(i === 0 ? "2026-10-14" : "2026-09-01", ["Harbinger of the Seas", "Island"]));
const main = [
  { qty: 4, name: "Spellstutter Sprite" },
  { qty: 4, name: "Scion of Oona" },
  { qty: 4, name: "Harbinger of the Seas" },
  { qty: 2, name: "Brand New Faerie" },
  { qty: 2, name: "Old Land" },
  { qty: 16, name: "Island" },
];

describe("staleUnnamed (v25)", () => {
  it("flags old spells nobody plays that the player didn't ask for", () => {
    expect(staleUnnamed(index, dataWith(lists), "modern", main, "Mono blue skies with some stax")).toEqual([
      { name: "Spellstutter Sprite", qty: 4 },
      { name: "Scion of Oona", qty: 4 },
    ]);
  });

  it("never flags cards the request names, played cards, new cards or lands", () => {
    const out = staleUnnamed(index, dataWith(lists), "modern", main, "Faeries with spellstutter sprite");
    expect(out.map((c) => c.name)).toEqual(["Scion of Oona"]);
  });

  it("says nothing when the format has too few recent lists", () => {
    expect(staleUnnamed(index, dataWith(lists.slice(1)), "modern", main, "")).toEqual([]);
  });

  it("sends the deck back once in submit_deck, then accepts it with a reason or without", () => {
    const ctx: ToolContext = { index, data: dataWith(lists), seen: new Set(), submitted: null, request: "Mono blue skies", staleCheck: true };
    runTool("card_info", { format: "Modern", names: main.map((l) => l.name) }, ctx);
    const deck = { format: "Modern", main, label: "brew" };
    const first = JSON.parse(runTool("submit_deck", deck, ctx).content);
    expect(first.accepted).toBe(false);
    expect(first.staleNote).toEqual(["Spellstutter Sprite (4)", "Scion of Oona (4)"]);
    const second = JSON.parse(runTool("submit_deck", deck, ctx).content);
    expect(second.staleNote).toBeUndefined();
  });

  it("is off unless the harness turns it on", () => {
    const ctx: ToolContext = { index, data: dataWith(lists), seen: new Set(), submitted: null, request: "Mono blue skies" };
    runTool("card_info", { format: "Modern", names: main.map((l) => l.name) }, ctx);
    expect(JSON.parse(runTool("submit_deck", { format: "Modern", main, label: "brew" }, ctx).content).staleNote).toBeUndefined();
  });
});

describe("firmer stale check (v26)", () => {
  const deck = { format: "Modern", main, label: "brew" };
  const hardCtx = (): ToolContext => {
    const c: ToolContext = { index, data: dataWith(lists), seen: new Set(), submitted: null, request: "Mono blue skies", staleCheck: true, staleHard: true };
    runTool("card_info", { format: "Modern", names: main.map((l) => l.name) }, c);
    return c;
  };
  const why = (name: string) => ({ id: `stale-${name}`, response: "it earns its slot here" });

  it("rechecks every submission and lets one card stay with a reason", () => {
    const c = hardCtx();
    const first = JSON.parse(runTool("submit_deck", deck, c).content);
    expect(first.staleNote).toEqual(["Spellstutter Sprite (4)", "Scion of Oona (4)"]);
    // A reason for one card: the other still has to go.
    const second = JSON.parse(runTool("submit_deck", { ...deck, cardNoteResponses: [why("Spellstutter Sprite")] }, c).content);
    expect(second.staleNote).toEqual(["Scion of Oona (4)"]);
    // Replace the other, keep the one with its reason: accepted by this check.
    const clean = { ...deck, main: main.filter((l) => l.name !== "Scion of Oona").concat([{ qty: 4, name: "Island" }]), cardNoteResponses: [why("Spellstutter Sprite")] };
    expect(JSON.parse(runTool("submit_deck", clean, c).content).staleNote).toBeUndefined();
  });

  it("won't take reasons for more than one card", () => {
    const c = hardCtx();
    const r = JSON.parse(runTool("submit_deck", { ...deck, cardNoteResponses: [why("Spellstutter Sprite"), why("Scion of Oona")] }, c).content);
    expect(r.staleNote).toEqual(["Spellstutter Sprite (4)", "Scion of Oona (4)"]);
    expect(r.howToProceed).toContain("keep at most one");
  });

  it("lets the deck through after the last round rather than lose the brew", () => {
    const c = hardCtx();
    for (let i = 0; i < STALE_HARD_ROUNDS; i++) expect(JSON.parse(runTool("submit_deck", deck, c).content).accepted).toBe(false);
    expect(JSON.parse(runTool("submit_deck", deck, c).content).staleNote).toBeUndefined();
  });
});
