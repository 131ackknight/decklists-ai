/**
 * Round 4 eval items, built from the owner's picks in ITEMS.md.
 *
 * Shared by scripts/run-round4.ts and scripts/score-round4.ts so both see
 * exactly the same hidden cards and targets. Everything is deterministic.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { normalizeName } from "../../src/cards/names";
import type { CardIndex } from "../../src/cards/card-index";

export interface Line {
  qty: number;
  name: string;
}
export interface SavedList {
  deckId: string;
  url: string;
  format: string;
  strategy: string;
  eventName: string;
  eventDate: string;
  record: string | null;
  main: Line[];
  side: Line[];
}

export interface Round4Item {
  id: string;
  track: "fill" | "brew" | "fresh" | "holdout" | "expert" | "post";
  format: string;
  prompt: string;
  /** Data and cards are cut to before this date (YYYY-MM-DD); null = today's data. */
  before: string | null;
  /** The owner's list this item came from. */
  source?: SavedList;
  /** Fill in the blanks: the cards removed and the list the bot was given. */
  hidden?: Line[];
  partial?: Line[];
  /** Brew to archetype: cards the bot is given. */
  keyCards?: string[];
  /** Brew holdout: the archetype whose settled lists the brew is scored against. */
  target?: { format: string; strategy: string; firstSeen: string };
}

const DIR = "evals/round4/lists";
const HIDE = 12;
const PATTERNS = 4;

function loadLists(sub: string): SavedList[] {
  return readdirSync(path.join(DIR, sub))
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => JSON.parse(readFileSync(path.join(DIR, sub, f), "utf8")) as SavedList);
}

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const seedOf = (s: string) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, 7);

export const isLand = (index: CardIndex, name: string) => /\bLand\b/.test(index.getCard(name)?.typeLine.split(" // ")[0] ?? "");

/** Multiset helpers keyed by canonical card name. */
export function toCounts(index: CardIndex, lines: Line[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const l of lines) {
    const k = normalizeName(index.getCard(l.name)?.name ?? l.name);
    m.set(k, (m.get(k) ?? 0) + l.qty);
  }
  return m;
}

/**
 * Lists sharing at least this many main deck cards with an item's source list
 * are hidden from the bot and the baselines. Many owner picks had near-copies
 * posted earlier (429 for Broodscale), so without this, fill in the blanks
 * tests looking up a list rather than choosing cards.
 */
export const NEAR_COPY = 54;

/** True when `main` is a near-copy of the item's source list. */
export function isNearCopy(index: CardIndex, item: Round4Item, main: Line[]): boolean {
  if (!item.source) return false;
  const target = toCounts(index, item.source.main);
  let shared = 0;
  for (const [k, q] of toCounts(index, main)) shared += Math.min(q, target.get(k) ?? 0);
  return shared >= NEAR_COPY;
}

const asText = (lines: Line[]) => lines.map((l) => `${l.qty} ${l.name}`).join("\n");

function fillItems(index: CardIndex): Round4Item[] {
  return loadLists("fill-in").flatMap((list) =>
    Array.from({ length: PATTERNS }, (_, p) => {
      // One entry per copy, so a 4-of can lose some copies and keep others.
      const copies = list.main.filter((l) => !isLand(index, l.name)).flatMap((l) => Array(l.qty).fill(l.name) as string[]);
      const rand = mulberry32(seedOf(`${list.deckId}:${p}`));
      for (let i = copies.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [copies[i], copies[j]] = [copies[j], copies[i]];
      }
      const hiddenCount = new Map<string, number>();
      for (const n of copies.slice(0, HIDE)) hiddenCount.set(n, (hiddenCount.get(n) ?? 0) + 1);
      const hidden = [...hiddenCount].map(([name, qty]) => ({ qty, name }));
      const partial = list.main
        .map((l) => ({ qty: l.qty - (hiddenCount.get(l.name) ?? 0), name: l.name }))
        .filter((l) => l.qty > 0);
      const prompt = [
        `Here's my ${list.format} ${list.strategy} deck. The main deck is missing ${HIDE} nonland cards: finish it to 60.`,
        "Keep every card listed and keep the sideboard as it is.",
        "",
        asText(partial),
        "",
        "Sideboard",
        asText(list.side),
      ].join("\n");
      return {
        id: `fill-${list.format.toLowerCase()}-${list.strategy.toLowerCase().replace(/\W+/g, "-")}-${p + 1}`,
        track: "fill" as const,
        format: list.format,
        prompt,
        before: list.eventDate.slice(0, 10),
        source: list,
        hidden,
        partial,
      };
    }),
  );
}

/** Key cards per brew-to-archetype list, as proposed in ITEMS.md (owner may edit). */
const KEY_CARDS: Record<string, string[]> = {
  "Frantic Storm": ["Sapphire Medallion", "Helm of Awakening", "Brain Freeze"],
  "Dimir Control": ["Murmuring Mystic", "Thorn of the Black Rose"],
  Tron: ["Karn, the Great Creator", "The One Ring"],
  "Soultrader Combo": ["Warren Soultrader", "Gravecrawler", "Marionette Apprentice"],
  "Fanatic Eldrazi": ["Fanatic of Rhonas", "Slumbering Trudge", "Fight Rigging"],
};

