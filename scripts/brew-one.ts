/**
 * Brew one deck for a prompt, with today's 90-day data (like round 4's fresh track). (2026-11-08)
 *
 *   pnpm exec tsx scripts/brew-one.ts --format Premodern --prompt "..." [--harness v13|v20|v23] [--model claude-opus-5-5]
 *
 * Prints the deck and the brewer's notes, saves evals/results/round4/one-<slug>-<harness>-<model>.json,
 * and records the run in evals/runs.jsonl.
 */
import Anthropic from "@anthropic-ai/sdk";
import { existsSync, writeFileSync } from "node:fs";
import { loadCardIndex } from "../src/cards/load";
import { FileDataSource } from "../src/data/source";
import { MODELS } from "../src/harness/models";
import { brewV13, brewV20, brewV23, type BrewResult } from "../src/harness/run";
import { dataFingerprint, recordRun } from "../evals/register";

try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local: rely on the environment.
}

const arg = (name: string, fallback?: string) => (process.argv.includes(`--${name}`) ? process.argv[process.argv.indexOf(`--${name}`) + 1] : fallback);
const prompt = arg("prompt");
const format = arg("format");
const harness = arg("harness", "v13")!;
const modelId = arg("model", "claude-opus-5-5")!;
const model = MODELS[modelId];
if (!prompt || !format) throw new Error('Pass --format and --prompt "..."');
if (!model) throw new Error(`Unknown model ${modelId}`);
if (!["v13", "v20", "v23"].includes(harness)) throw new Error("--harness v13, v20 or v23");

async function main() {
  const index = loadCardIndex();
  const data = await FileDataSource.load("data/reference-lists.jsonl", index);
  const slug = prompt!.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
  const out = `evals/results/round4/one-${slug}-${harness}-${modelId}.json`;
  if (existsSync(out)) throw new Error(`${out} exists; change the prompt or move the file.`);
  const run = { script: "brew-one", file: out, tests: [] as string[], harness, model: modelId, data: dataFingerprint() };
  const started = recordRun({ event: "started", ...run, items: 1 });
  const req = { prompt: prompt!, format };
  const brewer = harness === "v20" ? brewV20 : harness === "v23" ? brewV23 : brewV13;
  const r: BrewResult = await brewer(new Anthropic(), model, req, { index, data });
  writeFileSync(out, JSON.stringify({ ranAt: new Date().toISOString(), harness, model: modelId, prompt, format, complete: true, results: [{ id: slug, prompt, format, text: r.text, deck: r.deck, borrow: r.borrow, landSwap: r.landSwap, costUsd: r.costUsd, steps: r.steps, errors: r.error ? [r.error] : [] }] }, null, 1));
  recordRun({ event: "finished", ...run, items: 1, decks: r.deck ? 1 : 0, costUsd: Math.round(r.costUsd * 10000) / 10000, complete: true, commit: started.commit, dirty: started.dirty });
  const lines = (xs: { qty: number; name: string }[]) => xs.map((l) => `${l.qty} ${l.name}`).join("\n");
  const count = (xs: { qty: number }[]) => xs.reduce((n, l) => n + l.qty, 0);
  if (r.deck) {
    console.log(`=== Main deck (${count(r.deck.main)})\n${lines(r.deck.main)}\n\n=== Sideboard (${count(r.deck.side)})\n${lines(r.deck.side)}`);
    if (r.deck.winLine) console.log(`\n=== Win line (turn ${r.deck.winTurn ?? "?"}): ${r.deck.winLine.map((w) => `${w.card} (${w.does})`).join(" -> ")}`);
  } else console.log("No deck submitted.");
  console.log(`\n=== Brewer's notes\n${r.text}\n\n${r.steps} steps, $${r.costUsd.toFixed(3)}${r.error ? `, error: ${r.error}` : ""}\nsaved ${out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
