/**
 * The idea-named tests against the 3-card tests (2026-11-11; owner: "Yes, run it"). Free: reads saved builds.
 *
 *   pnpm exec tsx scripts/idea-test-check.ts [--future] [--decks] [--json file]
 *
 * holdout-idea-v1 and future-idea-v1 (evals/tests.ts) are holdout-v2 and future-v2 with requests that name
 * every signature card of the deck instead of the first 3. For the model alone (v0) and the brewer: each
 * deck's builds on the new request against the same version's saved builds on the old one, paired by deck,
 * with a 95% range (evals/protocol.ts pairedGain). Scores as in scripts/no-lands-check.ts: the whole deck,
 * without lands, and the points of the whole-deck score that come from lands, from the cards the OLD
 * request hid, and from the other spells. The hidden cards are read off the old item, so both requests are
 * scored against the same piles. Decks whose request did not change keep their saved builds.
 *
 * Default: the dev decks (holdout-v2; the brewer's saved runs are the protocol's base, v22). --future: the
 * future test (future-v2; the brewer's saved runs there are v13's). A build counts for every deck whose
 * idea-named request is word for word the one it was built for (same format, date and prompt): 6 of the
 * future test's 12 changed requests are dev requests, so dev's builds answer them. With --future the lead
 * over the model alone is also split by whether the deck appeared after the model's training ended (the
 * decks of post-v1), a split fixed in BUILD_LOG.md before the run.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { loadCardIndex } from "../src/cards/load";
import { FileDataSource } from "../src/data/source";
import { PROTOCOL, pairedGain } from "../evals/protocol";
import { latestRuns, type RunRecord } from "../evals/register";
import { brewDeps } from "../evals/round4/deps";
import { round4Items, toCounts, type Line, type Round4Item } from "../evals/round4/items";
import { addedScore, earlierLists, legalOnDateView, loadLists, partScores, type Counts, type RefList } from "../evals/score";
import { sameItems, testById } from "../evals/tests";

const perDeck = process.argv.includes("--decks");
const future = process.argv.includes("--future");
/** --json file: the same numbers for a chart (the decks whose request changed). */
const jsonOut = process.argv.includes("--json") ? process.argv[process.argv.indexOf("--json") + 1] : null;
const OLD = future ? "future-v2" : "holdout-v2";
const [FROM, TO] = future ? [7, 365] : [30, 90];
/** The brewer whose saved runs on the 3-card request are the comparison: the base on dev, v13 on the future test. */
const BASE = future ? "v13" : PROTOCOL.base;
/** The base with submit_deck's cap on "needs" entries raised (src/harness/run.ts brewV24). */
const FIXED = "v24";
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
  const short = (id: string) => id.replace(/^(holdout|future)-/, "");
  const requestKey = (it: Round4Item) => `${it.format}|${it.before}|${it.prompt}`;

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
  // A build answers every deck of this test whose idea-named request is word for word the one it was built for.
  const sameRequest = new Map([...ctx.keys()].map((id) => [requestKey(items.get(`idea-${id}`)!), id]));
  const deckOf = (resultId: string) => {
    const direct = resultId.replace(/^idea-/, "");
    if (ctx.has(direct)) return direct;
    const it = items.get(resultId);
    return it?.track === "idea" ? sameRequest.get(requestKey(it)) : undefined;
  };
  const otherTest = new Set(testById(future ? "holdout-v2" : "future-v2").items.map((id) => requestKey(items.get(`idea-${id}`)!)));
  /** The request is word for word one of the other test's (dev's, with --future). */
  const shared = (id: string) => otherTest.has(requestKey(items.get(`idea-${id}`)!));
  const post = new Set(testById("post-v1").items.map((id) => id.replace(/^post-/, "")));
  /** The deck appeared after the model's training ended: the post-cutoff test's decks. */
  const afterTraining = (id: string) => post.has(short(id));

  // The new requests' runs count even when stopped before the end (what they saved is read). The brewer's
  // dev run on them was stopped on 2026-11-11: submit_deck took at most 6 "needs" entries, so a request naming
  // more than 6 cards could never be submitted. v24 is the base with that cap raised; its builds count too.
  const reg = latestRuns();
  const fin = reg.finished.filter((r) => r.model === PROTOCOL.model);
  const ideaRuns = [...reg.finished, ...reg.unfinished].filter((r) => r.model === PROTOCOL.model && r.tracks?.includes("idea"));
  const scoresOf = (recs: RunRecord[]) =>
    recs
      .map((rec) => ({
        rec,
        m: new Map(
          (JSON.parse(readFileSync(rec.file, "utf8")).results as ({ id: string; deck: { main: Line[] } | null } | null)[]).flatMap((x) => {
            const id = x ? deckOf(x.id) : undefined;
            return x?.deck && id ? [[id, ctx.get(id)!.score(toCounts(index, x.deck.main), true)] as const] : [];
          }),
        ),
      }))
      .filter((r) => r.m.size);
  const of = (runs: Map<string, Score>[], id: string, f: Metric | "named" | "copies") => mean(runs.flatMap((m) => (m.has(id) ? [m.get(id)![f]] : [])));
  const maps = (runs: Map<string, Score>[], ids: string[], f: Metric) => runs.map((m) => new Map(ids.flatMap((id) => (m.has(id) ? [[id, m.get(id)![f]] as const] : []))));
  const gainText = (cand: Map<string, number>[], base: Map<string, number>[]) => {
    const g = pairedGain(cand, base);
    return g.n >= 3 ? `${signed(g.gain)} (${signed(g.lo)} to ${signed(g.hi)})` : `${signed(g.gain)} (${g.n} decks: no range)`;
  };

  const versions = [
    ["The model alone (v0)", "v0", "v0"],
    [`The brewer (${BASE} on the 3-card request)`, BASE, "brewer"],
  ].map(([name, oldHarness, kind]) => {
    const oldRuns = scoresOf(fin.filter((r) => r.harness === oldHarness && (r.tests.includes(OLD) || r.tests.some((x) => sameItems(x, OLD)))));
    const newRuns = scoresOf(ideaRuns.filter((r) => (kind === "v0" ? r.harness === "v0" : r.harness === PROTOCOL.base || r.harness === FIXED)));
    return { name, kind, oldRuns: oldRuns.map((r) => r.m), newRuns: newRuns.map((r) => r.m), files: newRuns.map((r) => `${r.rec.file}${r.rec.event === "started" ? " (stopped)" : ""}`) };
  });

  const chart: { decks: number; inventors: Record<string, number>; versions: unknown[]; perDeck: unknown[] } = { decks: 0, inventors: {}, versions: [], perDeck: [] };
  for (const v of versions) {
    const ids = [...ctx.keys()].filter((id) => ctx.get(id)!.changed && v.newRuns.some((m) => m.has(id)) && v.oldRuns.some((m) => m.has(id)));
    console.log(`\n==================== ${v.name}: ${ids.length} decks whose request changed (${OLD}) ====================`);
    if (!ids.length) {
      console.log("  no builds on the new requests yet");
      continue;
    }
    console.log(`Runs: the 3-card request ${v.oldRuns.length}; builds with every signature card named from ${v.files.join(", ")}.`);
    const table = (label: string, set: string[]) => {
      if (!set.length) return;
      console.log(`${label.padEnd(44)} 3 cards   named   gain (95% range)        | inventors`);
      for (const [f, name] of METRICS)
        console.log(`  ${name.padEnd(42)} ${one(mean(set.map((id) => of(v.oldRuns, id, f))))}  ${one(mean(set.map((id) => of(v.newRuns, id, f))))}   ${gainText(maps(v.newRuns, set, f), maps(v.oldRuns, set, f)).padEnd(23)} | ${one(mean(set.map((id) => mean(ctx.get(id)!.inventors.map((s) => s[f])))))}`);
    };
    table(`All ${ids.length}`, ids);
    if (future) {
      table(`\nThe ${ids.filter((id) => !shared(id)).length} requests dev has not seen`, ids.filter((id) => !shared(id)));
      table(`\nThe ${ids.filter(shared).length} that are dev requests (dev's builds)`, ids.filter(shared));
    }
    const row = (runs: Map<string, Score>[]) => Object.fromEntries(METRICS.map(([f]) => [f, mean(ids.map((id) => of(runs, id, f)))]));
    chart.versions.push({ key: v.kind, name: v.kind === "v0" ? "The model alone" : "The brewer", old: row(v.oldRuns), new: row(v.newRuns), gain: Object.fromEntries(METRICS.map(([f]) => [f, pairedGain(maps(v.newRuns, ids, f), maps(v.oldRuns, ids, f))])) });
    if (v.kind === "brewer") {
      chart.decks = ids.length;
      chart.inventors = Object.fromEntries(METRICS.map(([f]) => [f, mean(ids.map((id) => mean(ctx.get(id)!.inventors.map((s) => s[f]))))]));
      chart.perDeck = ids.map((id) => ({
        id,
        name: short(id).split("-").map((w) => (/^\d/.test(w) ? w : w[0].toUpperCase() + w.slice(1))).join(" "),
        fresh: ctx.get(id)!.fresh,
        old: of(v.oldRuns, id, "whole"),
        new: of(v.newRuns, id, "whole"),
        inv: mean(ctx.get(id)!.inventors.map((s) => s.whole)),
      }));
    }
    const fresh = mean(ids.map((id) => ctx.get(id)!.fresh));
    console.log(`  Cards named for the first time: ${fresh.toFixed(1)} a deck. A build plays ${mean(ids.map((id) => of(v.oldRuns, id, "named"))).toFixed(1)} of them on the 3-card request (${mean(ids.map((id) => of(v.oldRuns, id, "copies"))).toFixed(1)} copies), ${mean(ids.map((id) => of(v.newRuns, id, "named"))).toFixed(1)} when they are named (${mean(ids.map((id) => of(v.newRuns, id, "copies"))).toFixed(1)} copies).`);
    const better = ids.filter((id) => of(v.newRuns, id, "whole") > of(v.oldRuns, id, "whole")).length;
    console.log(`  Decks that scored higher with the idea named: ${better} of ${ids.length}.`);

    const all = [...ctx.keys()].filter((id) => v.oldRuns.some((m) => m.has(id)) && (!ctx.get(id)!.changed || v.newRuns.some((m) => m.has(id))));
    const carried = (id: string, f: Metric) => (ctx.get(id)!.changed ? of(v.newRuns, id, f) : of(v.oldRuns, id, f));
    console.log(`  All ${all.length} decks (${all.filter((id) => !ctx.get(id)!.changed).length} unchanged requests keep their saved builds): whole deck ${one(mean(all.map((id) => of(v.oldRuns, id, "whole")))).trim()} to ${one(mean(all.map((id) => carried(id, "whole")))).trim()}; without lands ${one(mean(all.map((id) => of(v.oldRuns, id, "noLands")))).trim()} to ${one(mean(all.map((id) => carried(id, "noLands")))).trim()}; inventors ${one(mean(all.map((id) => mean(ctx.get(id)!.inventors.map((s) => s.whole))))).trim()} and ${one(mean(all.map((id) => mean(ctx.get(id)!.inventors.map((s) => s.noLands))))).trim()}.`);

    if (perDeck) {
      console.log(`\n  Per deck: newly named cards | whole deck, 3 cards to named | inventors | lands | hidden | other spells (each 3 cards to named)`);
      for (const id of ids) {
        const pair = (f: Metric) => `${one(of(v.oldRuns, id, f))} >${one(of(v.newRuns, id, f))}`;
        console.log(`    ${short(id).padEnd(28)} ${String(ctx.get(id)!.fresh).padStart(2)} | ${pair("whole")} | ${one(mean(ctx.get(id)!.inventors.map((s) => s.whole)))} | ${pair("lands")} | ${pair("hidden")} | ${pair("other")}${future ? `${shared(id) ? "" : "  new request"}${afterTraining(id) ? "  after training" : ""}` : ""}`);
      }
    }
  }

  // The harness over the model alone, on each kind of request, same decks.
  const [alone, brewer] = versions;
  const both = [...ctx.keys()].filter((id) => ctx.get(id)!.changed && [alone, brewer].every((v) => v.newRuns.some((m) => m.has(id)) && v.oldRuns.some((m) => m.has(id))));
  if (both.length) {
    const lead = (label: string, set: string[]) => {
      if (!set.length) return;
      console.log(`\n${label}: ${set.length} decks. The model alone / the brewer, with the idea named: whole deck ${one(mean(set.map((id) => of(alone.newRuns, id, "whole")))).trim()} / ${one(mean(set.map((id) => of(brewer.newRuns, id, "whole")))).trim()}; without lands ${one(mean(set.map((id) => of(alone.newRuns, id, "noLands")))).trim()} / ${one(mean(set.map((id) => of(brewer.newRuns, id, "noLands")))).trim()}`);
      for (const [f, name] of METRICS.slice(0, 2))
        console.log(`  ${name.padEnd(16)} on the 3-card request ${gainText(maps(brewer.oldRuns, set, f), maps(alone.oldRuns, set, f))} | with the idea named ${gainText(maps(brewer.newRuns, set, f), maps(alone.newRuns, set, f))}`);
    };
    console.log(`\n==================== The brewer over the model alone ====================`);
    lead("All the decks whose request changed", both);
    lead("Decks that appeared after the model's training ended (the post-cutoff test's)", both.filter(afterTraining));
    lead("The other decks", both.filter((id) => !afterTraining(id)));
    if (future) lead("The requests dev has not seen", both.filter((id) => !shared(id)));
    if (perDeck) for (const id of both) console.log(`    ${short(id).padEnd(28)} the model alone ${one(of(alone.newRuns, id, "whole"))} | the brewer ${one(of(brewer.newRuns, id, "whole"))} | ${signed(of(brewer.newRuns, id, "whole") - of(alone.newRuns, id, "whole")).padStart(6)}${afterTraining(id) ? "  after training" : ""}`);
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
