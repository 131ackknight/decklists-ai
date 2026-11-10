/**
 * Would a vote over several builds of the same deck beat one build? (2026-11-10). Free: reads result files.
 *
 *   pnpm exec tsx scripts/consensus-check.ts [--harness v22] [--also v13]
 *
 * For each dev deck (holdout-v2), the harness's saved builds are merged by vote: a slot is a card's
 * 1st, 2nd, 3rd or 4th copy, and its votes are the builds that play at least that many. The merged deck
 * keeps the builds' middle land count, fills it with the most-voted land slots, and fills the rest of 60
 * with the most-voted spell slots (ties: the card with more copies over all builds, then by name). No
 * model call and nothing chosen by score. Scored like any deck: match % and Added, paired by deck
 * against the average of the single builds it was made from.
 *
 * --also adds another version's builds to the vote (v13 and v22 are the same brewer; they differ only in
 * the Standard card pool), to see what more builds do.
 */
import { readFileSync } from "node:fs";
import { loadCardIndex } from "../src/cards/load";
import { latestRuns, type RunRecord } from "../evals/register";
import { isLand, round4Items, toCounts, type Line } from "../evals/round4/items";
import { PROTOCOL, pairedGain } from "../evals/protocol";
import { addedScore, earlierLists, legalOnDateView, loadLists, settledLists, type Counts, type RefList } from "../evals/score";
import { sameItems, testById } from "../evals/tests";

const arg = (name: string) => (process.argv.includes(`--${name}`) ? process.argv[process.argv.indexOf(`--${name}`) + 1] : undefined);
const harness = arg("harness") ?? PROTOCOL.base;
const also = arg("also");

const index = loadCardIndex();
const items = new Map(round4Items(index).map((it) => [it.id, it]));
const lists = loadLists(String(testById("tuning-v1").params.dataThrough));
const cache = new Map<RefList, Counts>();
const countsOf = (l: RefList) => cache.get(l) ?? cache.set(l, toCounts(index, l.main)).get(l)!;
const ids = testById("holdout-v2").items;
const settled = new Map(ids.map((id) => [id, settledLists(index, lists, items.get(id)!.target!, 30, 90)] as const));
const legalView = legalOnDateView(index, lists, countsOf);
const dateOf = (id: string) => items.get(id)!.before ?? items.get(id)!.target!.firstSeen;
const viewOf = (id: string, d: Counts) => legalView(d, items.get(id)!.target!.format, dateOf(id));
const earlier = new Map(ids.map((id) => [id, earlierLists(lists, items.get(id)!.target!.format, dateOf(id), countsOf)] as const));
const land = (k: string) => isLand(index, k);
const total = (m: Counts) => [...m.values()].reduce((a, b) => a + b, 0);
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const one = (x: number) => x.toFixed(1);
const signed = (x: number) => `${x >= 0 ? "+" : ""}${one(x)}`;

const covers = (r: RunRecord, t: string) => r.tests.includes(t) || r.tests.some((x) => sameItems(x, t));
const buildsOf = (h: string) =>
  latestRuns()
    .finished.filter((r) => r.model === PROTOCOL.model && r.harness === h && covers(r, "holdout-v2"))
    .map((r) => new Map((JSON.parse(readFileSync(r.file, "utf8")).results as ({ id: string; deck: { main: Line[] } | null } | null)[]).flatMap((x) => (x?.deck ? [[x.id, toCounts(index, x.deck.main)] as const] : []))));

/** The builds merged by vote, as described at the top. */
function vote(builds: Counts[]): Counts {
  const slots = (keep: (k: string) => boolean) => {
    const out: { k: string; votes: number; copies: number }[] = [];
    const cards = new Set(builds.flatMap((b) => [...b.keys()].filter(keep)));
    for (const k of cards) {
      const qs = builds.map((b) => b.get(k) ?? 0);
      for (let i = 1; i <= Math.max(...qs); i++) out.push({ k, votes: qs.filter((q) => q >= i).length, copies: qs.reduce((a, b) => a + b, 0) });
    }
    return out.sort((a, b) => b.votes - a.votes || b.copies - a.copies || a.k.localeCompare(b.k));
  };
  const landCounts = builds.map((b) => total(new Map([...b].filter(([k]) => land(k))))).sort((a, b) => a - b);
  const lands = landCounts[Math.floor((landCounts.length - 1) / 2)];
  const deck = new Map<string, number>();
  for (const s of [...slots(land).slice(0, lands), ...slots((k) => !land(k)).slice(0, 60 - lands)]) deck.set(s.k, (deck.get(s.k) ?? 0) + 1);
  return deck;
}

const scoreOf = (id: string, d: Counts) => addedScore(d, settled.get(id)!, earlier.get(id)!, (x) => viewOf(id, x));
function report(label: string, runs: Map<string, Counts>[]) {
  const match = { single: new Map<string, number>(), voted: new Map<string, number>() };
  const added = { single: new Map<string, number>(), voted: new Map<string, number>() };
  const copy = { single: [] as number[], voted: [] as number[] };
  const agree: number[] = [];
  for (const id of ids) {
    const builds = runs.flatMap((r) => (r.has(id) ? [r.get(id)!] : []));
    if (builds.length < 2) continue;
    const singles = builds.map((b) => scoreOf(id, b));
    const v = scoreOf(id, vote(builds));
    match.single.set(id, mean(singles.map((s) => s.match)));
    match.voted.set(id, v.match);
    added.single.set(id, mean(singles.map((s) => s.added)));
    added.voted.set(id, v.added);
    copy.single.push(mean(singles.map((s) => s.copy)));
    copy.voted.push(v.copy);
    // How much two builds of the same deck share, out of 60.
    for (let i = 0; i < builds.length; i++) for (let j = i + 1; j < builds.length; j++) agree.push([...builds[i]].reduce((a, [k, q]) => a + Math.min(q, builds[j].get(k) ?? 0), 0));
  }
  const g = (x: { single: Map<string, number>; voted: Map<string, number> }) => {
    const p = pairedGain([x.voted], [x.single]);
    return `${one(mean([...x.single.values()]))} -> ${one(mean([...x.voted.values()]))}, ${signed(p.gain)} (${signed(p.lo)} to ${signed(p.hi)})`;
  };
  console.log(`${label}: ${runs.length} builds a deck, ${match.single.size} decks`);
  console.log(`  match %: one build -> the vote: ${g(match)}`);
  console.log(`  Added:   one build -> the vote: ${g(added)}`);
  console.log(`  from one earlier list: ${Math.round(mean(copy.single) * 100)}% -> ${Math.round(mean(copy.voted) * 100)}%`);
  console.log(`  two builds of the same deck share ${one(mean(agree))} of 60 cards`);
  const better = [...match.voted].filter(([id, m]) => m > match.single.get(id)!).length;
  console.log(`  the vote beats the average build on ${better} of ${match.voted.size} decks`);
}

const base = buildsOf(harness);
report(harness, base);
if (also) report(`${harness} + ${also}`, [...base, ...buildsOf(also)]);
