/**
 * The idea-named tests against the 3-card tests, per deck (2026-11-11; owner: "Yes, run it"). Free: reads
 * saved builds. The scoring is evals/idea-tests.ts (read its header); PROGRESS.md section 2i shows the totals.
 *
 *   pnpm exec tsx scripts/idea-test-check.ts [--future] [--decks] [--json file]
 *
 * Default: the dev decks (holdout-idea-v1 against holdout-v2). --future: the future test (future-idea-v1
 * against future-v2), with the 6 requests dev has not seen apart, and the lead over the model alone split
 * by whether the deck appeared after the model's training ended (the decks of post-v1; a split fixed in
 * BUILD_LOG.md before the run). --json file: the numbers for a chart (the decks whose request changed).
 */
import { writeFileSync } from "node:fs";
import { loadCardIndex } from "../src/cards/load";
import { FileDataSource } from "../src/data/source";
import { IDEA_METRICS, ideaTest, shortDeck, type IdeaMetric, type IdeaScore } from "../evals/idea-tests";
import { brewDeps } from "../evals/round4/deps";
import { round4Items, toCounts } from "../evals/round4/items";
import { legalOnDateView, loadLists, type Counts, type RefList } from "../evals/score";
import { testById } from "../evals/tests";

const perDeck = process.argv.includes("--decks");
const future = process.argv.includes("--future");
const jsonOut = process.argv.includes("--json") ? process.argv[process.argv.indexOf("--json") + 1] : null;

