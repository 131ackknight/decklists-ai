/**
 * Which old deck does a brew start from, and could data pick a better one? (2026-11-10). Free.
 *
 *   pnpm exec tsx scripts/starting-list-check.ts [--decks]
 *
 * Owner: "Where are other high potential gaps we can fill?" A deck's closest earlier list (most cards
 * shared, among the format's lists from before the deck's date) is the old deck it grew out of. That
 * list's own match with the settled deck is the part of a score that is copying (PROGRESS.md section 2f).
 * Here, per deck, the match of the starting list for: the brewer's builds, the inventors' first-week
 * lists, the best earlier list picked with hindsight (the ceiling), and two picks made from data alone,
 * set before looking at any score:
 *
 *   most requested   the earlier list (last 400 days) running the most copies of the requested cards;
 *                    ties go to the most recent. No pick when no list runs any of them.
 *   colors' top deck the most recent list of the most-played strategy among the format's lists of the
 *                    last 90 days whose colors are the requested cards' own colors (plain mana symbols).
 *
 * And what a perfect chooser could get from a short menu: the best of the latest lists of the format's
 * 5, 10 or 20 most-played strategies of the 30 days before (the menu the brewer is shown), and the best of
 * the latest lists of the strategies that ran a requested card in the 400 days before.
 *
 * Dev (v22, 3 runs) and the future test (v13, 2 runs; all 14 decks, and the 6 that are not dev
 * archetypes). In Standard, cards not legal on the deck's date earn nothing, as in holdout-v2.
 */
import { readFileSync } from "node:fs";
import { loadCardIndex } from "../src/cards/load";
import { deckColors } from "../src/harness/lands";
import { latestRuns } from "../evals/register";
import { round4Items, toCounts, type Line } from "../evals/round4/items";
import { legalOnDateView, loadLists, overlap, settledLists, settledScore, type Counts, type RefList } from "../evals/score";
import { sameItems, testById } from "../evals/tests";

const DAY = 86_400_000;
const perDeck = process.argv.includes("--decks");
const index = loadCardIndex();
const items = new Map(round4Items(index).map((it) => [it.id, it]));
const lists = loadLists(String(testById("tuning-v1").params.dataThrough));
const cache = new Map<RefList, Counts>();
const countsOf = (l: RefList) => cache.get(l) ?? cache.set(l, toCounts(index, l.main)).get(l)!;
const legalView = legalOnDateView(index, lists, countsOf);
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const one = (x: number) => x.toFixed(1);
const setOf = (colors: string[]) => [...colors].sort().join("") || "C";
const keyOf = (name: string) => [...toCounts(index, [{ qty: 1, name }]).keys()][0];
const devKeys = new Set(testById("holdout-v2").items.map((id) => `${items.get(id)!.target!.format}|${items.get(id)!.target!.strategy}`));

