/**
 * The idea-named test against the 3-card test (2026-11-11; owner: "Yes, run it"). Free: reads saved builds.
 *
 *   pnpm exec tsx scripts/idea-test-check.ts [--decks] [--json file]
 *
 * holdout-idea-v1 (evals/tests.ts) is holdout-v2 with requests that name every signature card of the deck
 * instead of the first 3. For the model alone (v0) and the brewer (the protocol's base): each deck's builds
 * on the new request against the same version's saved builds on the old one, paired by deck, with a 95%
 * range (evals/protocol.ts pairedGain). Scores as in scripts/no-lands-check.ts: the whole deck, without
 * lands, and the points of the whole-deck score that come from lands, from the cards the OLD request hid,
 * and from the other spells. The hidden cards are read off the old item, so both requests are scored
 * against the same piles. Decks whose request did not change keep their saved builds.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { loadCardIndex } from "../src/cards/load";
import { FileDataSource } from "../src/data/source";
import { PROTOCOL, pairedGain } from "../evals/protocol";
import { latestRuns, type RunRecord } from "../evals/register";
import { brewDeps } from "../evals/round4/deps";
import { round4Items, toCounts, type Line } from "../evals/round4/items";
import { addedScore, earlierLists, legalOnDateView, loadLists, partScores, type Counts, type RefList } from "../evals/score";
import { sameItems, testById } from "../evals/tests";

const perDeck = process.argv.includes("--decks");
/** --json file: the same numbers for a chart (the decks whose request changed). */
const jsonOut = process.argv.includes("--json") ? process.argv[process.argv.indexOf("--json") + 1] : null;
const OLD = "holdout-v2";
const [FROM, TO] = [30, 90];
const METRICS = [
  ["whole", "Whole deck"],
  ["noLands", "Without lands"],
  ["lands", "Points from lands"],
  ["hidden", "Points from the cards the old request hid"],
  ["other", "Points from the other spells"],
  ["added", "Added (whole deck)"],
] as const;
type Metric = (typeof METRICS)[number][0];
type Score = Record<Metric, number> & { named: number; copies: number };

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
  const signed = (x: number) => `${x >= 0 ? "+" : ""}${x.toFixed(1)}`;
  const split = (x: number[]) => [x[0] - x[1], x[1] - x[2], x[2]].map((c) => (c / 60) * 100);
  const keyOf = (name: string) => [...toCounts(index, [{ qty: 1, name }]).keys()][0];

  // Per deck, from the OLD item: its scorers, and the cards the new request names for the first time.
  const ctx = new Map(
    testById(OLD).items.flatMap((id) => {
      const it = items.get(id)!;
      const idea = items.get(`idea-${id}`)!;
      const t = it.target!;
      const date = it.before ?? t.firstSeen;
      const pool = depsOf(it).index;
      const p = partScores(index, lists, it, countsOf, (k) => !!pool.getCard(k), FROM, TO);
      if (!p.settled.length) return [];
      const view = (d: Counts) => legalView(d, t.format, date);
      const earlier = earlierLists(lists, t.format, date, countsOf);
      const fresh = idea.keyCards!.slice(it.keyCards!.length).map(keyOf);
      const score = (built: Counts, viewed: boolean): Score => {
        const d = viewed ? view(built) : built;
        const s = p.of(d, built);
        const [lands, hidden, other] = split(p.shared(d));
        const closest = addedScore(built, p.settled, earlier, viewed ? view : undefined).closest;
        const base = closest ? p.of(viewed ? view(closest) : closest, closest)[0] : 0;
        return { whole: s[0], noLands: s[1], lands, hidden, other, added: s[0] - base, named: fresh.filter((k) => (built.get(k) ?? 0) > 0).length, copies: fresh.reduce((n, k) => n + (built.get(k) ?? 0), 0) };
      };
      return [[id, { changed: fresh.length > 0, fresh: fresh.length, score, inventors: p.firstWeek.map((d) => score(d, false)) }] as const];
    }),
  );

  const fin = latestRuns().finished.filter((r) => r.model === PROTOCOL.model);
  const scoresOf = (recs: RunRecord[]) =>
    recs
      .map(
        (rec) =>
          new Map(
            (JSON.parse(readFileSync(rec.file, "utf8")).results as ({ id: string; deck: { main: Line[] } | null } | null)[]).flatMap((x) => {
              const id = x?.id.replace(/^idea-/, "") ?? "";
              return x?.deck && ctx.has(id) ? [[id, ctx.get(id)!.score(toCounts(index, x.deck.main), true)] as const] : [];
            }),
          ),
      )
      .filter((m) => m.size);
  const of = (runs: Map<string, Score>[], id: string, f: Metric | "named" | "copies") => mean(runs.flatMap((m) => (m.has(id) ? [m.get(id)![f]] : [])));
  const maps = (runs: Map<string, Score>[], ids: string[], f: Metric) => runs.map((m) => new Map(ids.flatMap((id) => (m.has(id) ? [[id, m.get(id)![f]] as const] : []))));

  const versions = [
    ["The model alone (v0)", "v0"],
    [`The brewer (${PROTOCOL.base})`, PROTOCOL.base],
  ].map(([name, harness]) => {
    const oldRecs = fin.filter((r) => r.harness === harness && (r.tests.includes(OLD) || r.tests.some((x) => sameItems(x, OLD))));
    const newRecs = fin.filter((r) => r.harness === harness && r.tracks?.includes("idea"));
    return { name, harness, oldRuns: scoresOf(oldRecs), newRuns: scoresOf(newRecs), cost: newRecs.reduce((a, r) => a + (r.costUsd ?? 0), 0), files: newRecs.map((r) => r.file) };
  });

  const chart: { decks: number; inventors: Record<string, number>; versions: unknown[]; perDeck: unknown[] } = { decks: 0, inventors: {}, versions: [], perDeck: [] };
  for (const v of versions) {
    const ids = [...ctx.keys()].filter((id) => ctx.get(id)!.changed && v.newRuns.some((m) => m.has(id)) && v.oldRuns.some((m) => m.has(id)));
    console.log(`\n==================== ${v.name}: ${ids.length} decks whose request changed ====================`);
    if (!ids.length) {
      console.log("  no builds on the new requests yet");
      continue;
    }
    console.log(`Runs: the 3-card request ${v.oldRuns.length}; every signature card named ${v.newRuns.length} (${v.files.join(", ")}; $${v.cost.toFixed(2)}).`);
    console.log(`${"".padEnd(44)} 3 cards   named   gain (95% range)        | inventors`);
    for (const [f, label] of METRICS) {
      const g = pairedGain(maps(v.newRuns, ids, f), maps(v.oldRuns, ids, f));
      const inv = mean(ids.map((id) => mean(ctx.get(id)!.inventors.map((s) => s[f]))));
      console.log(`  ${label.padEnd(42)} ${one(mean(ids.map((id) => of(v.oldRuns, id, f))))}  ${one(mean(ids.map((id) => of(v.newRuns, id, f))))}   ${`${signed(g.gain)} (${signed(g.lo)} to ${signed(g.hi)})`.padEnd(23)} | ${one(inv)}`);
    }
    const fresh = mean(ids.map((id) => ctx.get(id)!.fresh));
    console.log(`  Cards named for the first time: ${fresh.toFixed(1)} a deck. A build plays ${mean(ids.map((id) => of(v.oldRuns, id, "named"))).toFixed(1)} of them on the 3-card request (${mean(ids.map((id) => of(v.oldRuns, id, "copies"))).toFixed(1)} copies), ${mean(ids.map((id) => of(v.newRuns, id, "named"))).toFixed(1)} when they are named (${mean(ids.map((id) => of(v.newRuns, id, "copies"))).toFixed(1)} copies).`);
    const row = (runs: Map<string, Score>[]) => Object.fromEntries(METRICS.map(([f]) => [f, mean(ids.map((id) => of(runs, id, f)))]));
    chart.versions.push({ key: v.harness, name: v.harness === "v0" ? "The model alone" : "The brewer", old: row(v.oldRuns), new: row(v.newRuns), gain: Object.fromEntries(METRICS.map(([f]) => [f, pairedGain(maps(v.newRuns, ids, f), maps(v.oldRuns, ids, f))])) });
    if (v.harness === PROTOCOL.base) {
      chart.decks = ids.length;
      chart.inventors = Object.fromEntries(METRICS.map(([f]) => [f, mean(ids.map((id) => mean(ctx.get(id)!.inventors.map((s) => s[f]))))]));
      chart.perDeck = ids.map((id) => ({
        id,
        name: id.replace(/^holdout-/, "").split("-").map((w) => (/^\d/.test(w) ? w : w[0].toUpperCase() + w.slice(1))).join(" "),
        fresh: ctx.get(id)!.fresh,
        old: of(v.oldRuns, id, "whole"),
        new: of(v.newRuns, id, "whole"),
        inv: mean(ctx.get(id)!.inventors.map((s) => s.whole)),
      }));
    }
    const better = ids.filter((id) => of(v.newRuns, id, "whole") > of(v.oldRuns, id, "whole")).length;
    console.log(`  Decks that scored higher with the idea named: ${better} of ${ids.length}.`);

    const all = [...ctx.keys()].filter((id) => v.oldRuns.some((m) => m.has(id)) && (!ctx.get(id)!.changed || v.newRuns.some((m) => m.has(id))));
    const carried = (id: string, f: Metric) => (ctx.get(id)!.changed ? of(v.newRuns, id, f) : of(v.oldRuns, id, f));
    console.log(`  All ${all.length} decks (${all.filter((id) => !ctx.get(id)!.changed).length} unchanged requests keep their saved builds): whole deck ${one(mean(all.map((id) => of(v.oldRuns, id, "whole")))).trim()} to ${one(mean(all.map((id) => carried(id, "whole")))).trim()}; without lands ${one(mean(all.map((id) => of(v.oldRuns, id, "noLands")))).trim()} to ${one(mean(all.map((id) => carried(id, "noLands")))).trim()}; inventors ${one(mean(all.map((id) => mean(ctx.get(id)!.inventors.map((s) => s.whole))))).trim()} and ${one(mean(all.map((id) => mean(ctx.get(id)!.inventors.map((s) => s.noLands))))).trim()}.`);

    if (perDeck) {
      console.log(`\n  Per deck: newly named cards | whole deck, 3 cards to named | inventors | lands | hidden | other spells (each 3 cards to named)`);
      for (const id of ids) {
        const pair = (f: Metric) => `${one(of(v.oldRuns, id, f))} >${one(of(v.newRuns, id, f))}`;
        console.log(`    ${id.replace(/^holdout-/, "").padEnd(28)} ${String(ctx.get(id)!.fresh).padStart(2)} | ${pair("whole")} | ${one(mean(ctx.get(id)!.inventors.map((s) => s.whole)))} | ${pair("lands")} | ${pair("hidden")} | ${pair("other")}`);
      }
    }
  }

  // The harness over the model alone, on each kind of request, same decks.
  const [alone, brewer] = versions;
  const both = [...ctx.keys()].filter((id) => ctx.get(id)!.changed && [alone, brewer].every((v) => v.newRuns.some((m) => m.has(id)) && v.oldRuns.some((m) => m.has(id))));
  if (both.length) {
    console.log(`\n==================== The brewer over the model alone, ${both.length} decks ====================`);
    for (const [f, label] of METRICS.slice(0, 2)) {
      const [o, n] = [pairedGain(maps(brewer.oldRuns, both, f), maps(alone.oldRuns, both, f)), pairedGain(maps(brewer.newRuns, both, f), maps(alone.newRuns, both, f))];
      console.log(`  ${label.padEnd(16)} on the 3-card request ${signed(o.gain)} (${signed(o.lo)} to ${signed(o.hi)}) | with the idea named ${signed(n.gain)} (${signed(n.lo)} to ${signed(n.hi)})`);
    }
  }
  if (jsonOut) {
    writeFileSync(jsonOut, JSON.stringify(chart, null, 1));
    console.log(`\nwrote ${jsonOut}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
