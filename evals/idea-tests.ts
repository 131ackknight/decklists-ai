/**
 * The idea-named tests against the 3-card tests (2026-11-11; owner: "Yes, run it", then "Yes, add them").
 *
 * holdout-idea-v1 and future-idea-v1 (evals/tests.ts) are holdout-v2 and future-v2 with requests that name
 * every signature card of the deck instead of the first 3. They ask a different question: the 3-card tests
 * ask the brewer to guess the idea and build it; these give the idea and ask only for the build. So a
 * score here is never a higher score there.
 *
 * For the model alone (v0) and the brewer: each deck's builds on the new request against the same
 * version's saved builds on the old one. Scores as in scripts/no-lands-check.ts: the whole deck, without
 * lands, and the points of the whole-deck score that come from lands, from the cards the OLD request hid,
 * and from the other spells. The hidden cards are read off the old item, so both requests are scored
 * against the same piles.
 *
 * - A build counts for every deck of the test whose idea-named request is word for word the one it was
 *   built for (same format, date and prompt): 6 of the future test's 12 changed requests are dev requests.
 * - A deck whose request names nothing new keeps its saved builds from the 3-card test.
 * - The brewer on the new requests is v24 (the base with submit_deck's "needs" list widened from 6 entries
 *   to 16; with 6, a request naming more than 6 cards could never be submitted) together with the base's
 *   own builds on them. The comparison on the 3-card request is the protocol's base on dev and v13 on the
 *   future test (the base has no future-test runs yet).
 * - Runs on the new requests count even when stopped before the end: what they saved is read.
 *
 * Used by scripts/idea-test-check.ts (everything, per deck) and scripts/scoreboard.ts (section 2i).
 */
import { readFileSync } from "node:fs";
import type { CardIndex } from "../src/cards/card-index";
import { PROTOCOL, pairedGain } from "./protocol";
import { latestRuns, type RunRecord } from "./register";
import { toCounts, type Line, type Round4Item } from "./round4/items";
import { addedScore, earlierLists, partScores, type Counts, type RefList } from "./score";
import { sameItems, testById } from "./tests";

export const IDEA_METRICS = [
  ["whole", "Whole deck"],
  ["noLands", "Without lands"],
  ["lands", "Points from lands"],
  ["hidden", "Points from the cards the old request hid"],
  ["other", "Points from the other spells"],
  ["added", "Added (whole deck)"],
] as const;
export type IdeaMetric = (typeof IDEA_METRICS)[number][0];
export type IdeaScore = Record<IdeaMetric, number> & { named: number; copies: number };
/** The base with submit_deck's cap on "needs" entries raised (src/harness/run.ts brewV24). */
export const IDEA_FIXED = "v24";

