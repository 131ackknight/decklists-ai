import type { CardIndex } from "../cards/card-index";
import type { Card } from "../cards/types";

/**
 * The usual mana base, learned by land cycle (2026-11-10). Owner: "Colors and lands i think".
 *
 * A brew's exact colors often have few real decks to learn from (5 black-red Standard lists on one dev
 * date), and those few carry their own deck's lands. But every two-color deck in a format picks from the
 * same land cycles: the shock land, the Verge, the any-color lands, so many basics. So lands are read by
 * what they are, not by name:
 *   - a land's cycle is its type line and rules text with its own name, the mana colors and the basic
 *     land types blanked out (all ten shock lands share one cycle; a one-of-a-kind land is its own);
 *   - its role in a deck is which of the deck's colors it makes, by rank: "1+2" for the dual in the
 *     deck's two main colors, "1" for the main color's basic, "any", "none" (colorless).
 * The format's recent decks with the same number of colors vote on cycle-and-role copies, and the result
 * is filled in with the lands of those cycles in the brew's own colors. Nothing here names a card.
 */
export type Qty = Map<string, number>;

const COLORS = ["W", "U", "B", "R", "G"];
const BASIC_TYPE_COLOR: Record<string, string> = { Plains: "W", Island: "U", Swamp: "B", Mountain: "R", Forest: "G" };
const BASIC_TYPES = /\b(Plains|Island|Swamp|Mountain|Forest)\b/g;

export const isLandCard = (c: Card | undefined) => /\bLand\b/.test(c?.typeLine.split(" // ")[0] ?? "");
export const isBasicLand = (c: Card | undefined) => isLandCard(c) && /\bBasic\b/.test(c!.typeLine);

/** The card's type line and text with its own name blanked out. */
function unnamed(c: Card): string {
  let s = `${c.typeLine} | ${c.text}`;
  const names = [c.name, ...(c.faces ?? []), c.name.split(",")[0]].sort((a, b) => b.length - a.length);
  for (const n of names) if (n) s = s.split(n).join("~");
  return s;
}

/** Lands with the same key are one cycle. */
export function cycleKey(c: Card): string {
  return unnamed(c)
    .replace(/\{[WUBRG]\}/g, "{c}")
    .replace(BASIC_TYPES, "basictype")
    .replace(/\b(white|blue|black|red|green)\b/gi, "color")
    .toLowerCase()
    .replace(/\ban basictype\b/g, "a basictype")
    .replace(/\s+/g, " ")
    .trim();
}

/** The colors a land gives a deck: the mana it makes and the basic land types it has or fetches. */
export function landColors(c: Card): "any" | string[] {
  const set = new Set((c.producedMana ?? []).filter((x) => COLORS.includes(x)));
  if (set.size === 5) return "any";
  const words = unnamed(c);
  for (const m of words.matchAll(BASIC_TYPES)) set.add(BASIC_TYPE_COLOR[m[1]]);
  // Fetches any basic, or becomes a basic land type of the player's choice.
  if (!set.size && /basic land (card|type)/i.test(c.text)) return "any";
  return COLORS.filter((x) => set.has(x));
}

/** The plain pips (not hybrid, not Phyrexian) of a card's front face. */
const pips = (c: Card) => [...(c.manaCost.split(" // ")[0] ?? "").matchAll(/\{([WUBRG])\}/g)].map((m) => m[1]);

/**
 * The colors of mana a deck's spells need, most pips first: colors with a plain pip on at least 4 copies
 * of nonland cards. With `madeToo`, a color also needs 3 lands that make it (for reading real lists: a
 * back face or a stray pip doesn't make a list two-color).
 */
