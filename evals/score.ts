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
import { loadStandardWindows, standardEnds, standardLegalOn } from "../src/cards/standard";
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
 * `view` (holdout-v2, future-v2: legalOnDateView) is applied to the deck and to that closest list first.
 */
export function addedScore(deck: Counts, settled: Counts[], earlier: Counts[], view?: (d: Counts) => Counts) {
  const d = view ? view(deck) : deck;
  let shared = 0;
  let closest: Counts | null = null;
  for (const l of earlier) {
    const o = overlap(d, l);
    if (o > shared) [shared, closest] = [o, l];
  }
  const match = settledScore(d, settled);
  const base = closest ? settledScore(view ? view(closest) : closest, settled) : 0;
  return { match, copy: shared / 60, base, added: match - base, closest };
}

/**
 * A deck as it could have been played on a date (holdout-v2, future-v2; owner 2026-11-09: "Yes, fix the
 * test"). The settled lists come 1-3 months after a deck's date and can run cards that only became legal
 * since (the shock lands, reprinted into Standard in January 2026), so a deck playing them early got credit
 * a brewer couldn't have. In Standard, cards not legal on the date (src/cards/standard.ts, with
 * CardIndex.asOf's 30-day MTGO allowance for cards already played) are left out; other formats unchanged.
 */
export function legalOnDateView(index: CardIndex, lists: RefList[], countsOf: (l: RefList) => Counts) {
  const w = loadStandardWindows();
  const ends = standardEnds(w);
  const firstPlayed = new Map<string, string>();
  for (const l of lists) for (const k of countsOf(l).keys()) if (!firstPlayed.has(k) || l.date < firstPlayed.get(k)!) firstPlayed.set(k, l.date);
  return (deck: Counts, format: string, date: string): Counts => {
    if (format !== "standard") return deck;
    const soon = new Date(Date.parse(date) + 30 * DAY).toISOString().slice(0, 10);
    return new Map(
      [...deck].filter(([k]) => {
        const name = index.getCard(k)?.name ?? k;
        return standardLegalOn(w, ends, name, date) || ((firstPlayed.get(k) ?? "9999") <= date && standardLegalOn(w, ends, name, soon));
      }),
    );
  };
}

/** The format's lists from before a date: what a brew made then could have seen (holdout and future items are cut at the deck's first appearance). */
export function earlierLists(lists: RefList[], format: string, before: string, countsOf: (l: RefList) => Counts): Counts[] {
  const cut = Date.parse(before);
  return lists.filter((l) => l.format === format && Date.parse(l.date) < cut).map(countsOf);
}

/**
 * The little-played spells inventors borrowed (2026-11-08; scripts/candidate-check.ts, v20): nonland spells
 * in under 10% of the format's lists in the 90 days before the cut that a first-week list of the deck took
 * from other decks (not in that list's closest earlier list, not requested), and that stayed (in half or
 * more of the settled lists, days 30-90). Canonical names, as in toCounts.
 */
export function borrowedSpells(index: CardIndex, lists: RefList[], it: Round4Item, countsOf: (l: RefList) => Counts): Set<string> {
  const t = it.target!;
  const before = it.before ?? t.firstSeen;
  const cut = Date.parse(before);
  const rate = new Map<string, number>();
  const recent = lists.filter((l) => l.format === t.format && Date.parse(l.date) < cut && Date.parse(l.date) >= cut - 90 * DAY);
  for (const l of recent) for (const k of countsOf(l).keys()) rate.set(k, (rate.get(k) ?? 0) + 1 / recent.length);
  const asked = new Set((it.keyCards ?? []).map((n) => [...toCounts(index, [{ qty: 1, name: n }]).keys()][0]));
  const settled = settledLists(index, lists, t, 30, 90);
  const earlier = earlierLists(lists, t.format, before, countsOf);
  const first = Date.parse(t.firstSeen);
  const firstWeek = lists.filter((l) => l.format === t.format && l.strategy === t.strategy && Date.parse(l.date) >= first && Date.parse(l.date) < first + 7 * DAY).map(countsOf);
  const found = new Set<string>();
  for (const d of firstWeek) {
    let best = -1;
    let base: Counts = new Map();
    for (const l of earlier) {
      const o = overlap(d, l);
      if (o > best) [best, base] = [o, l];
    }
    for (const k of d.keys()) {
      if (isLand(index, k) || asked.has(k) || (base.get(k) ?? 0) > 0 || !rate.has(k) || rate.get(k)! >= 0.1) continue;
      if (settled.filter((s) => s.has(k)).length >= settled.length / 2) found.add(k);
    }
  }
  return found;
}

