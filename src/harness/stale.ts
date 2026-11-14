import type { CardIndex } from "@/cards/card-index";
import { normalizeName } from "@/cards/names";
import type { DataSource, QtyName } from "@/data/source";

/** "Lately" is the data's own 90-day window (`recentLists`). Cards released this close to its last day are new, not stale. */
export const STALE_NEW_DAYS = 180;
/** Below this many recent lists the format's data is too thin to call a card stale. */
export const STALE_MIN_LISTS = 50;
/** v26: how many times the check may send a deck back before it lets one through, so a brew is never lost to it. */
export const STALE_HARD_ROUNDS = 3;
/**
 * v26: stale cards the player didn't name that may stay with a reason: one card, up to 4 copies. Real decks
 * play about that many (1.3 cards, 3.5-3.8 copies a deck on both tests; scripts/stale-card-check.ts), and
 * the owner: "i dont think ALL unplayed unnammed card are bad, but probably just most of them".
 */
export const STALE_KEEP_CARDS = 1;
export const STALE_KEEP_COPIES = 4;

const DAY = 86_400_000;

/**
 * Harness v25 (2026-11-14): the main-deck spells no recent list in the format plays, that are not new, and
 * that the player did not ask for. On saved brews such cards were right 17% of the time on the dev decks,
 * 4% on the future test and 0% on its new archetypes (scripts/stale-card-check.ts); stale cards the request
 * names are right about half the time, so those are never flagged. Lands are left out (owner: stop on lands).
 */
export function staleUnnamed(index: CardIndex, data: DataSource, format: string, main: QtyName[], request: string): QtyName[] {
  const lists = data.recentLists(format);
  if (lists.length < STALE_MIN_LISTS) return [];
  const canon = (n: string) => normalizeName(index.getCard(n)?.name ?? n);
  const played = new Set<string>();
  let last = "";
  for (const l of lists) {
    if (l.date > last) last = l.date;
    for (const c of l.main) played.add(canon(c.name));
  }
  const newSince = Date.parse(last) - STALE_NEW_DAYS * DAY;
  const asked = request.toLowerCase();
  const out = new Map<string, QtyName>();
  for (const line of main) {
    const card = index.getCard(line.name);
    if (!card) continue;
    const front = card.name.split(" // ")[0];
    if (/\bLand\b/.test(card.typeLine.split(" // ")[0])) continue;
    if (played.has(canon(card.name))) continue;
    if (card.released && Date.parse(card.released) >= newSince) continue;
    if (asked.includes(front.toLowerCase())) continue;
    const prev = out.get(card.name);
    out.set(card.name, { name: card.name, qty: (prev?.qty ?? 0) + line.qty });
  }
  return [...out.values()];
}