for (const [label, harness, testId, from, to, onlyUnseen] of [
  ["dev (v22, 3 runs)", "v22", "holdout-v2", 30, 90, false],
  ["future test, all 14 decks (v13, 2 runs)", "v13", "future-v2", 7, 365, false],
  ["future test, the 6 that are not dev archetypes", "v13", "future-v2", 7, 365, true],
] as const) {
  const ids = testById(testId).items.filter((id) => !onlyUnseen || !devKeys.has(`${items.get(id)!.target!.format}|${items.get(id)!.target!.strategy}`));
  const recs = latestRuns().finished.filter((r) => r.model === "claude-opus-5-5" && r.harness === harness && (r.tests.includes(testId) || r.tests.some((x) => sameItems(x, testId))));
  const builds = new Map<string, Counts[]>();
  for (const rec of recs)
    for (const r of JSON.parse(readFileSync(rec.file, "utf8")).results as ({ id: string; deck: { main: Line[] } | null } | null)[])
      if (r?.deck && ids.includes(r.id)) builds.set(r.id, [...(builds.get(r.id) ?? []), toCounts(index, r.deck.main)]);

  const rows: { id: string; brewDeck: number; brewer: number; inventors: number | null; hindsight: number; requested: number | null; colors: number | null; menu: number[]; ran: number | null; ranCount: number }[] = [];
  for (const id of ids) {
    const it = items.get(id)!;
    const t = it.target!;
    const date = it.before ?? t.firstSeen;
    const cut = Date.parse(date);
    const first = Date.parse(t.firstSeen);
    const view = (d: Counts) => legalView(d, t.format, date);
    const settled = settledLists(index, lists, t, from, to);
    if (!settled.length || !builds.has(id)) continue;
    const earlier = lists.filter((l) => l.format === t.format && Date.parse(l.date) < cut);
    const score = (d: Counts) => settledScore(view(d), settled);
    const closestTo = (d: Counts) => {
      let best: RefList | null = null;
      let most = -1;
      for (const l of earlier) {
        const o = overlap(view(d), countsOf(l));
        if (o > most) [most, best] = [o, l];
      }
      return best;
    };
    const startOf = (d: Counts) => {
      const l = closestTo(d);
      return l ? score(countsOf(l)) : 0;
    };
    const firstWeek = lists.filter((l) => l.format === t.format && l.strategy === t.strategy && Date.parse(l.date) >= first && Date.parse(l.date) < first + 7 * DAY).map(countsOf);
    const asked = (it.keyCards ?? []).map(keyOf);
    // most requested: the list running the most copies of the requested cards, the most recent on a tie.
    const window = earlier.filter((l) => Date.parse(l.date) >= cut - 400 * DAY);
    const copies = (l: RefList) => asked.reduce((n, k) => n + (countsOf(l).get(k) ?? 0), 0);
    const byRequested = [...window].sort((a, b) => copies(b) - copies(a) || b.date.localeCompare(a.date))[0];
    // colors' top deck: the requested cards' own colors, the most-played strategy in them, its latest list.
    const named = setOf([...new Set(asked.flatMap((k) => [...(index.getCard(k)?.manaCost.split(" // ")[0] ?? "").matchAll(/\{([WUBRG])\}/g)].map((m) => m[1])))]);
    const recent = earlier.filter((l) => Date.parse(l.date) >= cut - 90 * DAY && setOf(deckColors(index, countsOf(l), true)) === named);
    const strategies = new Map<string, number>();
    for (const l of recent) strategies.set(l.strategy, (strategies.get(l.strategy) ?? 0) + 1);
    const top = [...strategies].sort((a, b) => b[1] - a[1])[0]?.[0];
    const byColors = recent.filter((l) => l.strategy === top).sort((a, b) => b.date.localeCompare(a.date))[0];
    // The menu: the format's most-played strategies of the last 30 days, and each one's latest list.
    const month = earlier.filter((l) => Date.parse(l.date) >= cut - 30 * DAY);
    const played = new Map<string, number>();
    for (const l of month) played.set(l.strategy, (played.get(l.strategy) ?? 0) + 1);
    const latestOf = (strategy: string, among: RefList[]) => among.filter((l) => l.strategy === strategy).sort((a, b) => b.date.localeCompare(a.date))[0];
    const menu = [...played].sort((a, b) => b[1] - a[1]).map(([strategy]) => score(countsOf(latestOf(strategy, month))));
    const bestOf = (k: number) => menu.slice(0, k).reduce((b, x) => Math.max(b, x), 0);
    // Strategies that ran a requested card.
    const ranStrategies = [...new Set(window.filter((l) => copies(l) > 0).map((l) => l.strategy))];
    const ran = ranStrategies.length ? ranStrategies.reduce((b, st) => Math.max(b, score(countsOf(latestOf(st, window)))), 0) : null;
    rows.push({
      menu: [bestOf(5), bestOf(10), bestOf(20)],
      ran,
      ranCount: ranStrategies.length,
      id,
      brewDeck: mean(builds.get(id)!.map(score)),
      brewer: mean(builds.get(id)!.map(startOf)),
      inventors: firstWeek.length ? mean(firstWeek.map(startOf)) : null,
      hindsight: earlier.reduce((b, l) => Math.max(b, score(countsOf(l))), 0),
      requested: byRequested && copies(byRequested) > 0 ? score(countsOf(byRequested)) : null,
      colors: byColors ? score(countsOf(byColors)) : null,
    });
  }
  const avg = (f: (r: (typeof rows)[number]) => number | null) => {
    const xs = rows.flatMap((r) => (f(r) === null ? [] : [f(r)!]));
    return `${one(mean(xs))}${xs.length < rows.length ? ` (${xs.length} of ${rows.length} decks)` : ""}`;
  };
  console.log(`\n== ${label}: ${rows.length} decks. Match % of the starting list alone (the whole brew scores ${avg((r) => r.brewDeck)}).`);
  console.log(`  the brewer's builds' closest earlier list:   ${avg((r) => r.brewer)}`);
  console.log(`  the inventors' closest earlier list:         ${avg((r) => r.inventors)}`);
  console.log(`  the best earlier list, picked with hindsight: ${avg((r) => r.hindsight)}`);
  console.log(`  picked from data, most requested cards:      ${avg((r) => r.requested)}`);
  console.log(`  picked from data, the colors' top deck:      ${avg((r) => r.colors)}`);
  console.log(`  a perfect pick from the menu's top 5 / 10 / 20 decks: ${avg((r) => r.menu[0])} / ${avg((r) => r.menu[1])} / ${avg((r) => r.menu[2])}`);
  console.log(`  a perfect pick among decks that ran a requested card: ${avg((r) => r.ran)} (${one(mean(rows.map((r) => r.ranCount)))} such decks a request)`);
  if (perDeck) for (const r of rows) console.log(`    ${r.id.replace(/^(holdout|future)-/, "").padEnd(30)} brew ${one(r.brewDeck).padStart(5)} | starts: brewer ${one(r.brewer).padStart(5)} | inventors ${(r.inventors === null ? "-" : one(r.inventors)).padStart(5)} | hindsight ${one(r.hindsight).padStart(5)} | most requested ${(r.requested === null ? "-" : one(r.requested)).padStart(5)} | colors' top ${(r.colors === null ? "-" : one(r.colors)).padStart(5)}`);
}
