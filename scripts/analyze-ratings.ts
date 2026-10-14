/**
 * Unblind the owner's ratings and summarize them per model.
 *
 *   pnpm exec tsx scripts/analyze-ratings.ts evals/results/model-comparison/ratings-pass1/ratings
 *
 * Joins each rating to its model and pass through blind-key.json, then
 * reports mean scores per set overall and by prompt type, with and without
 * AI-judged rows, next to cost from objective.json. Writes
 * evals/results/model-comparison/ratings-summary.json.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const DIMS = ["plan", "legal", "mana", "shell"] as const;

/** Prompt types for the write-up. */
const TYPE: Record<string, string> = {
  "premodern-stock-goblins": "a list exists",
  "modern-tribal-brew": "a list exists",
  "pauper-budget-aggro": "a list exists",
  "vintage-restricted": "a list exists",
  "legacy-sideboard-only": "owner's list given",
  "premodern-paste-and-tune": "owner's list given",
  "legacy-impossible": "impossible as asked",
  "modern-named-two-cards": "impossible as asked",
};
const typeOf = (prompt: string) => TYPE[prompt] ?? "brew or twist";

interface Rating {
  aid: string;
  prompt: string;
  plan?: number;
  legal?: number;
  mana?: number;
  shell?: number;
  by?: string;
}

const dir = process.argv[2] ?? "evals/results/model-comparison/ratings-pass1/ratings";
const key = JSON.parse(readFileSync("evals/results/model-comparison/blind-key.json", "utf8")) as Record<
  string,
  { label: string; pass: string; prompt: string }
>;
const objective = JSON.parse(readFileSync("evals/results/model-comparison/objective.json", "utf8")) as {
  summary: { model: string; pass: string; decks: number; costUsd: number; medianSeconds: number }[];
};

const rows = readdirSync(dir)
  .filter((f) => f.endsWith(".json"))
  .map((f) => {
    const raw = JSON.parse(readFileSync(path.join(dir, f), "utf8"));
    return (raw.data ?? raw) as Rating;
  })
  .filter((r) => DIMS.every((d) => typeof r[d] === "number"))
  .map((r) => {
    const k = key[r.aid];
    if (!k) throw new Error(`No key entry for ${r.aid}`);
    const mean = DIMS.reduce((n, d) => n + (r[d] as number), 0) / DIMS.length;
    return { ...r, label: k.label, pass: k.pass, type: typeOf(r.prompt), mean, ai: (r.by ?? "owner") !== "owner" };
  });

const avg = (xs: number[]) => (xs.length ? +(xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(2) : null);
const labels = [...new Set(rows.map((r) => r.label))].sort();
const types = ["a list exists", "owner's list given", "brew or twist", "impossible as asked"];

const summary = labels.map((label) => {
  const rs = rows.filter((r) => r.label === label);
  const human = rs.filter((r) => !r.ai);
  const obj = objective.summary.find((o) => o.model === label && o.pass === "1");
  return {
    set: label,
    rated: rs.length,
    overall: avg(rs.map((r) => r.mean)),
    overallHumanOnly: avg(human.map((r) => r.mean)),
    ...Object.fromEntries(DIMS.map((d) => [d, avg(rs.map((r) => r[d] as number))])),
    ...Object.fromEntries(types.map((t) => [t, avg(rs.filter((r) => r.type === t).map((r) => r.mean))])),
    decks: obj?.decks ?? null,
    costUsd: obj?.costUsd ?? null,
    medianSeconds: obj?.medianSeconds ?? null,
  };
});

summary.sort((a, b) => (b.overall ?? 0) - (a.overall ?? 0));
console.table(
  summary.map((s) => ({
    set: s.set,
    overall: s.overall,
    humanOnly: s.overallHumanOnly,
    plan: (s as Record<string, unknown>).plan,
    legal: (s as Record<string, unknown>).legal,
    mana: (s as Record<string, unknown>).mana,
    shell: (s as Record<string, unknown>).shell,
    decks: s.decks,
    cost: s.costUsd,
  })),
);
console.table(
  summary.map((s) => ({ set: s.set, ...Object.fromEntries(types.map((t) => [t, (s as Record<string, unknown>)[t]])) })),
);

const perPrompt = [...new Set(rows.map((r) => r.prompt))].map((prompt) => {
  const rs = rows.filter((r) => r.prompt === prompt);
  const means = rs.map((r) => r.mean);
  return {
    prompt,
    type: typeOf(prompt),
    avg: avg(means),
    spread: +(Math.max(...means) - Math.min(...means)).toFixed(2),
    best: rs.sort((a, b) => b.mean - a.mean)[0].label,
  };
});
perPrompt.sort((a, b) => b.spread - a.spread);
console.table(perPrompt);

writeFileSync(
  "evals/results/model-comparison/ratings-summary.json",
  JSON.stringify({ ratedAnswers: rows.length, aiJudged: rows.filter((r) => r.ai).length, summary, perPrompt }, null, 1),
);
