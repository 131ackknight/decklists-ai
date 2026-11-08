/**
 * Does showing a spell make the AI play it? (2026-11-08.) For the borrowed spells (evals/score.ts
 * borrowedSpells) that were on a candidate's list, the share of decks that play them: the candidate's decks
 * (which saw the list) against the base's (which didn't). Also the same for listed spells that are not
 * borrowed spells, to see whether the list raises everything or the right cards. Free: saved results only.
 *
 *   pnpm exec tsx scripts/borrow-listed.ts [--model claude-haiku-5-5] [--base v13] [--candidate v20]
 */
import { existsSync, readFileSync } from "node:fs";
import { loadCardIndex } from "../src/cards/load";
import { normalizeName } from "../src/cards/names";
import { round4Items, toCounts, type Line } from "../evals/round4/items";
import { pairedGain } from "../evals/protocol";
import { borrowedSpells, loadLists, type Counts, type RefList } from "../evals/score";
import { testById } from "../evals/tests";

const arg = (name: string, fallback: string) => (process.argv.includes(`--${name}`) ? process.argv[process.argv.indexOf(`--${name}`) + 1] : fallback);
const model = arg("model", "claude-haiku-5-5");
const [baseH, candH] = [arg("base", "v13"), arg("candidate", "v20")];

const index = loadCardIndex();
const items = new Map(round4Items(index).map((it) => [it.id, it]));
const lists = loadLists(String(testById("tuning-v1").params.dataThrough));
const cache = new Map<RefList, Counts>();
const countsOf = (l: RefList) => cache.get(l) ?? cache.set(l, toCounts(index, l.main)).get(l)!;
type Row = { id: string; deck: { main: Line[] } | null; borrow?: string[] };
const runsOf = (h: string) =>
  ["", "-r2", "-r3", "-r4", "-r5"]
    .map((tag) => `evals/results/round4/holdout-${h}-${model}${tag}.json`)
    .filter(existsSync)
    .map((f) => new Map((JSON.parse(readFileSync(f, "utf8")).results as Row[]).filter((r) => r?.deck).map((r) => [r.id, r] as const)));
const [base, cand] = [runsOf(baseH), runsOf(candH)];
const canon = (n: string) => normalizeName(index.getCard(n)?.name ?? n);

const shares = { listedBorrowed: [new Map<string, number>(), new Map<string, number>()], listedOther: [new Map<string, number>(), new Map<string, number>()] };
const counts = { listedBorrowed: 0, listedOther: 0 };
for (const id of testById("holdout-v1").items) {
  const listed = [...new Set(cand.flatMap((run) => run.get(id)?.borrow ?? []).map(canon))];
  if (!listed.length) continue;
  const borrowed = borrowedSpells(index, lists, items.get(id)!, countsOf);
  const groups = { listedBorrowed: listed.filter((k) => borrowed.has(k)), listedOther: listed.filter((k) => !borrowed.has(k)) };
  for (const g of ["listedBorrowed", "listedOther"] as const) {
    if (!groups[g].length) continue;
    counts[g] += groups[g].length;
    [base, cand].forEach((runs, side) => {
      const per = runs.map((run) => {
        const d = toCounts(index, run.get(id)!.deck!.main);
        return groups[g].filter((k) => d.has(k)).length / groups[g].length;
      });
      shares[g][side].set(id, (per.reduce((a, b) => a + b, 0) / per.length) * 100);
    });
  }
}
const mean = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0) / Math.max(1, m.size);
const s = (x: number) => `${x >= 0 ? "+" : ""}${x.toFixed(1)}`;
console.log(`${model}: ${baseH} ${base.length} run(s), ${candH} ${cand.length} run(s)`);
for (const [g, label] of [
  ["listedBorrowed", "listed spells that are borrowed spells"],
  ["listedOther", "listed spells that are not"],
] as const) {
  const g2 = pairedGain([shares[g][1]], [shares[g][0]]);
  console.log(`${label} (${counts[g]} spells, ${shares[g][0].size} decks): played by ${mean(shares[g][0]).toFixed(1)}% of ${baseH} decks, ${mean(shares[g][1]).toFixed(1)}% of ${candH} decks; gain ${s(g2.gain)} (${s(g2.lo)} to ${s(g2.hi)})`);
}
