/**
 * Scorer v0, part 1: does card choice predict results within an archetype?
 *
 *   pnpm exec tsx scripts/scorer-card-performance.ts [data/reference-lists.jsonl]
 *
 * Train on Challenge lists from days 31-90 before the newest event: for each
 * (format, strategy, main deck card), compare match win rate of lists with
 * and without it, shrunk toward zero for small samples. Test on the last 30
 * days: within each archetype, does the sum of card effects rank lists by
 * their actual win rate? Compared against a "stockness" baseline (overlap
 * with the archetype's core). Leagues are excluded: only 5-0 League lists
 * are published, so they carry no result variance.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { loadCardIndex } from "../src/cards/load";
import { normalizeName } from "../src/cards/names";

interface Line {
  qty: number;
  name: string;
}
interface RefList {
  format: string;
  date: string;
  eventType: string;
  record: string | null;
  strategy: string;
  main: Line[];
}

const file = process.argv[2] ?? "data/reference-lists.jsonl";
const index = loadCardIndex();
const canon = (n: string) => normalizeName(index.getCard(n)?.name ?? n);
const isLand = (n: string) => /\bLand\b/.test(index.getCard(n)?.typeLine.split(" // ")[0] ?? "");

const all = readFileSync(file, "utf8")
  .split("\n")
  .filter(Boolean)
  .map((l) => JSON.parse(l) as RefList);
const newest = all.reduce((d, l) => (l.date > d ? l.date : d), "");
const day = (n: number) => new Date(Date.parse(newest) - n * 86_400_000).toISOString().slice(0, 10);

interface Row {
  format: string;
  strategy: string;
  date: string;
  winRate: number;
  matches: number;
  cards: Set<string>;
}
const rows: Row[] = all.flatMap((l) => {
  if (!/challenge|qualifier/i.test(l.eventType)) return [];
  const m = l.record?.match(/^(\d+)-(\d+)/);
  if (!m) return [];
  const w = Number(m[1]);
  const lo = Number(m[2]);
  if (w + lo < 3) return [];
  return [{ format: l.format, strategy: l.strategy, date: l.date, winRate: w / (w + lo), matches: w + lo, cards: new Set(l.main.filter((c) => !isLand(c.name)).map((c) => canon(c.name))) }];
});
const train = rows.filter((r) => r.date <= day(30) && r.date > day(90));
const test = rows.filter((r) => r.date > day(30));

const MIN_SIDE = 8; // lists with and without the card
const SHRINK = 20; // pseudo-lists pulling small samples toward zero

/** effect[format|strategy][card] = shrunk win-rate difference (with - without). */
const effects = new Map<string, Map<string, number>>();
const core = new Map<string, Set<string>>();
const groups = new Map<string, Row[]>();
for (const r of train) {
  const k = `${r.format}|${r.strategy}`;
  groups.set(k, [...(groups.get(k) ?? []), r]);
}
for (const [k, rs] of groups) {
  if (rs.length < 2 * MIN_SIDE) continue;
  const counts = new Map<string, number>();
  for (const r of rs) for (const c of r.cards) counts.set(c, (counts.get(c) ?? 0) + 1);
  core.set(k, new Set([...counts].filter(([, n]) => n / rs.length >= 0.5).map(([c]) => c)));
  const eff = new Map<string, number>();
  for (const [card, n] of counts) {
    if (n < MIN_SIDE || rs.length - n < MIN_SIDE) continue;
    const mean = (xs: Row[]) => xs.reduce((a, r) => a + r.winRate, 0) / xs.length;
    const withC = rs.filter((r) => r.cards.has(card));
    const without = rs.filter((r) => !r.cards.has(card));
    const nEff = 1 / (1 / withC.length + 1 / without.length);
    eff.set(card, (mean(withC) - mean(without)) * (nEff / (nEff + SHRINK)));
  }
  effects.set(k, eff);
}

/** Spearman correlation. */
function spearman(xs: number[], ys: number[]): number {
  const rank = (v: number[]) => {
    const order = v.map((x, i) => [x, i] as const).sort((a, b) => a[0] - b[0]);
    const r = Array(v.length).fill(0);
    for (let i = 0; i < order.length; ) {
      let j = i;
      while (j + 1 < order.length && order[j + 1][0] === order[i][0]) j++;
      for (let t = i; t <= j; t++) r[order[t][1]] = (i + j) / 2;
      i = j + 1;
    }
    return r;
  };
  const rx = rank(xs);
  const ry = rank(ys);
  const mx = rx.reduce((a, b) => a + b, 0) / rx.length;
  const my = ry.reduce((a, b) => a + b, 0) / ry.length;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < rx.length; i++) {
    num += (rx[i] - mx) * (ry[i] - my);
    dx += (rx[i] - mx) ** 2;
    dy += (ry[i] - my) ** 2;
  }
  return dx && dy ? num / Math.sqrt(dx * dy) : 0;
}

const testGroups = new Map<string, Row[]>();
for (const r of test) {
  const k = `${r.format}|${r.strategy}`;
  if (effects.has(k)) testGroups.set(k, [...(testGroups.get(k) ?? []), r]);
}
const perArchetype: { archetype: string; lists: number; scoreRho: number; stockRho: number }[] = [];
for (const [k, rs] of testGroups) {
  if (rs.length < 10) continue;
  const eff = effects.get(k)!;
  const coreSet = core.get(k)!;
  const score = rs.map((r) => [...r.cards].reduce((a, c) => a + (eff.get(c) ?? 0), 0));
  const stock = rs.map((r) => [...coreSet].filter((c) => r.cards.has(c)).length / Math.max(1, coreSet.size));
  const wins = rs.map((r) => r.winRate);
  perArchetype.push({ archetype: k, lists: rs.length, scoreRho: spearman(score, wins), stockRho: spearman(stock, wins) });
}

const weighted = (key: "scoreRho" | "stockRho") =>
  perArchetype.reduce((a, r) => a + r[key] * r.lists, 0) / Math.max(1, perArchetype.reduce((a, r) => a + r.lists, 0));
const positive = (key: "scoreRho" | "stockRho") => perArchetype.filter((r) => r[key] > 0).length;

console.log(`train ${train.length} Challenge lists (days 31-90), test ${test.length} (last 30 days), ${perArchetype.length} archetypes with 10+ test lists`);
console.log(`card-effect score vs. actual win rate: weighted Spearman ${weighted("scoreRho").toFixed(3)}, positive in ${positive("scoreRho")} of ${perArchetype.length} archetypes`);
console.log(`stockness baseline vs. actual win rate: weighted Spearman ${weighted("stockRho").toFixed(3)}, positive in ${positive("stockRho")} of ${perArchetype.length} archetypes`);
const top = [...effects].flatMap(([k, e]) => [...e].map(([card, v]) => ({ archetype: k, card, effectPts: Math.round(v * 1000) / 10 })));
top.sort((a, b) => Math.abs(b.effectPts) - Math.abs(a.effectPts));
console.log("largest card effects in training (win-rate points):");
console.table(top.slice(0, 12));
writeFileSync("evals/results/scorer-card-performance.json", JSON.stringify({ perArchetype, top: top.slice(0, 200) }, null, 1));