/** The deck's lists from its first 7 days: the inventors' versions. */
export function firstWeekLists(lists: RefList[], target: NonNullable<Round4Item["target"]>, countsOf: (l: RefList) => Counts): Counts[] {
  const first = Date.parse(target.firstSeen);
  return lists.filter((l) => l.format === target.format && l.strategy === target.strategy && Date.parse(l.date) >= first && Date.parse(l.date) < first + 7 * DAY).map(countsOf);
}

/**
 * The deck's signature cards that its prompt doesn't name (2026-11-11, scripts/ceiling-check.ts). The
 * test's own rule (scripts/find-new-archetypes.ts): nonland cards in 80%+ of the deck's first 10 lists and
 * in 5% or less of the format's lists before it appeared. The prompt names up to 3 of them; these are the
 * rest. `exists`: the card was in the card pool on the deck's date.
 */
export function unnamedSignature(index: CardIndex, lists: RefList[], it: Round4Item, countsOf: (l: RefList) => Counts, exists: (k: string) => boolean): Set<string> {
  const t = it.target!;
  const first = Date.parse(t.firstSeen);
  const asked = new Set((it.keyCards ?? []).map((n) => [...toCounts(index, [{ qty: 1, name: n }]).keys()][0]));
  const firstTen = lists
    .filter((l) => l.format === t.format && l.strategy === t.strategy)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 10)
    .map(countsOf);
  const before = lists.filter((l) => l.format === t.format && Date.parse(l.date) < first).map(countsOf);
  const prior = new Map<string, number>();
  for (const l of before) for (const k of l.keys()) prior.set(k, (prior.get(k) ?? 0) + 1 / before.length);
  const inFirst = (k: string) => firstTen.filter((l) => l.has(k)).length / firstTen.length;
  return new Set([...new Set(firstTen.flatMap((l) => [...l.keys()]))].filter((k) => !isLand(index, k) && !asked.has(k) && inFirst(k) >= 0.8 && (prior.get(k) ?? 0) <= 0.05 && exists(k)));
}

/** Cards two piles share over the average size of the two piles; two empty piles agree. */
const pileMatch = (a: Counts, na: number, b: Counts, nb: number) => (na + nb ? (2 * overlap(a, b)) / (na + nb) : 1);

/**
 * The match % on part of the deck (2026-11-11, owner: "the score with lands removed"). The cards `keep`
 * rejects are taken out of the deck and out of each settled list; the score is the cards the two piles
 * share over the average size of the two piles, the mean over the lists, as a percent (not rounded). For
 * whole 60-card decks that is the match %. `built` is the deck as built when `deck` is its legal-on-date
 * view: a card that earns nothing still takes up room in the pile.
 */
export function partScorer(settled: Counts[], keep: (k: string) => boolean) {
  const real = settled.map((l) => only(l, keep)).map((l) => ({ l, n: sum(l) }));
  return (deck: Counts, built: Counts = deck): number => {
    const d = only(deck, keep);
    const n = sum(only(built, keep));
    return (real.reduce((a, r) => a + pileMatch(d, n, r.l, r.n), 0) / real.length) * 100;
  };
}

/** Each settled list scored by partScorer against the other settled lists; the mean. How far real lists agree on that part of the deck. */
export function peerPart(settled: Counts[], keep: (k: string) => boolean): number {
  const real = settled.map((l) => only(l, keep)).map((l) => ({ l, n: sum(l) }));
  const per = real.map((a, j) => real.reduce((s, b, i) => (i === j ? s : s + pileMatch(a.l, a.n, b.l, b.n)), 0) / (real.length - 1));
  return (per.reduce((a, b) => a + b, 0) / per.length) * 100;
}

