/**
 * Run the decklists.ai harness on the rubric prompts.
 *
 *   pnpm exec tsx scripts/run-harness-eval.ts --model claude-haiku-5-5 --pass 1 [--harness v2|v3] [--prompts id,id] [--concurrency 3]
 *
 * v2 is the single-loop harness; v3 is the step 8 pipeline (intent, paths,
 * staged brews). Writes evals/results/harness-<v>/<model>-p<pass>.json in the same shape as
 * the v1 runs, so scripts/score-v1-runs.ts and the blind scorecard read both.
 * Prints the running cost after each prompt.
 */
import Anthropic from "@anthropic-ai/sdk";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { loadCardIndex } from "../src/cards/load";
import { FileDataSource } from "../src/data/source";
import { MODELS } from "../src/harness/models";
import { brew } from "../src/harness/run";
import { runPipeline, type PipelineResult } from "../src/pipeline/run";
import { RUBRIC_PROMPTS } from "../evals/rubric/prompts";

try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local: rely on the environment (CI sets ANTHROPIC_API_KEY).
}

const arg = (name: string, fallback?: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};

const modelId = arg("model", "claude-haiku-5-5")!;
const pass = arg("pass", "1")!;
const only = arg("prompts")?.split(",");
const concurrency = Number(arg("concurrency", "3"));
const harness = arg("harness", "v2")!;
const model = MODELS[modelId];
if (!model) throw new Error(`Unknown model ${modelId}. Known: ${Object.keys(MODELS).join(", ")}`);

/** Prompt text as sent to v1, with the pasted lists filled in. */
const sentText = new Map(
  (JSON.parse(readFileSync("evals/rubric/v1-prompts.json", "utf8")) as { id: string; prompt: string }[]).map((p) => [p.id, p.prompt]),
);

async function main() {
  const index = loadCardIndex();
  const data = await FileDataSource.load("data/reference-lists.jsonl", index);
  const client = new Anthropic();
  const prompts = RUBRIC_PROMPTS.filter((p) => !only || only.includes(p.id));
  const results: unknown[] = new Array(prompts.length);
  let spent = 0;
  let next = 0;

  async function worker() {
    for (let i = next++; i < prompts.length; i = next++) {
      const p = prompts[i];
      const format = p.format === "Any" ? null : p.format;
      const req = { prompt: sentText.get(p.id) ?? p.prompt, format };
      const r = harness === "v3" ? await runPipeline(client, model, req, { index, data }) : await brew(client, model, req, { index, data });
      const pipe = "path" in r ? (r as PipelineResult) : null;
      spent += r.costUsd;
      const sum = (xs: { qty: number }[]) => xs.reduce((n, c) => n + c.qty, 0);
      console.log(
        `${p.id}: ${pipe ? `[${pipe.path}] ` : ""}${r.deck ? `deck (${r.deck.label}, ${sum(r.deck.main)}+${sum(r.deck.side)})` : "no deck"}, ${r.toolCalls.length} tool calls, ${r.steps} steps, $${r.costUsd.toFixed(3)}, ${Math.round(r.ms / 1000)}s${r.error ? `, error: ${r.error}` : ""}  [total $${spent.toFixed(2)}]`,
      );
      results[i] = {
        id: p.id,
        format: p.format,
        sentFormat: format ?? "Any",
        prompt: sentText.get(p.id) ?? p.prompt,
        text: r.text,
        toolCalls: r.toolCalls.map((c) => ({ name: c.name, ok: c.accepted, isError: c.isError, stage: c.stage, rejected: c.rejected })),
        ...(pipe ? { intent: pipe.intent, path: pipe.path, facts: pipe.facts, engine: pipe.engine } : {}),
        deck: r.deck && {
          main: r.deck.main,
          side: r.deck.side,
          commander: r.deck.commander,
          format: r.deck.format,
          strategy: r.deck.donor ?? undefined,
          badge: r.deck.label,
          warnings: r.deck.warnings,
        },
        usage: {
          promptTokens: r.usage.input + r.usage.cacheRead + r.usage.cacheWrite,
          completionTokens: r.usage.output,
          ...r.usage,
        },
        costUsd: r.costUsd,
        steps: r.steps,
        stopReason: r.stopReason,
        ms: r.ms,
        errors: r.error ? [r.error] : [],
      };
    }
  }

  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));
  const dir = `evals/results/harness-${harness}`;
  mkdirSync(dir, { recursive: true });
  const out = `${dir}/${modelId}-p${pass}${only ? "-partial" : ""}.json`;
  writeFileSync(out, JSON.stringify({ ranAt: new Date().toISOString(), model: modelId, harness, results }, null, 1));
  console.log(`wrote ${out}, total $${spent.toFixed(2)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
