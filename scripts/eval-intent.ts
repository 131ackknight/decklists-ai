/**
 * Grade the intent stage against hand labels.
 *
 *   pnpm exec tsx scripts/eval-intent.ts --model claude-haiku-5-5
 *
 * Scores type, format, named cards and color constraints per prompt and
 * writes evals/results/intent/<model>.json.
 */
import Anthropic from "@anthropic-ai/sdk";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { getFormat } from "../src/cards/formats";
import { loadCardIndex } from "../src/cards/load";
import { normalizeName } from "../src/cards/names";
import { MODELS, costUsd } from "../src/harness/models";
import { classifyIntent, normalizeIntent } from "../src/pipeline/intent";
import { INTENT_LABELS } from "../evals/intent/labels";
import { RUBRIC_PROMPTS } from "../evals/rubric/prompts";

try {
  process.loadEnvFile(".env.local");
} catch {
  // CI provides the key in the environment.
}

const i = process.argv.indexOf("--model");
const modelId = i > 0 ? process.argv[i + 1] : "claude-haiku-5-5";
const model = MODELS[modelId];
const sent = new Map(
  (JSON.parse(readFileSync("evals/rubric/v1-prompts.json", "utf8")) as { id: string; prompt: string }[]).map((p) => [p.id, p.prompt]),
);
const sameSet = (a: string[] = [], b: string[] = []) =>
  a.length === b.length && [...a].sort().join() === [...b].sort().join();
const index = loadCardIndex();
/** Compare only names that are real cards ("Scam" is a deck, not a card). */
const sameCards = (a: string[], b: string[]) => {
  const real = (xs: string[]) => xs.map((n) => index.getCard(n)?.name).filter((n): n is string => !!n).map(normalizeName);
  return sameSet(real(a), real(b));
};
const ALL = ["W", "U", "B", "R", "G"];
/** "Exactly W" and "exclude U, B, R, G" say the same thing. */
const colorsMatch = (gotExactly: string[] | null, gotExclude: string[], wantExactly: string[] = [], wantExclude: string[] = []) => {
  const allowed = (exactly: string[] | null, exclude: string[]) =>
    (exactly && exactly.length ? exactly : ALL.filter((c) => !exclude.includes(c))).sort().join();
  return allowed(gotExactly, gotExclude) === allowed(wantExactly.length ? wantExactly : null, wantExclude);
};

async function main() {
  const client = new Anthropic();
  const rows = await Promise.all(
    RUBRIC_PROMPTS.map(async (p) => {
      const label = INTENT_LABELS[p.id];
      const { intent, usage } = await classifyIntent(client, modelId, {
        prompt: sent.get(p.id) ?? p.prompt,
        format: p.format === "Any" ? null : p.format,
      });
      const promptText = sent.get(p.id) ?? p.prompt;
      const got = intent && normalizeIntent(intent, promptText, (n) => index.getCard(n)?.name);
      const fmt = got?.format ? (getFormat(got.format)?.key ?? got.format) : null;
      const checks = {
        type: got != null && (got.type === label.type || (label.alsoType ?? []).includes(got.type)),
        format: fmt === label.format,
        namedCards: got ? sameCards(got.namedCards, label.namedCards) : false,
        colors: got
          ? label.colorsOpen || colorsMatch(got.colors.exactly, got.colors.exclude, label.colorsExactly, label.colorsExclude)
          : false,
      };
      return {
        id: p.id,
        expected: label,
        got,
        checks,
        cost: costUsd(model, { input: usage.input_tokens, output: usage.output_tokens, cacheRead: 0, cacheWrite: 0 }),
      };
    }),
  );
  const n = rows.length;
  const score = (k: keyof (typeof rows)[number]["checks"]) => `${rows.filter((r) => r.checks[k]).length}/${n}`;
  console.log(`${modelId}: type ${score("type")}, format ${score("format")}, named cards ${score("namedCards")}, colors ${score("colors")}, cost $${rows.reduce((a, r) => a + r.cost, 0).toFixed(4)}`);
  for (const r of rows) {
    const misses = Object.entries(r.checks).filter(([, ok]) => !ok).map(([k]) => k);
    if (misses.length === 0) continue;
    console.log(
      `  ${r.id}: missed ${misses.join(", ")} | expected type=${r.expected.type} format=${r.expected.format} cards=${JSON.stringify(r.expected.namedCards)} | got type=${r.got?.type} format=${r.got?.format} cards=${JSON.stringify(r.got?.namedCards)} colors=${JSON.stringify(r.got?.colors)}`,
    );
  }
  mkdirSync("evals/results/intent", { recursive: true });
  writeFileSync(`evals/results/intent/${modelId}.json`, JSON.stringify(rows, null, 1));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
