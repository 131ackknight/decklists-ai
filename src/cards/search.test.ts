import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CardIndex } from "./card-index";
import { getFormat } from "./formats";
import { CARD_INDEX_PATH, loadCardIndex } from "./load";
import { searchCards } from "./search";
import type { Card, Tag } from "./types";

function card(name: string, over: Partial<Card> = {}): Card {
  return {
    oracleId: name,
    name,
    manaCost: "{G}",
    cmc: 1,
    typeLine: "Creature — Elf",
    text: "",
    colors: ["G"],
    identity: ["G"],
    keywords: [],
    legal: { premodern: "legal", legacy: "legal" },
    tags: [],
    ...over,
  };
}

const tag = (slug: string, children: string[] = [], parents: string[] = []): Tag => ({
  slug,
  label: slug,
  description: "",
  aliases: [],
  parents,
  children,
});

const index = new CardIndex({
  cards: [
    card("Llanowar Elves", { tags: ["mana-dork"], edhrecRank: 5 }),
    card("Wirewood Symbiote", { tags: ["untapper-creature"], edhrecRank: 20 }),
    card("Swords to Plowshares", {
      manaCost: "{W}",
      typeLine: "Instant",
      colors: ["W"],
      identity: ["W"],
      tags: ["removal-exile"],
    }),
    card("Otawara, Soaring City", {
      manaCost: "",
      cmc: 0,
      typeLine: "Legendary Land",
      colors: [],
      identity: ["U"],
      tags: ["removal-bounce"],
    }),
    card("Mox Pearl", {
      manaCost: "{0}",
      cmc: 0,
      typeLine: "Artifact",
      colors: [],
      identity: [],
      legal: { vintage: "restricted", legacy: "banned" },
    }),
    card("Fire // Ice", { faces: ["Fire", "Ice"], colors: ["R", "U"], identity: ["R", "U"] }),
  ],
  tags: [
    tag("removal", ["removal-exile", "removal-bounce"]),
    tag("removal-exile", [], ["removal"]),
    tag("removal-bounce", [], ["removal"]),
    tag("untapper", ["untapper-creature"]),
    tag("untapper-creature", [], ["untapper"]),
    tag("mana-dork"),
  ],
});

describe("searchCards", () => {
  it("matches a parent tag through its children", () => {
    const r = searchCards(index, { format: "legacy", tags: ["removal"] });
    expect(r.cards.map((c) => c.name).sort()).toEqual(["Otawara, Soaring City", "Swords to Plowshares"]);
  });

  it("filters by color identity, so off-color lands drop out", () => {
    const r = searchCards(index, { format: "legacy", colors: ["W"], tags: ["removal"] });
    expect(r.cards.map((c) => c.name)).toEqual(["Swords to Plowshares"]);
  });

  it("drops banned cards and keeps restricted ones flagged", () => {
    expect(searchCards(index, { format: "legacy", types: ["artifact"] }).total).toBe(0);
    const vintage = searchCards(index, { format: "vintage", types: ["artifact"] });
    expect(vintage.cards[0]).toMatchObject({ name: "Mox Pearl", restricted: true });
  });

  it("sorts by popularity and reports unknown tags", () => {
    const r = searchCards(index, { format: "premodern", colors: ["G"], tags: ["mana-dork", "untapper", "nope"] });
    expect(r.cards.map((c) => c.name)).toEqual(["Llanowar Elves", "Wirewood Symbiote"]);
    expect(r.unknownTags).toEqual(["nope"]);
  });

  it("rejects unknown formats", () => {
    expect(() => searchCards(index, { format: "Fake Format" })).toThrow(/Unknown format/);
  });
});

describe("CardIndex lookups", () => {
  it("finds split cards by full name or face, ignoring case and spacing", () => {
    expect(index.getCard("fire//ice")?.name).toBe("Fire // Ice");
    expect(index.getCard("ice")?.name).toBe("Fire // Ice");
  });
});

describe("getFormat", () => {
  it("resolves names and keys", () => {
    expect(getFormat("Premodern")?.key).toBe("premodern");
    expect(getFormat("Duel Commander")).toMatchObject({ mainSize: 100, maxCopies: 1, commander: true });
  });
});

// Step 4 gate: runs against the real Scryfall index once `pnpm cards:build` has run.
describe.skipIf(!existsSync(CARD_INDEX_PATH))("real card index", () => {
  // Loaded only when the file exists: vitest still runs this block to collect a skipped suite's tests.
  const real = existsSync(CARD_INDEX_PATH) ? loadCardIndex() : new CardIndex({ cards: [], tags: [] });

  it("finds the Premodern green untap engine", () => {
    const r = searchCards(real, { format: "premodern", colors: ["G"], tags: ["untapper"], limit: 50 });
    const names = r.cards.map((c) => c.name);
    for (const expected of ["Wirewood Symbiote", "Quirion Ranger", "Vitalize", "Early Harvest", "Seedborn Muse"]) {
      expect(names).toContain(expected);
    }
  });

  it("finds exactly the two Premodern green storm cards", () => {
    const r = searchCards(real, { format: "premodern", colors: ["G"], keyword: "storm" });
    expect(r.cards.map((c) => c.name).sort()).toEqual(["Hunting Pack", "Sprouting Vines"]);
  });

  it("knows Old School legality, which Scryfall sets per printing", () => {
    expect(real.getCard("Island")?.legal.oldschool).toBe("legal");
    expect(real.getCard("Swords to Plowshares")?.legal.oldschool).toBe("legal");
    expect(real.getCard("Black Lotus")?.legal.oldschool).toBe("restricted");
    expect(real.getCard("Lightning Bolt")?.legal.oldschool).toBe("legal");
    // A card printed after 1994 stays out.
    expect(real.getCard("Brainstorm")?.legal.oldschool).toBeUndefined();
  });

  it("keeps Peter Parker's Camera out of Premodern and in Modern", () => {
    const camera = real.getCard("Peter Parker's Camera");
    expect(camera?.legal.modern).toBe("legal");
    expect(camera?.legal.premodern).toBeUndefined();
  });
});
