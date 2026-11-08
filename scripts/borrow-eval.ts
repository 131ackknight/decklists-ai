/**
 * v20 against v13 on the dev decks (2026-11-08): do the decks pick more of the spells inventors borrowed
 * (evals/score.ts borrowedSpells) once they are shown the list? Free: reads saved results.
 *
 *   pnpm exec tsx scripts/borrow-eval.ts [--model claude-haiku-5-5] [--base v13] [--candidate v20]
 *
 * Per deck, each averaged over a version's dev runs, paired by deck with a 95% range (evals/protocol.ts
 * pairedGain): the share of the deck's borrowed spells it contains (decks that have any), Added, and the
 * match %. For the candidate: how many listed cards its decks play, and how many of those are borrowed spells.
 */
import { existsSync, readFileSync } from "node:fs";
import { loadCardIndex } from "../src/cards/load";
import { normalizeName } from "../src/cards/names";
import { round4Items, toCounts, type Line } from "../evals/round4/items";
import { pairedGain } from "../evals/protocol";
import { addedScore, borrowedSpells, earlierLists, loadLists, settledLists, type Counts, type RefList } from "../evals/score";
import { testById } from "../evals/tests";

const arg = (name: string, fallback: string) => (process.argv.includes(`--${name}`) ? process.argv[process.argv.indexOf(`--${name}`) + 1] : fallback);
const model = arg("model", "claude-haiku-5-5");
const versions = [arg("base", "v13"), arg("candidate", "v20")];

const index = loadCardIndex();
const items = new Map(round4Items(index).map((it) => [it.id, it]));
const lists = loadLists(String(testById("tuning-v1").params.dataThrough));
const cache = new Map<RefList, Counts>();
const countsOf = (l: RefList) => cache.get(l) ?? cache.set(l, toCounts(index, l.main)).get(l)!;
const ids = testById("holdout-v1").items;
const ctx = new Map(
  ids.map((id) => {
    const it = items.get(id)!;
    return [id, { borrowed: borrowedSpells(index, lists, it, countsOf), settled: settledLists(index, lists, it.target!, 30, 90), earlier: earlierLists(lists, it.target!.format, it.before ?? it.target!.firstSeen, countsOf) }] as const;
  }),
);

type Row = { id: string; deck: { main: Line[] } | null; borrow?: string[] };
const runsOf = (h: string) =>
  ["", "-r2", "-r3", "-r4", "-r5"]
    .map((tag) => `evals/results/round4/holdout-${h}-${model}${tag}.json`)
    .filter(existsSync)
    .map((f) => (JSON.parse(readFileSync(f, "utf8")).results as Row[]).filter((r) => r?.deck && ctx.has(r.id)));
const score = (runs: Row[][], f: (id: string, d: Counts, r: Row) => number | null) =>
  runs.map((rows) => new Map(rows.flatMap((r) => {
    const v = f(r.id, toCounts(index, r.deck!.main), r);
    return v === null ? [] : [[r.id, v] as [string, number]];
  })));
const measures: [string, (id: string, d: Counts, r: Row) => number | null][] = [
  ["Borrowed spells in the deck (% of the deck's)", (id, d) => (ctx.get(id)!.borrowed.size ? ([...ctx.get(id)!.borrowed].filter((k) => d.has(k)).length / ctx.get(id)!.borrowed.size) * 100 : null)],
  ["Added", (id, d) => addedScore(d, ctx.get(id)!.settled, ctx.get(id)!.earlier).added],
  ["Match %", (id, d) => addedScore(d, ctx.get(id)!.settled, ctx.get(id)!.earlier).match],
];

const [base, cand] = versions.map(runsOf);
console.log(`${model} on dev: ${versions[0]} ${base.length} run(s), ${versions[1]} ${cand.length} run(s); decks with borrowed spells: ${[...ctx.values()].filter((c) => c.borrowed.size).length} of ${ids.length}`);
const mean = (ms: Map<string, number>[]) => {
  const xs = ms.flatMap((m) => [...m.values()]);
  return xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
};
for (const [name, f] of measures) {
  const [b, c] = [score(base, f), score(cand, f)];
  if (!b.length || !c.length) continue;
  const g = pairedGain(c, b);
  const s = (x: number) => `${x >= 0 ? "+" : ""}${x.toFixed(1)}`;
  console.log(`${name.padEnd(46)} ${versions[0]} ${mean(b).toFixed(1)} | ${versions[1]} ${mean(c).toFixed(1)} | gain ${s(g.gain)} (${s(g.lo)} to ${s(g.hi)}), ${g.n} decks`);
}
// Did the candidate's decks use the list?
let listed = 0;
let played = 0;
let playedBorrowed = 0;
for (const rows of cand)
  for (const r of rows) {
    const d = toCounts(index, r.deck!.main);
    const shown = (r.borrow ?? []).map((n) => normalizeName(index.getCard(n)?.name ?? n));
    listed += shown.length;
    const used = shown.filter((k) => d.has(k));
    played += used.length;
    playedBorrowed += used.filter((k) => ctx.get(r.id)!.borrowed.has(k)).length;
  }
const decks = cand.reduce((n, rows) => n + rows.length, 0);
if (decks) console.log(`${versions[1]}'s list: ${(listed / decks).toFixed(1)} cards shown per deck, ${(played / decks).toFixed(1)} played per deck, ${playedBorrowed} of the ${played} played are borrowed spells`);
