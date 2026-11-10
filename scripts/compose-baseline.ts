/**
 * v22's full dev baseline, with no new API calls (2026-11-10; owner: "Yes, make it base").
 *
 *   pnpm exec tsx scripts/compose-baseline.ts
 *
 * v22 = v13 with Standard legality on the deck's date; on decks in other formats it runs exactly as v13
 * (same code, same card pool: only `legal.standard` changes, and their checks read their own format). So
 * each v22 dev run is v22's own run on the 10 Standard dev decks plus v13's run of the same number on the 11
 * others: holdout-v22-claude-opus-5-5{,-r2,-r3}.json. Each is recorded in evals/runs.jsonl as
 * script "compose-baseline", cost 0, with a note naming its sources. Refuses to overwrite.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { loadCardIndex } from "../src/cards/load";
import { recordRun, readRegister } from "../evals/register";
import { round4Items } from "../evals/round4/items";
import { testById, testsCoveredBy } from "../evals/tests";

const DIR = "evals/results/round4";
const PAIRS: [string, string, string][] = [
  ["holdout-v22-claude-opus-5-5-partial.json", "holdout-v13-claude-opus-5-5.json", "holdout-v22-claude-opus-5-5.json"],
  ["holdout-v22-claude-opus-5-5-r2-partial.json", "holdout-v13-claude-opus-5-5-r2.json", "holdout-v22-claude-opus-5-5-r2.json"],
  ["holdout-v22-claude-opus-5-5-r3-partial.json", "holdout-v13-claude-opus-5-5-r3.json", "holdout-v22-claude-opus-5-5-r3.json"],
];

function main() {
  const index = loadCardIndex();
  const format = new Map(round4Items(index).map((it) => [it.id, it.format]));
  const dev = testById("holdout-v1").items;
  const standard = new Set(dev.filter((id) => format.get(id) === "Standard"));
  const register = readRegister();
  for (const [own, v13, out] of PAIRS) {
    if (existsSync(`${DIR}/${out}`)) throw new Error(`${out} exists`);
    const a = JSON.parse(readFileSync(`${DIR}/${own}`, "utf8"));
    const b = JSON.parse(readFileSync(`${DIR}/${v13}`, "utf8"));
    const fromOwn = (a.results as { id: string }[]).filter((r) => r && standard.has(r.id));
    const fromV13 = (b.results as { id: string }[]).filter((r) => r && dev.includes(r.id) && !standard.has(r.id));
    if (fromOwn.length !== standard.size || fromOwn.length + fromV13.length !== dev.length) throw new Error(`${out}: ${fromOwn.length} + ${fromV13.length} decks, expected ${standard.size} + ${dev.length - standard.size}`);
    const results = dev.map((id) => [...fromOwn, ...fromV13].find((r) => r.id === id));
    writeFileSync(`${DIR}/${out}`, JSON.stringify({ ranAt: new Date().toISOString(), harness: "v22", model: "claude-opus-5-5", tracks: ["holdout"], complete: true, composedFrom: { standardDecks: own, otherDecks: v13 }, results }, null, 1));
    const data = register.filter((r) => r.file === `${DIR}/${own}` && r.data).at(-1)?.data;
    recordRun({
      event: "finished",
      script: "compose-baseline",
      file: `${DIR}/${out}`,
      tests: testsCoveredBy(dev),
      harness: "v22",
      model: "claude-opus-5-5",
      tracks: ["holdout"],
      items: dev.length,
      decks: results.filter((r) => r && (r as { deck?: unknown }).deck).length,
      costUsd: 0,
      complete: true,
      data,
      note: `composed, no API calls: v22's own decks on the ${standard.size} Standard dev decks (${own}) and v13's on the other ${dev.length - standard.size} (${v13}), where v22 runs exactly as v13`,
    });
    console.log(`wrote ${out}: ${fromOwn.length} Standard decks from ${own}, ${fromV13.length} others from ${v13}`);
  }
}

main();
