/**
 * Do lands come back when the brewer has the deck's idea? (2026-11-11). Free: reads saved builds.
 *
 *   pnpm exec tsx scripts/idea-lands-check.ts [--decks]
 *
 * Owner: "what can we do to fix the cards the prompt doesnt name? Or go back to lands?" The prompt names
 * up to 3 of a deck's signature cards; the rest are hidden (evals/score.ts unnamedSignature). How many
 * points the prompt hides is set by the test, not by the brewer. Per deck, in points of the whole-deck
 * score (evals/score.ts partScores): the points the prompt hides, and the brewer's gap to the inventors
 * in lands, in hidden cards and in the other spells.
 *
 *   halves       the decks split in two by hidden points: the half with fewer against the rest;
 *   correlation  across decks, between hidden points and each gap;
 *   inside       within one deck, across its builds: land points gained per hidden point found.
 *
 * Dev (v22) and the future test (v13); the future-test decks that are not dev archetypes too.
 */
import { readFileSync } from "node:fs";
import { loadCardIndex } from "../src/cards/load";
import { FileDataSource } from "../src/data/source";
import { PROTOCOL } from "../evals/protocol";
import { latestRuns } from "../evals/register";
import { brewDeps } from "../evals/round4/deps";
import { round4Items, toCounts, type Line } from "../evals/round4/items";
import { legalOnDateView, loadLists, partScores, type Counts, type RefList } from "../evals/score";
import { sameItems, testById } from "../evals/tests";

const perDeck = process.argv.includes("--decks");

