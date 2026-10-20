/**
 * Score forward-test brews once their decks have settled.
 *
 *   pnpm exec tsx scripts/forward-score.ts
 *
 * A brew is scored when its archetype is at least 90 days old in the data.
 * It counts only if the archetype drew 15+ lists in its first 90 days (the
 * rule fixed in scripts/forward-week.ts before any brew was made); the rest
 * are listed as "didn't catch on" and ignored, since there is no settled deck
 * to compare with. Score: mean main deck overlap with the archetype's lists
 * from days 30-90, against the closest list that existed the day before it
 * appeared (the hindsight oracle, as in the holdout). Writes
 * evals/forward/scores.json.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadCardIndex } from "../src/cards/load";
import { normalizeName } from "../src/cards/names";

interface Line {
  qty: number;
  name: string;
}
interface RefList {
  format: string;
  date: string;
  strategy: string;
  main: Line[];
}
interface Brew {
  id: string;
  format: string;
  strategy: string;
  firstSeen: string;
  harness: string;
  model: string;
  brewedAt: string;
  deck: { main: Line[] } | null;
}

const DAY = 86_400_000;
const WIDGET_ROW = /^Cards?\s*\(\d+%?\)\s*$/i;
const index = loadCardIndex();
const canon = (n: string) => normalizeName(index.getCard(n)?.name ?? n);
const counts = (lines: Line[]) => {
  const m = new Map<string, number>();
  for (const l of lines) if (!WIDGET_ROW.test(l.name)) m.set(canon(l.name), (m.get(canon(l.name)) ?? 0) + l.qty);
  return m;
};
const overlap = (a: Map<string, number>, b: Map<string, number>) => [...a].reduce((n, [k, q]) => n + Math.min(q, b.get(k) ?? 0), 0);

const hist = readFileSync("data/reference-lists-all.jsonl", "utf8")
  .split("\n")
  .filter(Boolean)
  .map((l) => JSON.parse(l) as RefList)
  .map((l) => ({ ...l, c: counts(l.main) }));
const newest = hist.reduce((d, l) => (l.date > d ? l.date : d), "");

const root = "evals/forward/brews";
const brews: Brew[] = readdirSync(root).flatMap((day) =>
  readdirSync(path.join(root, day))
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(path.join(root, day, f), "utf8")) as Brew),
);

const rows: Record<string, unknown>[] = [];
const pending: string[] = [];
const fizzled: string[] = [];
for (const b of brews) {
  const first = Date.parse(b.firstSeen);
  if (Date.parse(newest) - first < 90 * DAY) {
    pending.push(`${b.id} ${b.harness} (settles ${new Date(first + 90 * DAY).toISOString().slice(0, 10)})`);
    continue;
  }
  const mine = hist.filter((l) => l.format === b.format && l.strategy === b.strategy);
  const in90 = mine.filter((l) => Date.parse(l.date) < first + 90 * DAY);
  if (in90.length < 15) {
    fizzled.push(`${b.id} ${b.harness} (${in90.length} lists in 90 days)`);
    continue;
  }
  const settled = mine.filter((l) => Date.parse(l.date) >= first + 30 * DAY && Date.parse(l.date) < first + 90 * DAY);
  const mean = (m: Map<string, number>) => settled.reduce((a, l) => a + overlap(m, l.c), 0) / settled.length / 60;
  const prior = hist.filter((l) => l.format === b.format && l.date < b.firstSeen);
  const oracle = prior.reduce((best, l) => Math.max(best, mean(l.c)), 0);
  rows.push({
    id: b.id,
    harness: b.harness,
    model: b.model,
    brewedAt: b.brewedAt.slice(0, 10),
    settledLists: settled.length,
    oracle: Math.round(oracle * 100),
    brew: b.deck ? Math.round(mean(counts(b.deck.main)) * 100) : null,
  });
}
console.log(`data through ${newest}`);
if (rows.length) console.table(rows);
if (fizzled.length) console.log(`didn't catch on (not scored): ${fizzled.join("; ")}`);
if (pending.length) console.log(`not settled yet: ${pending.join("; ")}`);
writeFileSync("evals/forward/scores.json", JSON.stringify({ dataThrough: newest, scored: rows, fizzled, pending }, null, 1) + "\n");
