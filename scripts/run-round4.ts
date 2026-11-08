/**
 * Run round 4 (owner-written evals) on one harness and model.
 *
 *   pnpm exec tsx scripts/run-round4.ts --harness v2|...|v20 [--tag r2] --model claude-sonnet-5-5 [--track fill,brew,fresh|holdout] [--items id,id] [--concurrency 3] [--list] [--resume]
 *
 * Fill in the blanks, brew to archetype and the brew holdout rebuild a past moment: lists from
 * the item's date on are cut from the data, and cards first printed after it
 * are hidden from the card pool, and so are earlier near-copies of the
 * owner's list (see NEAR_COPY). Fresh brews use today's 90-day data, like
 * rounds 1-3. Writes evals/results/round4/<harness>-<model>.json; score with
 * scripts/score-round4.ts. --list prints the items and spends nothing.
 *
 * The results file is rewritten after every item ("complete": false until the
 * last one), so a crash keeps everything finished so far; --resume skips the
 * items already in it. Each run is recorded in evals/runs.jsonl (evals/register.ts).
 */
import Anthropic from "@anthropic-ai/sdk";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { loadCardIndex } from "../src/cards/load";
import { FileDataSource } from "../src/data/source";
import { MODELS } from "../src/harness/models";
import { brew, brewV4, brewV5, brewV6, brewV7, brewV8, brewV9, brewV10, brewV11, brewV12, brewV13, brewV14, brewV15, brewV16, brewV17, brewV18, brewV19, brewV20, type BrewResult } from "../src/harness/run";
import { runPipeline, type PipelineResult } from "../src/pipeline/run";
import { dataFingerprint, recordRun } from "../evals/register";
import { isNearCopy, round4Items } from "../evals/round4/items";
import { testsCoveredBy } from "../evals/tests";

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
// A tag keeps a repeat run from overwriting the first, e.g. --tag r2.
const tag = arg("tag");
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
  const results: ({ id: string; costUsd: number; deck: unknown; [field: string]: unknown } | undefined)[] = new Array(items.length);
  let spent = 0;
  let next = 0;

  mkdirSync("evals/results/round4", { recursive: true });
  const out = `evals/results/round4/${tracks.join("+")}-${harness}-${modelId}${tag ? `-${tag}` : ""}${only ? "-partial" : ""}.json`.replace("fill+brew+fresh-", "");
  const resume = process.argv.includes("--resume");
  if (existsSync(out) && !resume) throw new Error(`${out} exists. Pass --resume to finish it, or a new --tag.`);
  if (resume && existsSync(out)) {
    const done = new Map((JSON.parse(readFileSync(out, "utf8")).results as { id: string; costUsd: number; deck: unknown }[]).filter(Boolean).map((r) => [r.id, r]));
    items.forEach((it, i) => {
      const r = done.get(it.id);
      if (r) {
        results[i] = r;
        spent += r.costUsd;
      }
    });
    console.log(`resuming ${out}: ${done.size} of ${items.length} done, $${spent.toFixed(2)} spent`);
  }
  const save = (complete: boolean) =>
    writeFileSync(out, JSON.stringify({ ranAt: new Date().toISOString(), harness, model: modelId, tracks, complete, results: complete ? results : results.filter(Boolean) }, null, 1));
  const run = { script: "run-round4", file: out, tests: testsCoveredBy(items.map((it) => it.id)), harness, model: modelId, tracks, tag, data: dataFingerprint() };
  const started = recordRun({ event: "started", ...run, items: items.length });

  async function worker() {
    for (let i = next++; i < items.length; i = next++) {
      if (results[i]) continue;
      const it = items[i];
      const pool = it.before ? index.asOf(it.before, history.cardsPlayedThrough(it.before)) : index;
      const data = it.before ? history.cut(it.before, pool, (l) => isNearCopy(index, it, l.main)) : today;
      const req = { prompt: it.prompt, format: it.format };
      const deps = { index: pool, data };
      const r: BrewResult =
        harness === "v3"
          ? await runPipeline(client, model, req, deps)
          : harness === "v4"
            ? await brewV4(client, model, req, deps)
            : harness === "v5"
              ? await brewV5(client, model, req, deps)
              : harness === "v6"
                ? await brewV6(client, model, req, deps)
                : harness === "v7"
                  ? await brewV7(client, model, req, deps, undefined, it.before ?? undefined)
                  : harness === "v8"
                    ? await brewV8(client, model, req, deps)
                    : harness === "v9"
                      ? await brewV9(client, model, req, deps)
                      : harness === "v10"
                        ? await brewV10(client, model, req, deps)
                        : harness === "v11"
                          ? await brewV11(client, model, req, deps)
                          : harness === "v12"
                            ? await brewV12(client, model, req, deps)
                            : harness === "v13"
                              ? await brewV13(client, model, req, deps)
                              : harness === "v14"
                                ? await brewV14(client, model, req, deps)
                                : harness === "v15"
                                  ? await brewV15(client, model, req, deps)
                                  : harness === "v16"
                                    ? await brewV16(client, model, req, deps)
                                    : harness === "v17"
                                      ? await brewV17(client, model, req, deps)
                                      : harness === "v18"
                                        ? await brewV18(client, model, req, deps)
                                        : harness === "v19"
                                          ? await brewV19(client, model, req, deps)
                                          : harness === "v20"
                                            ? await brewV20(client, model, req, deps)
                                            : await brew(client, model, req, deps);
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
        deck: r.deck && {
          main: r.deck.main,
          side: r.deck.side,
          commander: r.deck.commander,
          label: r.deck.label,
          warnings: r.deck.warnings,
          ...(r.deck.plan ? { plan: r.deck.plan, coach: r.deck.coach } : {}),
          ...(r.deck.winLine ? { winLine: r.deck.winLine, winTurn: r.deck.winTurn, winLineDrawnPct: r.deck.winLineDrawnPct } : {}),
          ...(r.deck.partnerHints?.length ? { partnerHints: r.deck.partnerHints } : {}),
        },
        ...(r.review ? { review: { flags: r.review.flags, firstMain: r.review.firstDeck?.main, ...(r.review.roles ? { roles: r.review.roles } : {}) } } : {}),
        ...(r.playtest ? { playtest: { opponent: r.playtest.opponent, seed: r.playtest.seed, game: r.playtest.game, problems: r.playtest.problems, firstMain: r.playtest.firstDeck?.main } } : {}),
        ...(r.borrow ? { borrow: r.borrow } : {}),
        toolCalls: r.toolCalls.map((c) => ({ name: c.name, ok: c.accepted, isError: c.isError, stage: c.stage, rejected: c.rejected })),
        usage: r.usage,
        costUsd: r.costUsd,
        steps: r.steps,
        ms: r.ms,
        errors: r.error ? [r.error] : [],
      };
      save(false);
    }
  }

  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));
  save(true);
  const written = results.filter(Boolean);
  recordRun({
    event: "finished",
    ...run,
    items: written.length,
    decks: written.filter((r) => r!.deck).length,
    costUsd: Math.round(spent * 10000) / 10000,
    complete: written.length === items.length,
    commit: started.commit,
    dirty: started.dirty,
  });
  console.log(`wrote ${out}, total $${spent.toFixed(2)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
