/**
 * Scoring shared by every script that turns brews into numbers (2026-11-07, owner:
 * "We arent very careful with our data are we?"). One implementation, so the
 * scoreboard, score-round4.ts and score-tests.ts can't drift apart, and every
 * read of the real lists stops at a test's data cutoff, so merging newer MTGO data
 * never changes an old score.
 */
import { readFileSync } from "node:fs";
import type { CardIndex } from "../src/cards/card-index";
import { normalizeName } from "../src/cards/names";
import type { FileDataSource } from "../src/data/source";
import { isLand, toCounts, type Line, type Round4Item } from "./round4/items";

export type Counts = Map<string, number>;
export interface RefList {
  format: string;
  date: string;
  strategy: string;
  main: Line[];
}

const WIDGET_ROW = /^Cards?\s*\(\d+%?\)\s*$/i;
const DAY = 86_400_000;

export const overlap = (a: Counts, b: Counts) => [...a].reduce((n, [k, q]) => n + Math.min(q, b.get(k) ?? 0), 0);
const only = (m: Counts, keep: (k: string) => boolean) => new Map([...m].filter(([k]) => keep(k)));
const sum = (m: Counts) => [...m.values()].reduce((a, b) => a + b, 0);

/** Every list in the full-history export dated on or before `through`, without Decklist Data's "Cards (N%)" junk rows. */
export function loadLists(through: string, file = "data/reference-lists-all.jsonl"): RefList[] {
  return readFileSync(file, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as RefList)
    .filter((l) => l.date <= through)
    .map((l) => ({ ...l, main: l.main.filter((c) => !WIDGET_ROW.test(c.name)) }));
}

/** Up to 50 of the archetype's lists from `from` to `to` days after it first appeared, sampled evenly. */
export function settledLists(index: CardIndex, lists: RefList[], target: NonNullable<Round4Item["target"]>, from: number, to: number): Counts[] {
  const first = Date.parse(target.firstSeen);
  const window = lists.filter(
    (l) => l.format === target.format && l.strategy === target.strategy && Date.parse(l.date) >= first + from * DAY && Date.parse(l.date) < first + to * DAY,
  );
  const step = Math.max(1, Math.floor(window.length / 50));
  return window.filter((_, i) => i % step === 0).slice(0, 50).map((l) => toCounts(index, l.main));
}

/** Mean main deck overlap with the settled lists, out of 60, as a whole percent (holdout, post-cutoff, future old score). */
export function settledScore(deck: Counts, settled: Counts[]): number {
  return Math.round((settled.reduce((a, l) => a + overlap(deck, l), 0) / settled.length / 60) * 100);
}

/**
 * Brewing beyond copying (owner, 2026-11-08: "Yes, use Added"). The match % rewards copying the right
 * old deck, so this also finds the deck's single closest earlier list (most cards shared, among the lists
 * it could have seen) and scores that list the same way. `added` is the deck's match % minus that list's:
 * the part of the score that isn't copying. `copy` is the share of the deck found in that list.
 */
export function addedScore(deck: Counts, settled: Counts[], earlier: Counts[]) {
  let shared = 0;
  let closest: Counts | null = null;
  for (const l of earlier) {
    const o = overlap(deck, l);
    if (o > shared) [shared, closest] = [o, l];
  }
  const match = settledScore(deck, settled);
  const base = closest ? settledScore(closest, settled) : 0;
  return { match, copy: shared / 60, base, added: match - base };
}

/** The format's lists from before a date: what a brew made then could have seen (holdout and future items are cut at the deck's first appearance). */
export function earlierLists(lists: RefList[], format: string, before: string, countsOf: (l: RefList) => Counts): Counts[] {
  const cut = Date.parse(before);
  return lists.filter((l) => l.format === format && Date.parse(l.date) < cut).map(countsOf);
}

/** The deck's first-week lists (the inventor's version) and every list from a week after it appeared. */
export function futureLists(index: CardIndex, lists: RefList[], target: NonNullable<Round4Item["target"]>) {
  const first = Date.parse(target.firstSeen);
  const ofDeck = lists.filter((l) => l.format === target.format && l.strategy === target.strategy);
  const firstWeek = ofDeck.filter((l) => Date.parse(l.date) < first + 7 * DAY).map((l) => toCounts(index, l.main));
  return { firstWeek, settled: settledLists(index, lists, target, 7, 100_000) };
}

/** Mean overlap with a set of real lists, as a share of each real list's cards, spells and lands (Tuning and Brewing). */
export function shareScore(index: CardIndex, deck: Counts, real: Counts[]) {
  const land = (k: string) => isLand(index, k);
  const part = (keep: (k: string) => boolean) => real.reduce((a, l) => a + overlap(only(deck, keep), only(l, keep)) / Math.max(1, sum(only(l, keep))), 0) / real.length;
  return { all: real.reduce((a, l) => a + overlap(deck, l) / sum(l), 0) / real.length, spells: part((k) => !land(k)), lands: part(land) };
}

/**
 * The inventor's gems: nonland cards in 80%+ of the first-week lists that had
 * under 5% play in the format in the 90 days before, not counting the requested cards.
 */
export function inventorGems(index: CardIndex, history: FileDataSource, it: Round4Item, firstWeek: Counts[]): string[] {
  const t = it.target!;
  const before = history.cut(t.firstSeen);
  const asked = new Set((it.keyCards ?? []).map((k) => normalizeName(index.getCard(k)?.name ?? k)));
  const inFirst = new Map<string, number>();
  for (const l of firstWeek) for (const k of l.keys()) inFirst.set(k, (inFirst.get(k) ?? 0) + 1 / firstWeek.length);
  return [...inFirst]
    .filter(([k, s]) => s >= 0.8 && !isLand(index, k) && !asked.has(normalizeName(index.getCard(k)?.name ?? k)))
    .map(([k]) => k)
    .filter((k) => (before.cardPlayRate(t.format, index.getCard(k)?.name ?? k)?.share ?? 0) < 0.05);
}