export function deckColors(index: CardIndex, deck: Qty, madeToo = false): string[] {
  const need = new Map<string, number>();
  const count = new Map<string, number>();
  const made = new Map<string, number>();
  for (const [name, q] of deck) {
    const c = index.getCard(name);
    if (!c) continue;
    if (isLandCard(c)) {
      const cols = landColors(c);
      if (cols !== "any") for (const x of cols) made.set(x, (made.get(x) ?? 0) + q);
      continue;
    }
    const p = pips(c);
    for (const x of new Set(p)) need.set(x, (need.get(x) ?? 0) + q);
    for (const x of p) count.set(x, (count.get(x) ?? 0) + q);
  }
  return COLORS.filter((x) => (need.get(x) ?? 0) >= 4 && (!madeToo || (made.get(x) ?? 0) >= 3)).sort((a, b) => (count.get(b) ?? 0) - (count.get(a) ?? 0) || COLORS.indexOf(a) - COLORS.indexOf(b));
}

/** A land's role in a deck with these ranked colors: "any", "none", or the ranks it makes ("1+2", "2+x"). */
export function landRole(c: Card, colors: string[]): string {
  const cols = landColors(c);
  if (cols === "any") return "any";
  if (!cols.length) return "none";
  return cols
    .map((x) => (colors.includes(x) ? String(colors.indexOf(x) + 1) : "x"))
    .sort()
    .join("+");
}

export interface UsualLands {
  /** Real lists the vote is over. */
  lists: number;
  avgLands: number;
  avgBasics: number;
  /** One entry per land copy, most-voted first: `share` of the lists play that cycle-and-role copy. */
  slots: { name: string; copy: number; share: number; basic: boolean; role: string }[];
}

/**
 * The usual lands for a deck in `colors` (ranked), voted by `lists`: real decks of the same format and
 * the same number of colors, each with its own ranked colors. `legal` says which lands the deck may play
 * (in the card pool and legal in the format); a cycle with no legal land in these colors is skipped.
 */
export function usualLands(index: CardIndex, lists: { deck: Qty; colors: string[] }[], colors: string[], legal: (c: Card) => boolean, minLists = 10): UsualLands | null {
  if (lists.length < minLists) return null;
  const votes = new Map<string, number[]>();
  const played = new Map<string, number>();
  let lands = 0;
  let basics = 0;
  lists.forEach((l, li) => {
    for (const [name, q] of l.deck) {
      const c = index.getCard(name);
      if (!c || !isLandCard(c)) continue;
      lands += q;
      if (isBasicLand(c)) basics += q;
      played.set(c.name, (played.get(c.name) ?? 0) + 1);
      const token = `${cycleKey(c)}@${landRole(c, l.colors)}`;
      const row = votes.get(token) ?? votes.set(token, new Array(lists.length).fill(0)).get(token)!;
      row[li] += q;
    }
  });
  const abstract: { token: string; share: number }[] = [];
  for (const [token, qs] of votes) for (let i = 1; i <= Math.max(...qs); i++) abstract.push({ token, share: qs.filter((q) => q >= i).length / lists.length });
  abstract.sort((a, b) => b.share - a.share || a.token.localeCompare(b.token));

  // The lands of each cycle-and-role in this deck's colors, most played first.
  const byToken = new Map<string, Card[]>();
  for (const c of index.cards) {
    if (!isLandCard(c) || !legal(c)) continue;
    const token = `${cycleKey(c)}@${landRole(c, colors)}`;
    byToken.set(token, [...(byToken.get(token) ?? []), c]);
  }
  for (const cs of byToken.values()) cs.sort((a, b) => (played.get(b.name) ?? 0) - (played.get(a.name) ?? 0) || a.name.localeCompare(b.name));
  const given = new Map<string, number>();
  const slots: UsualLands["slots"] = [];
  for (const a of abstract) {
    const c = (byToken.get(a.token) ?? []).find((x) => isBasicLand(x) || (given.get(x.name) ?? 0) < 4);
    if (!c) continue;
    given.set(c.name, (given.get(c.name) ?? 0) + 1);
    slots.push({ name: c.name, copy: given.get(c.name)!, share: a.share, basic: isBasicLand(c), role: a.token.slice(a.token.lastIndexOf("@") + 1) });
  }
  return { lists: lists.length, avgLands: lands / lists.length, avgBasics: basics / lists.length, slots };
}