async function main() {
  const index = loadCardIndex();
  const items = new Map(round4Items(index).map((it) => [it.id, it]));
  const lists = loadLists(String(testById("tuning-v1").params.dataThrough));
  const history = await FileDataSource.load("data/reference-lists-all.jsonl", index);
  const today = await FileDataSource.load("data/reference-lists.jsonl", index);
  const cache = new Map<RefList, Counts>();
  const countsOf = (l: RefList) => cache.get(l) ?? cache.set(l, toCounts(index, l.main)).get(l)!;
  const t = ideaTest({ index, items, lists, depsOf: brewDeps(index, history, today), countsOf, legalView: legalOnDateView(index, lists, countsOf) }, future);
  const { ctx, of, level, gain, shared, afterTraining } = t;
  const one = (x: number) => x.toFixed(1).padStart(6);
  const signed = (x: number) => `${x >= 0 ? "+" : ""}${x.toFixed(1)}`;
  const gainText = (cand: Map<string, IdeaScore>[], ref: Map<string, IdeaScore>[], ids: string[], f: IdeaMetric) => {
    const g = gain(cand, ref, ids, f);
    return g.n >= 3 ? `${signed(g.gain)} (${signed(g.lo)} to ${signed(g.hi)})` : `${signed(g.gain)} (${g.n} decks: no range)`;
  };

  const chart: { decks: number; inventors: Record<string, number>; versions: unknown[]; perDeck: unknown[] } = { decks: 0, inventors: {}, versions: [], perDeck: [] };
  for (const v of t.versions) {
    const ids = t.changed(v);
    console.log(`\n==================== ${v.name}: ${ids.length} decks whose request changed (${t.old}) ====================`);
    if (!ids.length) {
      console.log("  no builds on the new requests yet");
      continue;
    }
    console.log(`Runs: the 3-card request ${v.oldRuns.length}; builds with every signature card named from ${v.files.join(", ")}.`);
    const table = (label: string, set: string[]) => {
      if (!set.length) return;
      console.log(`${label.padEnd(44)} 3 cards   named   gain (95% range)        | inventors`);
      for (const [f, name] of IDEA_METRICS) console.log(`  ${name.padEnd(42)} ${one(level(v.oldRuns, set, f))}  ${one(level(v.newRuns, set, f))}   ${gainText(v.newRuns, v.oldRuns, set, f).padEnd(23)} | ${one(t.inventors(set, f))}`);
    };
    table(`All ${ids.length}`, ids);
    if (future) {
      table(`\nThe ${ids.filter((id) => !shared(id)).length} requests dev has not seen`, ids.filter((id) => !shared(id)));
      table(`\nThe ${ids.filter(shared).length} that are dev requests (dev's builds)`, ids.filter(shared));
    }
    const row = (runs: Map<string, IdeaScore>[]) => Object.fromEntries(IDEA_METRICS.map(([f]) => [f, level(runs, ids, f)]));
    chart.versions.push({ key: v.kind, name: v.kind === "v0" ? "The model alone" : "The brewer", old: row(v.oldRuns), new: row(v.newRuns), gain: Object.fromEntries(IDEA_METRICS.map(([f]) => [f, gain(v.newRuns, v.oldRuns, ids, f)])) });
    if (v.kind === "brewer") {
      chart.decks = ids.length;
      chart.inventors = Object.fromEntries(IDEA_METRICS.map(([f]) => [f, t.inventors(ids, f)]));
      chart.perDeck = ids.map((id) => ({
        id,
        name: shortDeck(id).split("-").map((w) => (/^\d/.test(w) ? w : w[0].toUpperCase() + w.slice(1))).join(" "),
        fresh: ctx.get(id)!.fresh,
        old: of(v.oldRuns, id, "whole"),
        new: of(v.newRuns, id, "whole"),
        inv: t.inventors([id], "whole"),
      }));
    }
    console.log(`  Cards named for the first time: ${(ids.reduce((n, id) => n + ctx.get(id)!.fresh, 0) / ids.length).toFixed(1)} a deck. A build plays ${level(v.oldRuns, ids, "named").toFixed(1)} of them on the 3-card request (${level(v.oldRuns, ids, "copies").toFixed(1)} copies), ${level(v.newRuns, ids, "named").toFixed(1)} when they are named (${level(v.newRuns, ids, "copies").toFixed(1)} copies).`);
    console.log(`  Decks that scored higher with the idea named: ${ids.filter((id) => of(v.newRuns, id, "whole") > of(v.oldRuns, id, "whole")).length} of ${ids.length}.`);
    const all = t.all(v);
    const m = (xs: number[]) => one(xs.reduce((a, b) => a + b, 0) / xs.length).trim();
    console.log(`  All ${all.length} decks (${all.filter((id) => !ctx.get(id)!.changed).length} unchanged requests keep their saved builds): whole deck ${m(all.map((id) => of(v.oldRuns, id, "whole")))} to ${m(all.map((id) => t.carried(v, id, "whole")))}; without lands ${m(all.map((id) => of(v.oldRuns, id, "noLands")))} to ${m(all.map((id) => t.carried(v, id, "noLands")))}; inventors ${one(t.inventors(all, "whole")).trim()} and ${one(t.inventors(all, "noLands")).trim()}.`);

    if (perDeck) {
      console.log(`\n  Per deck: newly named cards | whole deck, 3 cards to named | inventors | lands | hidden | other spells (each 3 cards to named)`);
      for (const id of ids) {
        const pair = (f: IdeaMetric) => `${one(of(v.oldRuns, id, f))} >${one(of(v.newRuns, id, f))}`;
        console.log(`    ${shortDeck(id).padEnd(28)} ${String(ctx.get(id)!.fresh).padStart(2)} | ${pair("whole")} | ${one(t.inventors([id], "whole"))} | ${pair("lands")} | ${pair("hidden")} | ${pair("other")}${future ? `${shared(id) ? "" : "  new request"}${afterTraining(id) ? "  after training" : ""}` : ""}`);
      }
    }
  }

  // The harness over the model alone, on each kind of request, same decks.
  const { alone, brewer, both } = t;
  if (both.length) {
    const lead = (label: string, set: string[]) => {
      if (!set.length) return;
      console.log(`\n${label}: ${set.length} decks. The model alone / the brewer, with the idea named: whole deck ${one(level(alone.newRuns, set, "whole")).trim()} / ${one(level(brewer.newRuns, set, "whole")).trim()}; without lands ${one(level(alone.newRuns, set, "noLands")).trim()} / ${one(level(brewer.newRuns, set, "noLands")).trim()}; points from lands ${one(level(alone.newRuns, set, "lands")).trim()} / ${one(level(brewer.newRuns, set, "lands")).trim()}`);
      for (const [f, name] of IDEA_METRICS.slice(0, 2)) console.log(`  ${name.padEnd(16)} on the 3-card request ${gainText(brewer.oldRuns, alone.oldRuns, set, f)} | with the idea named ${gainText(brewer.newRuns, alone.newRuns, set, f)}`);
    };
    console.log(`\n==================== The brewer over the model alone ====================`);
    lead("All the decks whose request changed", both);
    lead("Decks that appeared after the model's training ended (the post-cutoff test's)", both.filter(afterTraining));
    lead("The other decks", both.filter((id) => !afterTraining(id)));
    if (future) lead("The requests dev has not seen", both.filter((id) => !shared(id)));
    if (perDeck) for (const id of both) console.log(`    ${shortDeck(id).padEnd(28)} the model alone ${one(of(alone.newRuns, id, "whole"))} | the brewer ${one(of(brewer.newRuns, id, "whole"))} | ${signed(of(brewer.newRuns, id, "whole") - of(alone.newRuns, id, "whole")).padStart(6)}${afterTraining(id) ? "  after training" : ""}`);
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
