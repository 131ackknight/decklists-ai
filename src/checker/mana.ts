import type { CardIndex } from "@/cards/card-index";
import type { Card } from "@/cards/types";
import { cardsSeen, probAtLeast } from "./odds";

export const COLORS = ["W", "U", "B", "R", "G"] as const;
export type Color = (typeof COLORS)[number];

export interface Entry {
  qty: number;
  card: Card;
}

const BASIC_TYPES: Record<string, Color> = {
  plains: "W",
  island: "U",
  swamp: "B",
  mountain: "R",
  forest: "G",
};

/** Front face is a land: a full land. Only a back face is a land (MDFC): half. */
export function landWeight(card: Card): number {
  const faces = card.typeLine.split(" // ");
  if (/\bLand\b/.test(faces[0])) return 1;
  return faces.some((f) => /\bLand\b/.test(f)) ? 0.5 : 0;
}

/** Colored pips per face cost. Hybrid, Phyrexian and generic-hybrid pips are flexible and skipped. */
export function pipsByFace(manaCost: string): { cmc: number; pips: Partial<Record<Color, number>> }[] {
  if (!manaCost) return [];
  return manaCost.split(" // ").map((cost) => {
    const pips: Partial<Record<Color, number>> = {};
    let cmc = 0;
    for (const [, sym] of cost.matchAll(/\{([^}]+)\}/g)) {
      if (/^\d+$/.test(sym)) cmc += Number(sym);
      else if (sym === "X" || sym === "Y") continue;
      else {
        cmc += 1;
        if ((COLORS as readonly string[]).includes(sym)) {
          pips[sym as Color] = (pips[sym as Color] ?? 0) + 1;
        }
      }
    }
    return { cmc, pips };
  });
}

/** Colors a land can make, including fetches for basic land types. */
export function landColors(card: Card, basicColorsInDeck: Set<Color>): Set<Color> {
  const out = new Set<Color>();
  for (const c of card.producedMana ?? []) {
    if ((COLORS as readonly string[]).includes(c)) out.add(c as Color);
  }
  const fetch = card.text.match(/search your library for (?:an?|up to \w+) ([^.]*?) cards?/i);
  if (fetch) {
    const what = fetch[1].toLowerCase();
    for (const [type, color] of Object.entries(BASIC_TYPES)) {
      if (what.includes(type)) out.add(color);
    }
    if (/\bbasic land\b/.test(what)) for (const c of basicColorsInDeck) out.add(c);
  }
  return out;
}

/**
 * Sources needed for ~90% on-curve casting in a 60-card deck, by pips of
 * one color and turn. Approximately Karsten (2022); every number here is
 * checked against real tournament lists in the step 5 calibration.
 */
const SOURCES_60: Record<number, number[]> = {
  //   turn: 1   2   3   4   5   6   7+
  1: [14, 13, 12, 11, 10, 9, 9],
  2: [20, 20, 18, 16, 15, 14, 13],
  3: [23, 23, 23, 21, 19, 18, 17],
  4: [24, 24, 24, 24, 22, 21, 20],
};

/** Scale the 60-card requirement to another deck size at the same draw odds. */
export function sourcesNeeded(pips: number, turn: number, deckSize: number): number {
  const row = SOURCES_60[Math.min(Math.max(pips, 1), 4)];
  const at60 = row[Math.min(Math.max(turn, 1), 7) - 1];
  if (deckSize === 60) return at60;
  const seen = cardsSeen(Math.max(turn, 1));
  const target = probAtLeast(60, at60, seen, pips);
  for (let s = pips; s <= deckSize; s++) {
    if (probAtLeast(deckSize, s, seen, pips) >= target) return s;
  }
  return deckSize;
}

export interface ColorNeed {
  color: Color;
  have: number;
  need: number;
  /** The card that sets the requirement. */
  hardest: string;
}

