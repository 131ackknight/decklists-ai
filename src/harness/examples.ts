import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { CardIndex } from "@/cards/card-index";
import { normalizeName } from "@/cards/names";
import type { DataSource, QtyName } from "@/data/source";

/**
 * Harness v7's worked examples: real brews by a strong brewer, annotated in
 * code so the model sees the pattern rather than a list to copy. For each
 * brew: the package borrowed from an existing deck (cards shared with the
 * closest earlier list of another archetype), the new ideas (nonland cards
 * nobody in the format had played in the prior 90 days), and the rest.
 *
 * Measured on AspiringSpike's public Modern lists (BUILD_LOG.md, 2026-10-19):
 * brews borrow about 50% from other decks and add 1-3 cards nobody was
 * playing. That is the style these examples teach.
 */

export interface BrewerList {
  format: string;
  strategy: string;
  eventDate: string;
  eventName: string;
  record: string | null;
  main: QtyName[];
  side: QtyName[];
}

export interface AnnotatedExample {
  format: string;
  date: string;
  strategy: string;
  borrowedFrom: string;
  borrowRate: number;
  package: QtyName[];
  newIdeas: QtyName[];
  rest: QtyName[];
}

/** Lists saved by scripts/fetch-dld-deck.ts (no player names in the files; the folder names the brewer). */
export function loadBrewerLists(dir: string): BrewerList[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => JSON.parse(readFileSync(path.join(dir, f), "utf8")) as BrewerList);
}

const DAY = 86_400_000;

/**
 * Annotate one list against what existed before it. Returns null when the
 * list is not a brew (65%+ of it is one earlier list of another archetype).
 */
export function annotate(index: CardIndex, data: DataSource, list: BrewerList, maxBorrow = 0.65): AnnotatedExample | null {
  const format = list.format.toLowerCase();
  const date = list.eventDate.slice(0, 10);
  const canon = (n: string) => normalizeName(index.getCard(n)?.name ?? n);
  const isLand = (n: string) => /\bLand\b/.test(index.getCard(n)?.typeLine.split(" // ")[0] ?? "");
  const mine = new Map<string, number>();
  for (const l of list.main) mine.set(canon(l.name), (mine.get(canon(l.name)) ?? 0) + l.qty);

  // Everything published before this list, back a year.
  const dayBefore = new Date(Date.parse(date) - DAY).toISOString().slice(0, 10);
  const prior = data.recentLists(format, { asOf: dayBefore, days: 365 }).filter((l) => l.strategy !== list.strategy);
  if (!prior.length) return null;
  let best = prior[0];
  let bestShared = -1;
  for (const l of prior) {
    const theirs = new Map<string, number>();
    for (const c of l.main) theirs.set(canon(c.name), (theirs.get(canon(c.name)) ?? 0) + c.qty);
    let shared = 0;
    for (const [k, q] of mine) shared += Math.min(q, theirs.get(k) ?? 0);
    if (shared > bestShared) [best, bestShared] = [l, shared];
  }
  const borrowRate = bestShared / 60;
  if (borrowRate >= maxBorrow) return null;
  const packageNames = new Set(best.main.map((c) => canon(c.name)));
  const recent = new Set(prior.filter((l) => Date.parse(date) - Date.parse(l.date) <= 90 * DAY).flatMap((l) => l.main.map((c) => canon(c.name))));

  const pkg: QtyName[] = [];
  const fresh: QtyName[] = [];
  const rest: QtyName[] = [];
  for (const l of list.main) {
    const k = canon(l.name);
    if (isLand(l.name)) continue;
    if (packageNames.has(k)) pkg.push(l);
    else if (!recent.has(k)) fresh.push(l);
    else rest.push(l);
  }
  return { format, date, strategy: list.strategy, borrowedFrom: best.strategy, borrowRate, package: pkg, newIdeas: fresh, rest };
}

const show = (xs: QtyName[]) => xs.map((c) => `${c.qty} ${c.name}`).join(", ") || "none";

/** The examples as text for the request: brews dated before `before`, newest first, at most `max`. */
export function examplesText(index: CardIndex, data: DataSource, lists: BrewerList[], before: string, max = 4): string | null {
  const picked: AnnotatedExample[] = [];
  for (const l of [...lists].sort((a, b) => b.eventDate.localeCompare(a.eventDate))) {
    if (l.eventDate.slice(0, 10) >= before) continue;
    const a = annotate(index, data, l);
    if (a) picked.push(a);
    if (picked.length >= max) break;
  }
  if (picked.length < 2) return null;
  const body = picked
    .map(
      (e, i) =>
        `Example ${i + 1} (${e.format}, ${e.date}, labeled ${e.strategy}): ` +
        `borrowed its shell from ${e.borrowedFrom} (${Math.round(e.borrowRate * 100)}% of the deck is that list): ${show(e.package)}. ` +
        `New ideas nobody in the format was playing: ${show(e.newIdeas)}. ` +
        `The rest, chosen to fit: ${show(e.rest)}.`,
    )
    .join("\n");
  return (
    `How a strong brewer builds (real tournament brews by one player, annotated by code). The pattern: a proven shell from a deck that is working, two or three cards nobody is playing that make the new idea work, and the rest chosen to fit. Not decks to copy; the shape to aim for.\n` +
    body
  );
}
