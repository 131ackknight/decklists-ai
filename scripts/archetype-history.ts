/**
 * When did an archetype first appear, and which cards define it?
 *
 *   pnpm exec tsx scripts/archetype-history.ts <all-history.jsonl> <format>:<strategy> [...]
 *
 * First appearance: the earliest list labeled with the strategy, plus the
 * first date with 3+ lists in a 14-day window (its breakout). Signature
 * cards: nonland main deck cards in most of the archetype's lists and rare
 * in the rest of the format, scored by share in archetype minus share elsewhere.
 */
import { readFileSync } from "node:fs";
import { loadCardIndex } from "../src/cards/load";

interface RefList {
  format: string;
  date: string;
  strategy: string;
  main: { qty: number; name: string }[];
}

const [file, ...targets] = process.argv.slice(2);
const index = loadCardIndex();
const isLand = (n: string) => /\bLand\b/.test(index.getCard(n)?.typeLine.split(" // ")[0] ?? "");
const all = readFileSync(file, "utf8")
  .split("\n")
  .filter(Boolean)
  .map((l) => JSON.parse(l) as RefList);

const DAY = 86_400_000;
for (const t of targets) {
  const [format, strategy] = t.split(":");
  const inFormat = all.filter((l) => l.format === format);
  const mine = inFormat.filter((l) => l.strategy === strategy).sort((a, b) => (a.date < b.date ? -1 : 1));
  const rest = inFormat.filter((l) => l.strategy !== strategy);
  if (!mine.length) {
    console.log(`${t}: no lists`);
    continue;
  }
  const breakout = mine.find((l) => mine.filter((m) => m.date >= l.date && Date.parse(m.date) - Date.parse(l.date) < 14 * DAY).length >= 3);
  const share = (ls: RefList[]) => {
    const m = new Map<string, number>();
    for (const l of ls) for (const n of new Set(l.main.filter((c) => !isLand(c.name)).map((c) => c.name))) m.set(n, (m.get(n) ?? 0) + 1);
    return new Map([...m].map(([n, k]) => [n, k / ls.length]));
  };
  const inA = share(mine);
  const outA = share(rest);
  const signature = [...inA]
    .map(([n, s]) => ({ card: n, inArchetype: Math.round(s * 100), elsewhere: Math.round((outA.get(n) ?? 0) * 100), score: s - (outA.get(n) ?? 0) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);
  const formatStart = inFormat.reduce((d, l) => (l.date < d ? l.date : d), "9999");
  console.log(`\n${t}: ${mine.length} lists, first ${mine[0].date}, breakout ${breakout?.date ?? "none"}, format data from ${formatStart}`);
  console.table(signature.map(({ score, ...r }) => r));
}
