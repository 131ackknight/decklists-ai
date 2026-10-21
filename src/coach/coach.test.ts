import { describe, expect, it } from "vitest";
import { CardIndex } from "@/cards/card-index";
import type { Card } from "@/cards/types";
import type { DataSource, RefList } from "@/data/source";
import { runTool, type ToolContext } from "@/harness/tools";
import { goldfish } from "@/sim/goldfish";
import { coachNotes, type Plan } from "./coach";

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

const index = new CardIndex({
  cards: [
    card("Combo Piece A", { typeLine: "Sorcery" }),
    card("Combo Piece B", { typeLine: "Sorcery" }),
    card("Filler", { typeLine: "Creature — Goblin", manaCost: "{1}{R}", cmc: 2 }),
    card("Lightning Bolt", { tags: ["removal-creature"] }),
    card("Searing Twig", { tags: ["removal-creature"] }),
    card("Mountain", { manaCost: "", cmc: 0, typeLine: "Basic Land — Mountain", colors: [], identity: [], producedMana: ["R"] }),
  ],
  tags: [
    { slug: "removal", label: "Removal", description: "", aliases: [], parents: [], children: ["removal-creature"] },
    { slug: "removal-creature", label: "Creature removal", description: "", aliases: [], parents: ["removal"], children: [] },
  ],
});

/** Two combo pieces in a pile of basics: legal at any count, and only the pieces matter. */
const deckWith = (pieces: number) => [
  { qty: pieces, name: "Combo Piece A" },
  { qty: pieces, name: "Combo Piece B" },
  { qty: 60 - 2 * pieces, name: "Mountain" },
];

/** 40 real aggro lists, all playing 4 Lightning Bolt. */
const lists: RefList[] = Array.from({ length: 40 }, () => ({
  format: "modern",
  date: "2026-10-01",
  event: "Modern League",
  place: null,
  record: "5-0",
  strategy: "Red Aggro",
  main: [
    { qty: 4, name: "Lightning Bolt" },
    { qty: 36, name: "Filler" },
    { qty: 20, name: "Mountain" },
  ],
  side: [],
  commander: [],
}));
const data: DataSource = {
  hasFormat: (f) => f === "modern",
  meta: () => [],
  archetype: () => null,
  referenceList: () => null,
  cardPlayRate: () => null,
  copyRate: () => null,
  recentLists: () => lists,
  playedWith: () => null,
};

const combo: Plan = {
  format: "modern",
  kind: "combo",
  thesis: "Draw both pieces and win.",
  pieces: [
    { role: "piece A", cards: ["Combo Piece A"], need: 1 },
    { role: "piece B", cards: ["Combo Piece B"], need: 1 },
  ],
  byTurn: 4,
};

describe("goldfish need counts", () => {
  it("counts cards drawn, so needing more copies than the deck has never happens", () => {
    const main = deckWith(4);
    const one = goldfish(index, { main, engine: [{ name: "A", cards: ["Combo Piece A"], need: 1 }], targetTurn: 4, games: 2000 });
    const two = goldfish(index, { main, engine: [{ name: "A", cards: ["Combo Piece A"], need: 2 }], targetTurn: 4, games: 2000 });
    const five = goldfish(index, { main, engine: [{ name: "A", cards: ["Combo Piece A"], need: 5 }], targetTurn: 4, games: 2000 });
    expect(one.engineSeenByTarget!).toBeGreaterThan(two.engineSeenByTarget!);
    expect(five.engineSeenByTarget).toBe(0);
  });
});

describe("coach", () => {
  it("flags a two-card combo with one copy each, and not one with eight of each (four plus tutors)", () => {
    expect(coachNotes(index, data, "modern", combo, deckWith(1)).map((n) => n.id)).toContain("combo-odds");
    expect(coachNotes(index, data, "modern", combo, deckWith(8)).map((n) => n.id)).not.toContain("combo-odds");
  });

  it("asks a fair deck about a removal spell nobody plays when a common one fits", () => {
    const fair: Plan = { format: "modern", kind: "fair", style: "aggro", thesis: "Attack." };
    const main = [
      { qty: 4, name: "Searing Twig" },
      { qty: 36, name: "Filler" },
      { qty: 20, name: "Mountain" },
    ];
    const notes = coachNotes(index, data, "modern", fair, main);
    expect(notes.find((n) => n.id === "fair-card-searing twig")?.message).toMatch(/Lightning Bolt \(100%\)/);
    // Unless the player asked for it.
    expect(coachNotes(index, data, "modern", fair, main, "Build me a Searing Twig deck").map((n) => n.id)).not.toContain("fair-card-searing twig");
  });

  it("submit_brew needs a plan, sends a deck back with notes, then accepts answers to them", () => {
    const ctx: ToolContext = { index, data, seen: new Set(["combo piece a", "combo piece b"]), submitted: null, plan: null, coachRounds: 0 };
    const deck = { format: "Modern", main: deckWith(1), label: "brew" };
    expect(JSON.parse(runTool("submit_brew", deck, ctx).content).accepted).toBe(false);
    expect(JSON.parse(runTool("declare_plan", combo, ctx).content).accepted).toBe(true);
    const sentBack = JSON.parse(runTool("submit_brew", deck, ctx).content);
    expect(sentBack.accepted).toBe(false);
    expect(sentBack.coachNotes.map((n: { id: string }) => n.id)).toContain("combo-odds");
    const answered = JSON.parse(
      runTool("submit_brew", { ...deck, coachResponses: [{ id: "combo-odds", response: "Test deck: the low odds are the point of this fixture." }] }, ctx).content,
    );
    expect(answered.accepted).toBe(true);
    expect(ctx.submitted?.coach?.responses).toHaveLength(1);
  });

  it("doesn't call a rare deck's own staple outclassed when asked to skip staples", () => {
    const fair: Plan = { format: "modern", kind: "fair", style: "aggro", thesis: "Attack." };
    const rare: RefList[] = Array.from({ length: 6 }, () => ({ ...lists[0], strategy: "Twig Burn", main: [{ qty: 4, name: "Searing Twig" }, { qty: 36, name: "Filler" }, { qty: 20, name: "Mountain" }] }));
    // 6 rare lists among 306: the staple's format-wide share is about 2%, under the 3% bar.
    const field = Array.from({ length: 300 }, () => lists[0]);
    const withRare: DataSource = { ...data, recentLists: () => [...field, ...rare] };
    const main = [{ qty: 4, name: "Searing Twig" }, { qty: 36, name: "Filler" }, { qty: 20, name: "Mountain" }];
    expect(coachNotes(index, withRare, "modern", fair, main).map((n) => n.id)).toContain("fair-card-searing twig");
    expect(coachNotes(index, withRare, "modern", fair, main, "", { skipStaples: true }).map((n) => n.id)).not.toContain("fair-card-searing twig");
  });
});