function brewItems(): Round4Item[] {
  return loadLists("brew-to-archetype").map((list) => {
    const keyCards = KEY_CARDS[list.strategy];
    if (!keyCards) throw new Error(`no key cards for ${list.strategy}`);
    const named = naturalList(keyCards);
    return {
      id: `brew-${list.format.toLowerCase()}-${list.strategy.toLowerCase().replace(/\W+/g, "-")}`,
      track: "brew" as const,
      format: list.format,
      prompt: `Brew me a ${list.format} deck built around ${named}.`,
      before: list.eventDate.slice(0, 10),
      source: list,
      keyCards,
    };
  });
}

/** The owner's own words, unedited. */
const FRESH: { id: string; format: string; prompt: string }[] = [
  { id: "fresh-premodern-mono-red-prison", format: "Premodern", prompt: "Mono red prison but in Premodern?" },
  { id: "fresh-vintage-no-power", format: "Vintage", prompt: "Most competitive non-power nine vintage deck?" },
  { id: "fresh-modern-mono-black-tron", format: "Modern", prompt: "Mono black tron in Modern?" },
  { id: "fresh-premodern-city-of-traitors-black", format: "Premodern", prompt: "City of Traitors mono black premodern deck?" },
  { id: "fresh-premodern-5c-solution", format: "Premodern", prompt: "Best 5 color Solution deck in premodern?" },
];

interface Candidate {
  format: string;
  strategy: string;
  firstSeen: string;
  signature: { card: string }[];
  settledLists: number;
}

const naturalList = (cards: string[]) =>
  cards.length <= 2 ? cards.join(" and ") : `${cards.slice(0, -1).join(", ")} and ${cards.at(-1)}`;
const titleCase = (f: string) => f[0].toUpperCase() + f.slice(1);

/**
 * Brew holdout: every deck that appeared from nothing in Decklist Data's
 * history (scripts/find-new-archetypes.ts), rebuilt from the day it first
 * appeared. No list of the archetype exists before that day, so it can't be copied.
 */
function holdoutItems(file = "evals/brew-holdout/candidates.json", track: "holdout" | "expert" | "post" = "holdout", minSettled = 5): Round4Item[] {
  if (!existsSync(file)) return [];
  const candidates = JSON.parse(readFileSync(file, "utf8")) as Candidate[];
  return candidates
    .filter((c) => c.settledLists >= minSettled && c.signature.length >= 1)
    .map((c) => {
      // Front face only, as a player would say it ("Ashling, Rekindled", not both faces).
      const keyCards = c.signature.map((s) => s.card.split(" // ")[0]);
      const format = titleCase(c.format);
      return {
        id: `${track}-${c.format}-${c.strategy.toLowerCase().replace(/\W+/g, "-")}`,
        track,
        format,
        prompt: `Brew me a ${format} deck built around ${naturalList(keyCards)}.`,
        before: c.firstSeen,
        keyCards,
        target: { format: c.format, strategy: c.strategy, firstSeen: c.firstSeen },
      };
    });
}

/**
 * The expert round (2026-10-20): formats the owner knows intimately, so their
 * blind pick is the score. Fresh prompts proposed by Claude and reviewed by the
 * owner (3 cut), plus this year's new Premodern and Legacy archetypes.
 */
const EXPERT_FRESH: { id: string; format: string; prompt: string }[] = [
  { id: "expert-premodern-pandeburst", format: "Premodern", prompt: "Brew me a Premodern deck built around Pandemonium and Saproling Burst." },
  { id: "expert-premodern-miraris-wake", format: "Premodern", prompt: "Brew me a Premodern deck built around Mirari's Wake." },
  { id: "expert-premodern-life", format: "Premodern", prompt: "Brew me a Premodern deck built around Daru Spiritualist and Worthy Cause." },
  { id: "expert-premodern-draco-explosion", format: "Premodern", prompt: "Brew me a Premodern deck built around Erratic Explosion and Draco." },
  { id: "expert-premodern-winter-orb", format: "Premodern", prompt: "Brew me a mono-blue Premodern tempo deck built around Winter Orb." },
  { id: "expert-legacy-helm-rip", format: "Legacy", prompt: "Brew me a Legacy deck built around Helm of Obedience and Rest in Peace." },
  { id: "expert-legacy-worldgorger", format: "Legacy", prompt: "Brew me a Legacy deck built around Worldgorger Dragon and Animate Dead." },
  { id: "expert-legacy-belcher", format: "Legacy", prompt: "Brew me a Legacy deck built around Goblin Charbelcher." },
  { id: "expert-legacy-kaalia", format: "Legacy", prompt: "Brew me a Legacy deck built around Kaalia of the Vast." },
  { id: "expert-legacy-pyromancer-ascension", format: "Legacy", prompt: "Brew me a Legacy deck built around Pyromancer Ascension." },
  { id: "expert-legacy-mystic-remora", format: "Legacy", prompt: "Brew me a Legacy control deck built around Mystic Remora." },
];

export function round4Items(index: CardIndex): Round4Item[] {
  return [
    ...fillItems(index),
    ...brewItems(),
    ...FRESH.map((f) => ({ ...f, track: "fresh" as const, before: null })),
    ...holdoutItems(),
    ...EXPERT_FRESH.map((f) => ({ ...f, track: "expert" as const, before: null })),
    ...holdoutItems("evals/brew-holdout/candidates-expert.json", "expert", 3),
    // Post-cutoff: archetypes first seen after the models' training cutoff (June 2026). The future, for the model, today.
    ...holdoutItems("evals/brew-holdout/candidates-post.json", "post", 0),
  ];
}