async function main() {
  const index = loadCardIndex();
  const items = new Map(round4Items(index).map((it) => [it.id, it]));
  const lists = loadLists(String(testById("tuning-v1").params.dataThrough));
  const history = await FileDataSource.load("data/reference-lists-all.jsonl", index);
  const today = await FileDataSource.load("data/reference-lists.jsonl", index);
  const depsOf = brewDeps(index, history, today);
  const cache = new Map<RefList, Counts>();
  const countsOf = (l: RefList) => cache.get(l) ?? cache.set(l, toCounts(index, l.main)).get(l)!;
  const legalView = legalOnDateView(index, lists, countsOf);
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
  const one = (x: number) => x.toFixed(1).padStart(6);
  const two = (x: number) => `${x >= 0 ? "+" : ""}${x.toFixed(2)}`;
  /** Cards shared [whole, without lands, without lands or hidden] to points of [lands, hidden cards, the other spells]. */
  const split = (x: number[]) => [x[0] - x[1], x[1] - x[2], x[2]].map((c) => (c / 60) * 100);
  const corr = (xs: number[], ys: number[]) => {
    const [mx, my] = [mean(xs), mean(ys)];
    const [sxy, sxx, syy] = [mean(xs.map((x, i) => (x - mx) * (ys[i] - my))), mean(xs.map((x) => (x - mx) ** 2)), mean(ys.map((y) => (y - my) ** 2))];
    return sxx && syy ? sxy / Math.sqrt(sxx * syy) : NaN;
  };
  const devKeys = new Set(testById("holdout-v2").items.map((id) => `${items.get(id)!.target!.format}|${items.get(id)!.target!.strategy}`));

  for (const [testId, from, to, base] of [
    ["holdout-v2", 30, 90, PROTOCOL.base],
    ["future-v2", 7, 365, "v13"],
  ] as const) {
    const ids = testById(testId).items;
    const recs = latestRuns().finished.filter((r) => r.model === PROTOCOL.model && r.harness === base && (r.tests.includes(testId) || r.tests.some((x) => sameItems(x, testId))));
    const builds = new Map<string, Counts[]>();
    for (const rec of recs)
      for (const r of JSON.parse(readFileSync(rec.file, "utf8")).results as ({ id: string; deck: { main: Line[] } | null } | null)[])
        if (r?.deck && ids.includes(r.id)) builds.set(r.id, [...(builds.get(r.id) ?? []), toCounts(index, r.deck.main)]);

    const rows = ids.flatMap((id) => {
      const it = items.get(id)!;
      const t = it.target!;
      const date = it.before ?? t.firstSeen;
      const pool = depsOf(it).index;
      const p = partScores(index, lists, it, countsOf, (k) => !!pool.getCard(k), from, to);
      if (!p.settled.length || !p.firstWeek.length || !builds.has(id)) return [];
      const perBuild = builds.get(id)!.map((d) => split(p.shared(legalView(d, t.format, date))));
      const brew = [0, 1, 2].map((i) => mean(perBuild.map((b) => b[i])));
      const inv = [0, 1, 2].map((i) => mean(p.firstWeek.map((d) => split(p.shared(d))[i])));
      const real = split([0, 1, 2].map((i) => mean(p.settled.map((l) => p.sizes(l)[i]))));
      return [{ id, unseen: !devKeys.has(`${t.format}|${t.strategy}`), cards: p.hidden.size, real, brew, inv, gap: inv.map((v, i) => v - brew[i]), perBuild }];
    });

    for (const [label, set] of [
      [testId === "holdout-v2" ? `dev (${base}, ${recs.length} runs)` : `future test (${base}, ${recs.length} runs), all decks`, rows],
      ...(testId === "future-v2" ? ([["future test, the decks that are not dev archetypes", rows.filter((r) => r.unseen)]] as const) : []),
    ] as const) {
      const sum = (x: number[]) => x[0] + x[1] + x[2];
      console.log(`\n==================== ${label}: ${set.length} decks ====================`);
      console.log(`Points of the whole-deck score: lands | hidden cards | the other spells | all`);
      for (const [name, f] of [["The brewer", (r: (typeof set)[number]) => r.brew], ["Inventors", (r: (typeof set)[number]) => r.inv], ["Inventors over the brewer", (r: (typeof set)[number]) => r.gap], ["In the real deck", (r: (typeof set)[number]) => r.real]] as const)
        console.log(`  ${name.padEnd(28)} ${[0, 1, 2].map((i) => one(mean(set.map((r) => f(r)[i])))).join(" ")} ${one(mean(set.map((r) => sum(f(r)))))}`);

      const sorted = [...set].sort((a, b) => a.real[1] - b.real[1]);
      const cut = Math.floor(sorted.length / 2);
      console.log(`\nThe decks split in two by the points the prompt hides:`);
      console.log(`  ${"".padEnd(34)} decks  hidden in the real deck | the brewer  inventors | gap: lands  hidden  other`);
      for (const [name, half] of [["the half with fewer hidden points", sorted.slice(0, cut)], ["the half with more", sorted.slice(cut)]] as const)
        console.log(`  ${name.padEnd(34)} ${String(half.length).padStart(5)}  ${one(mean(half.map((r) => r.real[1])))}                  |     ${one(mean(half.map((r) => sum(r.brew))))}     ${one(mean(half.map((r) => sum(r.inv))))} |     ${[0, 1, 2].map((i) => one(mean(half.map((r) => r.gap[i])))).join(" ")}`);
      const [lo, hi] = [sorted.slice(0, cut), sorted.slice(cut)];
      console.log(`  Land gap, more hidden over fewer hidden: ${(mean(hi.map((r) => r.gap[0])) / mean(lo.map((r) => r.gap[0]))).toFixed(2)} times. Other-spells gap: ${(mean(hi.map((r) => r.gap[2])) / mean(lo.map((r) => r.gap[2]))).toFixed(2)} times.`);

      console.log(`\nCorrelation across the ${set.length} decks:`);
      console.log(`  hidden points in the real deck with the land gap ${two(corr(set.map((r) => r.real[1]), set.map((r) => r.gap[0])))} | with the other-spells gap ${two(corr(set.map((r) => r.real[1]), set.map((r) => r.gap[2])))}`);
      console.log(`  hidden-card gap with the land gap ${two(corr(set.map((r) => r.gap[1]), set.map((r) => r.gap[0])))} | with the other-spells gap ${two(corr(set.map((r) => r.gap[1]), set.map((r) => r.gap[2])))}`);
      console.log(`  hidden points the brewer has with its land points ${two(corr(set.map((r) => r.brew[1]), set.map((r) => r.brew[0])))}`);

      // Inside one deck: do the builds that found more hidden cards match more lands, or more of the other spells?
      const dev = (i: number) => set.flatMap((r) => (r.perBuild.length > 1 ? r.perBuild.map((b) => b[i] - mean(r.perBuild.map((x) => x[i]))) : []));
      const [dh, dl, dother] = [dev(1), dev(0), dev(2)];
      const sxx = dh.reduce((a, x) => a + x * x, 0);
      console.log(`\nInside one deck, across its builds (${dh.length} builds of ${set.filter((r) => r.perBuild.length > 1).length} decks; hidden points vary by ${Math.sqrt(sxx / Math.max(1, dh.length)).toFixed(2)} SD):`);
      console.log(`  land points per hidden point found ${sxx ? two(dh.reduce((a, x, i) => a + x * dl[i], 0) / sxx) : "n/a"} | other-spell points per hidden point found ${sxx ? two(dh.reduce((a, x, i) => a + x * dother[i], 0) / sxx) : "n/a"}`);

      if (perDeck) {
        console.log(`\nPer deck, fewest hidden points first: hidden cards, hidden points in the real deck | the brewer, inventors | gap: lands, hidden, other`);
        for (const r of sorted) console.log(`  ${r.id.replace(/^(holdout|future)-/, "").padEnd(30)} ${String(r.cards).padStart(2)} ${one(r.real[1])} | ${one(sum(r.brew))} ${one(sum(r.inv))} | ${r.gap.map(one).join(" ")}${r.unseen ? "  (not a dev archetype)" : ""}`);
      }
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
