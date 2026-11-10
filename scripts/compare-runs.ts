/**
 * Compare two sets of saved dev runs on the decks they share (2026-11-09). Free: reads result files.
 *
 *   pnpm exec tsx scripts/compare-runs.ts --base f1.json,f2.json --cand g1.json [--items id,id]
 *
 * Files are in evals/results/round4/. Per deck, each side averaged over its runs, paired by deck
 * (evals/protocol.ts pairedGain): Added, match %, lands shared with the settled lists (holdout-v1's
 * windows: days 30-90). Also, for Standard decks, the copies per deck that weren't Standard-legal on the
 * deck's date (src/cards/standard.ts, with the same 30-day MTGO allowance as CardIndex.asOf).
 */
import { readFileSync } from "node:fs";
import { loadCardIndex } from "../src/cards/load";
import { loadStandardWindows, standardEnds, standardLegalOn } from "../src/cards/standard";
import { pairedGain } from "../evals/protocol";
import { isLand, round4Items, toCounts, type Line } from "../evals/round4/items";
import { addedScore, earlierLists, loadLists, overlap, settledLists, type Counts, type RefList } from "../evals/score";
import { testById } from "../evals/tests";

const DAY = 86_400_000;
const arg = (name: string) => (process.argv.includes(`--${name}`) ? process.argv[process.argv.indexOf(`--${name}`) + 1] : undefined);
const baseFiles = (arg("base") ?? "").split(",").filter(Boolean);
const candFiles = (arg("cand") ?? "").split(",").filter(Boolean);
const only = arg("items")?.split(",");
if (!baseFiles.length || !candFiles.length) throw new Error("Pass --base and --cand (comma-separated result files)");

const index = loadCardIndex();
const items = new Map(round4Items(index).map((it) => [it.id, it]));
const lists = loadLists(String(testById("tuning-v1").params.dataThrough));
const cache = new Map<RefList, Counts>();
const countsOf = (l: RefList) => cache.get(l) ?? cache.set(l, toCounts(index, l.main)).get(l)!;
const firstPlayed = new Map<string, string>();
for (const l of lists) for (const k of countsOf(l).keys()) if (!firstPlayed.has(k) || l.date < firstPlayed.get(k)!) firstPlayed.set(k, l.date);
const w = loadStandardWindows();
const ends = standardEnds(w);
const land = (k: string) => isLand(index, k);
const isBasic = (k: string) => /\bBasic\b/.test(index.getCard(k)?.typeLine ?? "");
const part = (m: Counts, keep: (k: string) => boolean) => new Map([...m].filter(([k]) => keep(k)));
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const legalOn = (k: string, date: string) => {
  const name = index.getCard(k)?.name ?? k;
  if (standardLegalOn(w, ends, name, date)) return true;
  const soon = new Date(Date.parse(date) + 30 * DAY).toISOString().slice(0, 10);
  const played = firstPlayed.get(k);
  return !!played && played <= date && standardLegalOn(w, ends, name, soon);
};

type Row = { id: string; deck: { main: Line[] } | null };
const read = (files: string[]) => files.map((f) => (JSON.parse(readFileSync(`evals/results/round4/${f}`, "utf8")).results as Row[]).filter((r) => r?.deck && testById("holdout-v1").items.includes(r.id) && (!only || only.includes(r.id))));
const [base, cand] = [read(baseFiles), read(candFiles)];
const ctx = new Map<string, { settled: Counts[]; earlier: Counts[]; date: string; standard: boolean }>();
for (const rows of [...base, ...cand])
  for (const r of rows)
    if (!ctx.has(r.id)) {
      const it = items.get(r.id)!;
      const date = it.before ?? it.target!.firstSeen;
      ctx.set(r.id, { settled: settledLists(index, lists, it.target!, 30, 90), earlier: earlierLists(lists, it.target!.format, date, countsOf), date, standard: it.format === "Standard" });
    }
const measures: [string, (id: string, d: Counts) => number | null][] = [
  ["Added", (id, d) => addedScore(d, ctx.get(id)!.settled, ctx.get(id)!.earlier).added],
  ["Match %", (id, d) => addedScore(d, ctx.get(id)!.settled, ctx.get(id)!.earlier).match],
  ["Lands shared with the settled lists", (id, d) => mean(ctx.get(id)!.settled.map((s) => overlap(part(d, land), part(s, land))))],
  ["Standard: copies not legal on the date", (id, d) => (ctx.get(id)!.standard ? [...d].filter(([k]) => !isBasic(k) && !legalOn(k, ctx.get(id)!.date)).reduce((n, [, q]) => n + q, 0) : null)],
];
const score = (runs: Row[][], f: (id: string, d: Counts) => number | null) =>
  runs.map((rows) => new Map(rows.flatMap((r) => {
    const v = f(r.id, toCounts(index, r.deck!.main));
    return v === null ? [] : [[r.id, v] as [string, number]];
  })));
const s = (x: number) => `${x >= 0 ? "+" : ""}${x.toFixed(1)}`;
console.log(`base: ${baseFiles.join(", ")} (${base.length} runs)\ncand: ${candFiles.join(", ")} (${cand.length} runs)`);
for (const [name, f] of measures) {
  const [b, c] = [score(base, f), score(cand, f)];
  const ids = new Set(c.flatMap((m) => [...m.keys()]));
  const bMean = mean(b.flatMap((m) => [...m].filter(([id]) => ids.has(id)).map(([, v]) => v)));
  const cMean = mean(c.flatMap((m) => [...m.values()]));
  const g = pairedGain(c, b);
  console.log(`${name.padEnd(40)} base ${bMean.toFixed(1)} | cand ${cMean.toFixed(1)} | gain ${s(g.gain)} (${s(g.lo)} to ${s(g.hi)}), ${g.n} decks`);
}
