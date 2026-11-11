/**
 * The lands the brewer cut from, and added to, the list it built on: which were mistakes? (2026-11-10). Free.
 *
 *   pnpm exec tsx scripts/land-cut-check.ts [--decks]
 *
 * Owner: "What can we do about non basic lands then?" For each saved build, its closest earlier list (most
 * cards shared, from before the deck's date). A land copy the build cut from that list is a mistake when
 * the settled deck still plays it; a copy the build added is right when the settled deck plays it. Cut
 * nonbasic lands are split by whether they fit the build's own colors. Three sets: dev (v22, 3 runs), the
 * future test (v13, 2 runs), and the future test's 6 decks that are not dev archetypes.
 */
import { readFileSync } from "node:fs";
import { loadCardIndex } from "../src/cards/load";
import { deckColors, isBasicLand, landColors } from "../src/harness/lands";
import { latestRuns } from "../evals/register";
import { isLand, round4Items, toCounts, type Line } from "../evals/round4/items";
import { earlierLists, legalOnDateView, loadLists, overlap, settledLists, type Counts, type RefList } from "../evals/score";
import { sameItems, testById } from "../evals/tests";

const index = loadCardIndex();
const items = new Map(round4Items(index).map((it) => [it.id, it]));
const lists = loadLists(String(testById("tuning-v1").params.dataThrough));
const cache = new Map<RefList, Counts>();
const countsOf = (l: RefList) => cache.get(l) ?? cache.set(l, toCounts(index, l.main)).get(l)!;
const legalView = legalOnDateView(index, lists, countsOf);
const land = (k: string) => isLand(index, k);
const basic = (k: string) => isBasicLand(index.getCard(k));
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const devKeys = new Set(testById("holdout-v2").items.map((id) => `${items.get(id)!.target!.format}|${items.get(id)!.target!.strategy}`));

type Bucket = { copies: number; hit: number };
const CUT = ["basic", "nonbasic, fits the build's colors", "nonbasic, off the build's colors"] as const;
const ADD = ["basic", "nonbasic"] as const;

for (const [label, harness, testId, from, to, onlyUnseen] of [
  ["dev (v22, 3 runs)", "v22", "holdout-v2", 30, 90, false],
  ["future test, all 14 (v13, 2 runs)", "v13", "future-v2", 7, 365, false],
  ["future test, the 6 not dev archetypes", "v13", "future-v2", 7, 365, true],
] as const) {
  const ids = testById(testId).items.filter((id) => !onlyUnseen || !devKeys.has(`${items.get(id)!.target!.format}|${items.get(id)!.target!.strategy}`));
  const recs = latestRuns().finished.filter((r) => r.model === "claude-opus-5-5" && r.harness === harness && (r.tests.includes(testId) || r.tests.some((x) => sameItems(x, testId))));
  const cut: Record<string, Bucket> = Object.fromEntries(CUT.map((c) => [c, { copies: 0, hit: 0 }]));
  const add: Record<string, Bucket> = Object.fromEntries(ADD.map((c) => [c, { copies: 0, hit: 0 }]));
  let builds = 0;
  let sharedWithClosest = 0;
  let sameColors = 0;
  const perDeck = new Map<string, { cutFit: number; wrongFit: number; n: number }>();
  for (const rec of recs) {
    for (const r of JSON.parse(readFileSync(rec.file, "utf8")).results as ({ id: string; deck: { main: Line[] } | null } | null)[]) {
      if (!r?.deck || !ids.includes(r.id)) continue;
      const it = items.get(r.id)!;
      const t = it.target!;
      const date = it.before ?? t.firstSeen;
      const settled = settledLists(index, lists, t, from, to).map((l) => legalView(l, t.format, date));
      if (!settled.length) continue;
      const build = legalView(toCounts(index, r.deck.main), t.format, date);
      let closest: Counts = new Map();
      let best = -1;
      for (const l of earlierLists(lists, t.format, date, countsOf)) {
        const o = overlap(build, l);
        if (o > best) [best, closest] = [o, l];
      }
      builds++;
      sharedWithClosest += best;
      const mine = deckColors(index, build);
      if ([...mine].sort().join("") === [...deckColors(index, closest, true)].sort().join("")) sameColors++;
      const fits = (k: string) => {
        const cols = landColors(index.getCard(k)!);
        return cols === "any" || cols.every((c) => mine.includes(c));
      };
      const pd = perDeck.get(r.id) ?? { cutFit: 0, wrongFit: 0, n: 0 };
      pd.n++;
      for (const k of new Set([...build.keys(), ...closest.keys()])) {
        if (!land(k)) continue;
        const [b, c] = [build.get(k) ?? 0, closest.get(k) ?? 0];
        if (c > b) {
          // Cut copies: a mistake when the settled deck still plays them.
          const wrong = mean(settled.map((s) => Math.min(c - b, Math.max(0, (s.get(k) ?? 0) - b))));
          const bucket = basic(k) ? CUT[0] : fits(k) ? CUT[1] : CUT[2];
          cut[bucket].copies += c - b;
          cut[bucket].hit += wrong;
          if (bucket === CUT[1]) {
            pd.cutFit += c - b;
            pd.wrongFit += wrong;
          }
        } else if (b > c) {
          // Added copies: right when the settled deck plays them.
          const right = mean(settled.map((s) => Math.min(b - c, Math.max(0, (s.get(k) ?? 0) - c))));
          const bucket = basic(k) ? ADD[0] : ADD[1];
          add[bucket].copies += b - c;
          add[bucket].hit += right;
        }
      }
      perDeck.set(r.id, pd);
    }
  }
  console.log(`\n== ${label}: ${builds} builds; shares ${(sharedWithClosest / builds).toFixed(1)} of 60 cards with its closest earlier list; same colors as that list on ${Math.round((sameColors / builds) * 100)}% of builds`);
  for (const c of CUT) console.log(`  cut from the closest list, ${c.padEnd(36)} ${(cut[c].copies / builds).toFixed(1)} copies a build; ${(cut[c].hit / builds).toFixed(1)} of them still in the settled deck (${Math.round((cut[c].hit / Math.max(1e-9, cut[c].copies)) * 100)}% were mistakes)`);
  for (const c of ADD) console.log(`  added to it, ${c.padEnd(49)} ${(add[c].copies / builds).toFixed(1)} copies a build; ${(add[c].hit / builds).toFixed(1)} of them in the settled deck (${Math.round((add[c].hit / Math.max(1e-9, add[c].copies)) * 100)}% right)`);
  if (process.argv.includes("--decks")) for (const [id, pd] of perDeck) if (pd.cutFit) console.log(`      ${id.padEnd(38)} cut ${(pd.cutFit / pd.n).toFixed(1)} fitting nonbasics; ${(pd.wrongFit / pd.n).toFixed(1)} were mistakes`);
}