/**
 * The best possible pile under partScorer, with hindsight: for each pile size, the copies the most settled
 * lists play; the best size wins. `size` fixes it (60: a whole deck).
 */
export function bestPart(settled: Counts[], keep: (k: string) => boolean, size?: number): number {
  const real = settled.map((l) => only(l, keep));
  const sizes = real.map(sum);
  // One entry per copy ("copy 3 of Shock"): the settled lists that play it.
  const copies: number[][] = [];
  for (const k of new Set(real.flatMap((l) => [...l.keys()]))) {
    const qs = real.map((l) => l.get(k) ?? 0);
    for (let i = 0; i < Math.max(...qs); i++) copies.push(qs.flatMap((q, j) => (q > i ? [j] : [])));
  }
  let best = 0;
  for (let n = size ?? 1; n <= (size ?? Math.min(copies.length, 100)); n++) {
    const top = copies.map((ls) => ls.reduce((a, j) => a + 2 / (n + sizes[j]), 0)).sort((a, b) => b - a).slice(0, n);
    best = Math.max(best, (top.reduce((a, b) => a + b, 0) / real.length) * 100);
  }
  return best;
}

/** The three views of the score (2026-11-11): the whole deck, lands left out, lands and the prompt's hidden cards left out. */
export const PARTS = ["whole deck", "without lands", "without lands or hidden cards"] as const;

/**
 * One test deck's scorers for PARTS, in that order. `of(deck, built)` scores a build (`deck` its
 * legal-on-date view where the test uses one); `peers` is the settled lists against each other and `best`
 * the best possible pile, both with hindsight. The whole-deck score is the match % before rounding.
 */
export function partScores(index: CardIndex, lists: RefList[], it: Round4Item, countsOf: (l: RefList) => Counts, exists: (k: string) => boolean, from: number, to: number) {
  const settled = settledLists(index, lists, it.target!, from, to);
  const hidden = unnamedSignature(index, lists, it, countsOf, exists);
  const lands = new Map<string, boolean>();
  const land = (k: string) => lands.get(k) ?? lands.set(k, isLand(index, k)).get(k)!;
  const keeps = [() => true, (k: string) => !land(k), (k: string) => !land(k) && !hidden.has(k)];
  const whole = (deck: Counts) => (settled.reduce((a, l) => a + overlap(deck, l), 0) / settled.length / 60) * 100;
  const scorers = [whole, partScorer(settled, keeps[1]), partScorer(settled, keeps[2])];
  const piles = keeps.map((keep) => settled.map((l) => only(l, keep)));
  /** The best 60 cards possible, scored as the match %: the 60 copies the most settled lists play. */
  const bestWhole = () => {
    const shares: number[] = [];
    for (const k of new Set(settled.flatMap((l) => [...l.keys()]))) {
      const qs = settled.map((l) => l.get(k) ?? 0);
      for (let i = 0; i < Math.max(...qs); i++) shares.push(qs.filter((q) => q > i).length / settled.length);
    }
    return (shares.sort((a, b) => b - a).slice(0, 60).reduce((a, b) => a + b, 0) / 60) * 100;
  };
  return {
    settled,
    hidden,
    firstWeek: firstWeekLists(lists, it.target!, countsOf),
    of: (deck: Counts, built: Counts = deck) => scorers.map((s) => s(deck, built)),
    /** Cards in each pile of a deck: all of it, its nonland cards, its nonland cards that aren't hidden ones. */
    sizes: (deck: Counts) => keeps.map((keep) => sum(only(deck, keep))),
    /** Cards a deck shares with a settled list, in each pile; the mean over the lists. */
    shared: (deck: Counts) => keeps.map((keep, i) => piles[i].reduce((a, l) => a + overlap(only(deck, keep), l), 0) / settled.length),
    peers: () => [(settled.reduce((a, l, j) => a + settled.reduce((s, m, i) => (i === j ? s : s + overlap(l, m)), 0) / (settled.length - 1), 0) / settled.length / 60) * 100, peerPart(settled, keeps[1]), peerPart(settled, keeps[2])],
    best: () => [bestWhole(), bestPart(settled, keeps[1]), bestPart(settled, keeps[2])],
  };
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
