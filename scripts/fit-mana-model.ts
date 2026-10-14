/**
 * Refit the land-count model and the warning thresholds on real decklists.
 *
 *   pnpm exec tsx scripts/fit-mana-model.ts data/reference-lists.jsonl
 *
 * Per format: least-squares fit of lands ~ average mana value + cheap
 * draw/ramp count, plus the band that holds 95% of real decks, and how far
 * short of the on-curve colored-source table 95% of real decks run.
 * Writes src/checker/mana-model.json. Only aggregate numbers are written.
 */
import { createReadStream, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { loadCardIndex } from "../src/cards/load";
import type { QtyName } from "../src/checker/check";
import { analyzeMana, type Entry } from "../src/checker/mana";
import { fromMtgoList } from "../src/checker/mtgo";

const file = process.argv[2] ?? "data/reference-lists.jsonl";

interface Row {
  lands: number;
  mv: number;
  accel: number;
  shortfall: number;
}

function percentile(sorted: number[], p: number): number {
  const i = Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))));
  return sorted[i];
}

/** Ordinary least squares for y ~ b0 + b1·x1 + b2·x2 via the normal equations. */
function fit(rows: Row[]): [number, number, number] {
  const X = rows.map((r) => [1, r.mv, r.accel]);
  const y = rows.map((r) => r.lands);
  const A = [0, 1, 2].map((i) => [0, 1, 2].map((j) => X.reduce((s, x) => s + x[i] * x[j], 0)));
  const b = [0, 1, 2].map((i) => X.reduce((s, x, k) => s + x[i] * y[k], 0));
  // Gaussian elimination on the 3x3 system.
  for (let c = 0; c < 3; c++) {
    let p = c;
    for (let r = c + 1; r < 3; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]];
    [b[c], b[p]] = [b[p], b[c]];
    for (let r = 0; r < 3; r++) {
      if (r === c) continue;
      const f = A[r][c] / A[c][c];
      for (let k = c; k < 3; k++) A[r][k] -= f * A[c][k];
      b[r] -= f * b[c];
    }
  }
  return [b[0] / A[0][0], b[1] / A[1][1], b[2] / A[2][2]];
}

async function main() {
  const index = loadCardIndex();
  const rows = new Map<string, Row[]>();
  const lines = createInterface({ input: createReadStream(file) });
  for await (const line of lines) {
    if (!line.trim()) continue;
    const list = JSON.parse(line) as { format: string; main: QtyName[]; side: QtyName[]; commander: QtyName[] };
    const deck = fromMtgoList(index, { format: list.format, main: list.main, side: list.side, commander: list.commander });
    const main: Entry[] = [];
    let unknown = false;
    for (const l of deck.main) {
      const card = index.getCard(l.name);
      if (!card) unknown = true;
      else main.push({ qty: l.qty, card });
    }
    if (unknown || main.length === 0) continue;
    const m = analyzeMana(index, main);
    const shortfall = Math.max(0, ...m.colors.map((c) => c.need - c.have));
    const list60 = rows.get(list.format) ?? [];
    list60.push({ lands: m.lands, mv: m.averageManaValue, accel: m.cheapAccel, shortfall });
    rows.set(list.format, list60);
  }

  const out: Record<string, unknown> = {};
  for (const [format, r] of [...rows].sort()) {
    const [intercept, mv, accel] = fit(r);
    const residuals = r.map((x) => x.lands - (intercept + mv * x.mv + accel * x.accel)).sort((a, b) => a - b);
    const shortfalls = r.map((x) => x.shortfall).sort((a, b) => a - b);
    const model = {
      lists: r.length,
      intercept: +intercept.toFixed(2),
      mv: +mv.toFixed(2),
      accel: +accel.toFixed(2),
      landLow: +percentile(residuals, 0.025).toFixed(1),
      landHigh: +percentile(residuals, 0.975).toFixed(1),
      sourceSlack: +percentile(shortfalls, 0.95).toFixed(1),
    };
    out[format] = model;
    console.log(
      `${format.padEnd(10)} n=${String(r.length).padStart(5)}  lands = ${model.intercept} + ${model.mv}×MV ${model.accel >= 0 ? "+" : "-"} ${Math.abs(model.accel)}×accel  band [${model.landLow}, +${model.landHigh}]  source slack ${model.sourceSlack}`,
    );
  }
  writeFileSync("src/checker/mana-model.json", JSON.stringify(out, null, 1) + "\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