export interface IdeaEnv {
  index: CardIndex;
  items: Map<string, Round4Item>;
  lists: RefList[];
  /** The card pool a brew of this item gets (evals/round4/deps.ts brewDeps). */
  depsOf: (it: Round4Item) => { index: CardIndex };
  countsOf: (l: RefList) => Counts;
  legalView: (d: Counts, format: string, date: string) => Counts;
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
/** Cards shared [whole, without lands, without lands or hidden] to points of [lands, hidden cards, the other spells]. */
const split = (x: number[]) => [x[0] - x[1], x[1] - x[2], x[2]].map((c) => (c / 60) * 100);
const requestKey = (it: Round4Item) => `${it.format}|${it.before}|${it.prompt}`;
export const shortDeck = (id: string) => id.replace(/^(holdout|future)-/, "");

export type IdeaVersion = { name: string; kind: "v0" | "brewer"; oldRuns: Map<string, IdeaScore>[]; newRuns: Map<string, IdeaScore>[]; files: string[] };

export function ideaTest(env: IdeaEnv, future: boolean) {
  const { index, items, lists, depsOf, countsOf, legalView } = env;
  const old = future ? "future-v2" : "holdout-v2";
  const [from, to] = future ? [7, 365] : [30, 90];
  const base = future ? "v13" : PROTOCOL.base;
  const keyOf = (name: string) => [...toCounts(index, [{ qty: 1, name }]).keys()][0];

  // Per deck, from the OLD item: its scorers, and the cards the new request names for the first time.
  const ctx = new Map(
    testById(old).items.flatMap((id) => {
      const it = items.get(id)!;
      const idea = items.get(`idea-${id}`)!;
      const t = it.target!;
      const date = it.before ?? t.firstSeen;
      const pool = depsOf(it).index;
      const p = partScores(index, lists, it, countsOf, (k) => !!pool.getCard(k), from, to);
      if (!p.settled.length) return [];
      const view = (d: Counts) => legalView(d, t.format, date);
      const earlier = earlierLists(lists, t.format, date, countsOf);
      const fresh = idea.keyCards!.slice(it.keyCards!.length).map(keyOf);
      const score = (built: Counts, viewed: boolean): IdeaScore => {
        const d = viewed ? view(built) : built;
        const s = p.of(d, built);
        const [lands, hidden, other] = split(p.shared(d));
        const closest = addedScore(built, p.settled, earlier, viewed ? view : undefined).closest;
        const closestScore = closest ? p.of(viewed ? view(closest) : closest, closest)[0] : 0;
        return { whole: s[0], noLands: s[1], lands, hidden, other, added: s[0] - closestScore, named: fresh.filter((k) => (built.get(k) ?? 0) > 0).length, copies: fresh.reduce((n, k) => n + (built.get(k) ?? 0), 0) };
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
  /** The request is word for word one of the other test's (dev's, for the future test). */
  const shared = (id: string) => otherTest.has(requestKey(items.get(`idea-${id}`)!));
  const post = new Set(testById("post-v1").items.map((id) => id.replace(/^post-/, "")));
  /** The deck appeared after the model's training ended: the post-cutoff test's decks. */
  const afterTraining = (id: string) => post.has(shortDeck(id));

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
  const versions: IdeaVersion[] = (
    [
      ["The model alone (v0)", "v0", "v0"],
      [`The brewer (${base} on the 3-card request)`, base, "brewer"],
    ] as const
  ).map(([name, oldHarness, kind]) => {
    const oldRuns = scoresOf(fin.filter((r) => r.harness === oldHarness && (r.tests.includes(old) || r.tests.some((x) => sameItems(x, old)))));
    const newRuns = scoresOf(ideaRuns.filter((r) => (kind === "v0" ? r.harness === "v0" : r.harness === PROTOCOL.base || r.harness === IDEA_FIXED)));
    return { name, kind, oldRuns: oldRuns.map((r) => r.m), newRuns: newRuns.map((r) => r.m), files: newRuns.map((r) => `${r.rec.file}${r.rec.event === "started" ? " (stopped)" : ""}`) };
  });
  const [alone, brewer] = versions;

  /** A deck's number, averaged over the runs that built it. */
  const of = (runs: Map<string, IdeaScore>[], id: string, f: IdeaMetric | "named" | "copies") => mean(runs.flatMap((m) => (m.has(id) ? [m.get(id)![f]] : [])));
  const maps = (runs: Map<string, IdeaScore>[], ids: string[], f: IdeaMetric) => runs.map((m) => new Map(ids.flatMap((id) => (m.has(id) ? [[id, m.get(id)![f]] as const] : []))));
  /** The mean over decks of a version's number on one kind of request. */
  const level = (runs: Map<string, IdeaScore>[], ids: string[], f: IdeaMetric | "named" | "copies") => mean(ids.map((id) => of(runs, id, f)));
  /** New request over old, or one version over another: paired by deck, with a 95% range. */
  const gain = (cand: Map<string, IdeaScore>[], ref: Map<string, IdeaScore>[], ids: string[], f: IdeaMetric) => pairedGain(maps(cand, ids, f), maps(ref, ids, f));
  /** The decks whose request changed, built on both requests by this version. */
  const changed = (v: IdeaVersion) => [...ctx.keys()].filter((id) => ctx.get(id)!.changed && v.newRuns.some((m) => m.has(id)) && v.oldRuns.some((m) => m.has(id)));
  /** Every deck of the test this version can be scored on: unchanged requests keep their saved builds. */
  const all = (v: IdeaVersion) => [...ctx.keys()].filter((id) => v.oldRuns.some((m) => m.has(id)) && (!ctx.get(id)!.changed || v.newRuns.some((m) => m.has(id))));
  const carried = (v: IdeaVersion, id: string, f: IdeaMetric) => (ctx.get(id)!.changed ? of(v.newRuns, id, f) : of(v.oldRuns, id, f));
  const inventors = (ids: string[], f: IdeaMetric) => mean(ids.map((id) => mean(ctx.get(id)!.inventors.map((s) => s[f]))));
  /** The changed decks both the model alone and the brewer built on both requests. */
  const both = [...ctx.keys()].filter((id) => ctx.get(id)!.changed && versions.every((v) => v.newRuns.some((m) => m.has(id)) && v.oldRuns.some((m) => m.has(id))));

  return { old, idea: future ? "future-idea-v1" : "holdout-idea-v1", base, ctx, versions, alone, brewer, shared, afterTraining, of, maps, level, gain, changed, all, carried, inventors, both };
}