export interface ManaReport {
  deckSize: number;
  lands: number;
  recommendedLands: number;
  averageManaValue: number;
  cheapAccel: number;
  curve: Record<number, number>;
  /** Colored sources per color: lands, plus Moxen and half for one-mana rocks and dorks. */
  sources: Record<Color, number>;
  colors: ColorNeed[];
}

const ACCEL_TAGS = ["cantrip", "mana-dork", "ritual", "ramp", "draw"];

/** Land count model: intercept + mv × average mana value + accel × cheap draw/ramp, scaled per card. */
export interface LandModel {
  intercept: number;
  mv: number;
  accel: number;
}

/** Karsten's regressions, used where no fitted model exists. */
export const KARSTEN_60: LandModel = { intercept: 19.59, mv: 1.9, accel: -0.28 };
export const KARSTEN_99: LandModel = { intercept: 31.42, mv: 3.13, accel: -0.28 };

export function analyzeMana(index: CardIndex, main: Entry[], model?: LandModel): ManaReport {
  const deckSize = main.reduce((n, e) => n + e.qty, 0);
  const accelTags = new Set(ACCEL_TAGS.flatMap((t) => [...index.tagWithDescendants(t)]));

  let lands = 0;
  let mvTotal = 0;
  let spells = 0;
  let cheapAccel = 0;
  const curve: Record<number, number> = {};
  const basicColors = new Set<Color>();
  for (const { card } of main) {
    const basic = BASIC_TYPES[card.name.toLowerCase().replace(/^snow-covered /, "")];
    if (basic) basicColors.add(basic);
  }

  const need: Partial<Record<Color, { need: number; hardest: string }>> = {};
  for (const { qty, card } of main) {
    const w = landWeight(card);
    lands += w * qty;
    if (w === 1) continue;
    spells += qty;
    mvTotal += card.cmc * qty;
    const bucket = Math.min(Math.round(card.cmc), 7);
    curve[bucket] = (curve[bucket] ?? 0) + qty;
    if (card.cmc <= 2 && card.tags.some((t) => accelTags.has(t))) cheapAccel += qty;
    for (const face of pipsByFace(card.manaCost)) {
      for (const [color, pips] of Object.entries(face.pips) as [Color, number][]) {
        const n = sourcesNeeded(pips, face.cmc, deckSize);
        if (n > (need[color]?.need ?? 0)) need[color] = { need: n, hardest: card.name };
      }
    }
  }

  const sources: Record<Color, number> = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  for (const { qty, card } of main) {
    const w = landWeight(card);
    if (w > 0) {
      for (const c of landColors(card, basicColors)) sources[c] += qty * w;
    } else if (card.cmc <= 1 && /\b(Artifact|Creature)\b/.test(card.typeLine)) {
      // Moxen count fully, one-mana dorks and rocks as half a source.
      const rock = card.cmc === 0 ? 1 : 0.5;
      for (const c of card.producedMana ?? []) {
        if (c in sources) sources[c as Color] += qty * rock;
      }
    }
  }

  const averageManaValue = spells > 0 ? mvTotal / spells : 0;
  // Karsten's land regressions: 60-card and 99-card, scaled for other sizes.
  const m = model ?? (deckSize >= 98 ? KARSTEN_99 : KARSTEN_60);
  const base = deckSize >= 98 ? 99 : 60;
  const recommendedLands =
    (m.intercept + m.mv * averageManaValue + m.accel * cheapAccel) * (deckSize / base);

  return {
    deckSize,
    lands,
    recommendedLands: Math.round(recommendedLands * 10) / 10,
    averageManaValue: Math.round(averageManaValue * 100) / 100,
    cheapAccel,
    curve,
    sources,
    colors: (Object.entries(need) as [Color, { need: number; hardest: string }][]).map(([color, n]) => ({
      color,
      have: sources[color],
      need: n.need,
      hardest: n.hardest,
    })),
  };
}
