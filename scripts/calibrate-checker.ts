/**
 * Run every real decklist from Decklist Data's export through the deck
 * checker and report pass rates, grouped by failure reason and strategy.
 * A real tournament list that fails is a checker bug until shown otherwise.
 *
 *   pnpm exec tsx scripts/calibrate-checker.ts data/reference-lists.jsonl [--legality-days 30]
 *
 * Legality is checked only for lists newer than --legality-days (default
 * 30), since older lists may predate a ban.
 */
import { createReadStream, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { loadCardIndex } from "../src/cards/load";
import { checkDeck, type QtyName } from "../src/checker/check";
import { fromMtgoList } from "../src/checker/mtgo";

interface RefList {
  format: string;
  date: string;
  event: string;
  strategy: string;
  main: QtyName[];
  side: QtyName[];
  commander: QtyName[];
}

const file = process.argv[2] ?? "data/reference-lists.jsonl";
const ldIdx = process.argv.indexOf("--legality-days");
const legalityDays = ldIdx > 0 ? Number(process.argv[ldIdx + 1]) : 30;
const legalitySince = new Date(Date.now() - legalityDays * 86_400_000).toISOString().slice(0, 10);

interface Bucket {
  total: number;
  errors: number;
  warnings: number;
  byCode: Map<string, { count: number; strategies: Map<string, number>; examples: string[] }>;
}

async function main() {
  const index = loadCardIndex();
  const formats = new Map<string, Bucket>();
  const lines = createInterface({ input: createReadStream(file) });

  for await (const line of lines) {
    if (!line.trim()) continue;
    const list = JSON.parse(line) as RefList;
    const deck = fromMtgoList(index, {
      format: list.format,
      main: list.main,
      side: list.side,
      commander: list.commander,
    });
    const result = checkDeck(index, deck, { skipLegality: list.date < legalitySince });
    const b =
      formats.get(list.format) ??
      ({ total: 0, errors: 0, warnings: 0, byCode: new Map() } satisfies Bucket);
    formats.set(list.format, b);
    b.total++;
    if (!result.ok) b.errors++;
    if (result.warnings.length > 0) b.warnings++;
    for (const issue of [...result.errors, ...result.warnings]) {
      const row = b.byCode.get(issue.code) ?? { count: 0, strategies: new Map(), examples: [] };
      b.byCode.set(issue.code, row);
      row.count++;
      row.strategies.set(list.strategy, (row.strategies.get(list.strategy) ?? 0) + 1);
      if (row.examples.length < 4) row.examples.push(`${list.strategy} (${list.date}): ${issue.message}`);
    }
  }

  const summary: Record<string, unknown> = {};
  for (const [format, b] of [...formats].sort()) {
    const pass = (n: number) => `${(((b.total - n) / b.total) * 100).toFixed(1)}%`;
    console.log(`\n${format}: ${b.total} lists. No errors: ${pass(b.errors)}. No warnings: ${pass(b.warnings)}.`);
    const codes = [...b.byCode].sort((x, y) => y[1].count - x[1].count);
    for (const [code, row] of codes) {
      const top = [...row.strategies].sort((x, y) => y[1] - x[1]).slice(0, 4);
      console.log(`  ${code}: ${row.count}  top: ${top.map(([s, n]) => `${s} ${n}`).join(", ")}`);
      for (const ex of row.examples.slice(0, 2)) console.log(`    e.g. ${ex}`);
    }
    summary[format] = {
      total: b.total,
      errorFree: b.total - b.errors,
      warningFree: b.total - b.warnings,
      byCode: Object.fromEntries(codes.map(([c, r]) => [c, { count: r.count, examples: r.examples }])),
    };
  }
  writeFileSync("evals/results/checker-calibration.json", JSON.stringify(summary, null, 1));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
