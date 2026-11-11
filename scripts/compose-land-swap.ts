/**
 * v23's dev runs, with no new API calls (2026-11-10; owner: "Yes, build it").
 *
 *   pnpm exec tsx scripts/compose-land-swap.ts [--dry]
 *
 * v23 = v22, then the land swap as the brewer's last step (src/harness/run.ts withUsualLands). The swap
 * is code and runs after the brew is finished, so a v23 run is a v22 run with that step applied to each
 * saved result, on the card pool and the lists the runner gave that deck (evals/round4/deps.ts). Writes
 * holdout-v23-claude-opus-5-5{,-r2,-r3}.json from v22's three dev runs, and records each in
 * evals/runs.jsonl as script "compose-land-swap", cost 0, with a note naming its source. Refuses to
 * overwrite. --dry prints what would change and writes nothing.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { getFormat } from "../src/cards/formats";
import { loadCardIndex } from "../src/cards/load";
import { FileDataSource } from "../src/data/source";
import { withUsualLands, type BrewResult } from "../src/harness/run";
import type { SubmittedDeck } from "../src/harness/tools";
import { dataFingerprint, readRegister, recordRun } from "../evals/register";
import { brewDeps } from "../evals/round4/deps";
import { round4Items } from "../evals/round4/items";
import { testById, testsCoveredBy } from "../evals/tests";

const DIR = "evals/results/round4";
const PAIRS: [string, string][] = [
  ["holdout-v22-claude-opus-5-5.json", "holdout-v23-claude-opus-5-5.json"],
  ["holdout-v22-claude-opus-5-5-r2.json", "holdout-v23-claude-opus-5-5-r2.json"],
  ["holdout-v22-claude-opus-5-5-r3.json", "holdout-v23-claude-opus-5-5-r3.json"],
];
const dry = process.argv.includes("--dry");

type Saved = { id: string; format: string; text: string; deck: Omit<SubmittedDeck, "format" | "donor"> | null; [field: string]: unknown };

async function main() {
  const index = loadCardIndex();
  const items = new Map(round4Items(index).map((it) => [it.id, it]));
  const history = await FileDataSource.load("data/reference-lists-all.jsonl", index);
  const today = await FileDataSource.load("data/reference-lists.jsonl", index);
  const depsOf = brewDeps(index, history, today);
  const dev = testById("holdout-v1").items;
  const register = readRegister();
  const data = dataFingerprint();
  for (const [from, out] of PAIRS) {
    if (!dry && existsSync(`${DIR}/${out}`)) throw new Error(`${out} exists`);
    const source = JSON.parse(readFileSync(`${DIR}/${from}`, "utf8")) as { model: string; results: (Saved | null)[] };
    // The swap reads the real lists again: they have to be the lists the brews read.
    const read = register.filter((r) => r.file === `${DIR}/${from}` && r.data).at(-1)?.data;
    if (!read || read.history !== data.history || read.recent !== data.recent) throw new Error(`${from} was brewed on other data (${JSON.stringify(read)}) than is here now (${JSON.stringify(data)})`);
    let changed = 0;
    const results = source.results.map((r) => {
      if (!r?.deck) return r;
      const key = getFormat(r.format)?.key;
      if (!key) throw new Error(`${r.id}: unknown format ${r.format}`);
      // The saved result as the brewer returned it; only the text and the deck matter to the step.
      const brewed = { text: r.text, deck: { ...r.deck, format: key, donor: null } } as BrewResult;
      const swapped = withUsualLands(brewed, depsOf(items.get(r.id)!));
      if (!swapped.landSwap) return r;
      changed++;
      const list = (xs: { name: string; copies: number }[]) => xs.map((x) => `${x.copies} ${x.name}`).join(", ");
      console.log(`  ${r.id.padEnd(40)} out: ${list(swapped.landSwap.cut)} | in: ${list(swapped.landSwap.added)}`);
      return { ...r, text: swapped.text, deck: { ...r.deck, main: swapped.deck!.main, warnings: swapped.deck!.warnings }, landSwap: swapped.landSwap };
    });
    const built = results.filter((r) => r?.deck).length;
    console.log(`${dry ? "would write" : "wrote"} ${out}: ${changed} of ${built} decks changed, from ${from}`);
    if (dry) continue;
    writeFileSync(`${DIR}/${out}`, JSON.stringify({ ranAt: new Date().toISOString(), harness: "v23", model: source.model, tracks: ["holdout"], complete: true, composedFrom: { runs: from, step: "land swap (src/harness/run.ts withUsualLands)" }, results }, null, 1));
    recordRun({
      event: "finished",
      script: "compose-land-swap",
      file: `${DIR}/${out}`,
      tests: testsCoveredBy(dev),
      harness: "v23",
      model: source.model,
      tracks: ["holdout"],
      items: dev.length,
      decks: built,
      costUsd: 0,
      complete: true,
      data,
      note: `composed, no API calls: v22's decks (${from}) with v23's last step, the land swap, applied in code (${changed} of ${built} decks changed)`,
    });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
