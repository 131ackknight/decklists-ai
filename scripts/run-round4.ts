/**
 * Run round 4 (owner-written evals) on one harness and model.
 *
 *   pnpm exec tsx scripts/run-round4.ts --harness v2|v3 --model claude-sonnet-5-5 [--track fill,brew,fresh|holdout] [--items id,id] [--concurrency 3] [--list]
 *
 * Fill in the blanks, brew to archetype and the brew holdout rebuild a past moment: lists from
 * the item's date on are cut from the data, and cards first printed after it
 * are hidden from the card pool, and so are earlier near-copies of the
 * owner's list (see NEAR_COPY). Fresh brews use today's 90-day data, like
 * rounds 1-3. Writes evals/results/round4/<harness>-<model>.json; score with
 * scripts/score-round4.ts. --list prints the items and spends nothing.
 */
import Anthropic from "@anthropic-ai/sdk";
import { mkdirSync, writeFileSync } from "node:fs";
import { loadCardIndex } from "../src/cards/load";
import { FileDataSource } from "../src/data/source";
import { MODELS } from "../src/harness/models";
import { brew, type BrewResult } from "../src/harness/run";
import { runPipeline, type PipelineResult } from "../src/pipeline/run";
import { isNearCopy, round4Items } from "../evals/round4/items";

try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local: rely on the environment.
}

const arg = (name: string, fallback?: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const harness = arg("harness", "v2")!;
const modelId = arg("model", "claude-sonnet-5-5")!;
const tracks = arg("track", "fill,brew,fresh")!.split(",");
const only = arg("items")?.split(",");
const concurrency = Number(arg("concurrency", "3"));
const model = MODELS[modelId];
if (!model) throw new Error(`Unknown model ${modelId}. Known: ${Object.keys(MODELS).join(", ")}`);

async function main() {
  const index = loadCardIndex();
  const items = round4Items(index).filter((it) => tracks.includes(it.track) && (!only || only.includes(it.id)));
  if (process.argv.includes("--list")) {
    for (const it of items) console.log(`${it.id}  [before ${it.before ?? "today"}]\n  ${it.prompt.split("\n")[0]}`);
    console.log(`${items.length} items`);
    return;
  }

  const history = await FileDataSource.load("data/reference-lists-all.jsonl", index);
  const today = await FileDataSource.load("data/reference-lists.jsonl", index);
  const client = new Anthropic();
  const results: unknown[] = new Array(items.length);
  let spent = 0;
  let next = 0;

  async function worker() {
    for (let i = next++; i < items.length; i = next++) {
      const it = items[i];
      const pool = it.before ? index.asOf(it.before, history.cardsPlayedThrough(it.before)) : index;
      const data = it.before ? history.cut(it.before, pool, (l) => isNearCopy(index, it, l.main)) : today;
      const req = { prompt: it.prompt, format: it.format };
      const r: BrewResult = harness === "v3" ? await runPipeline(client, model, req, { index: pool, data }) : await brew(client, model, req, { index: pool, data });
      const pipe = "path" in r ? (r as PipelineResult) : null;
      spent += r.costUsd;
      const sum = (xs: { qty: number }[]) => xs.reduce((n, c) => n + c.qty, 0);
      console.log(
        `${it.id}: ${pipe ? `[${pipe.path}] ` : ""}${r.deck ? `deck ${sum(r.deck.main)}+${sum(r.deck.side)}` : "no deck"}, ${r.steps} steps, $${r.costUsd.toFixed(3)}, ${Math.round(r.ms / 1000)}s${r.error ? `, error: ${r.error}` : ""}  [total $${spent.toFixed(2)}]`,
      );
      results[i] = {
        id: it.id,
        track: it.track,
        format: it.format,
        before: it.before,
        prompt: it.prompt,
        text: r.text,
        ...(pipe ? { intent: pipe.intent, path: pipe.path } : {}),
        deck: r.deck && { main: r.deck.main, side: r.deck.side, commander: r.deck.commander, label: r.deck.label, warnings: r.deck.warnings },
        toolCalls: r.toolCalls.map((c) => ({ name: c.name, ok: c.accepted, isError: c.isError, stage: c.stage, rejected: c.rejected })),
        usage: r.usage,
        costUsd: r.costUsd,
        steps: r.steps,
        ms: r.ms,
        errors: r.error ? [r.error] : [],
      };
    }
  }

  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));
  mkdirSync("evals/results/round4", { recursive: true });
  const out = `evals/results/round4/${tracks.join("+")}-${harness}-${modelId}${only ? "-partial" : ""}.json`.replace("fill+brew+fresh-", "");
  writeFileSync(out, JSON.stringify({ ranAt: new Date().toISOString(), harness, model: modelId, tracks, results }, null, 1));
  console.log(`wrote ${out}, total $${spent.toFixed(2)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
