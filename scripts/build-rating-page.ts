/**
 * Build the Brew Scorecard page from one or more eval result files.
 *
 *   pnpm exec tsx scripts/build-rating-page.ts evals/rating/scorecard.html \
 *     v1-haiku-4-5="v1 on Haiku 4.5"=evals/results/v1-baseline/haiku-4-5.json \
 *     v1-haiku-5-5="v1 on Haiku 5.5"=evals/results/v1-baseline/haiku-5-5.json
 *
 * Each run is `id=label=file`. The page embeds the answers; ratings live in
 * the published artifact's `db` (collection `ratings`, doc `<run>--<prompt>`).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { RUBRIC_DIMENSIONS, RUBRIC_PROMPTS } from "../evals/rubric/prompts";

interface RawResult {
  id: string;
  format: string;
  prompt: string;
  unsupported?: boolean;
  status?: number;
  ms?: number;
  text?: string;
  toolCalls?: { name: string; ok?: boolean }[];
  deck?: {
    main: { qty: number; name: string }[];
    side: { qty: number; name: string }[];
    strategy?: string;
    badge?: string;
    warnings?: string[];
  } | null;
  usage?: { promptTokens?: number; completionTokens?: number } | null;
  httpError?: string;
  requestError?: string;
  errors?: string[];
}

const SHORT: Record<string, string> = { plan: "Plan", legal: "Legal", mana: "Mana", shell: "Shell" };
const [out, ...specs] = process.argv.slice(2);
if (!out || specs.length === 0) throw new Error("usage: build-rating-page.ts <out.html> id=label=file ...");

const promptsById = new Map(RUBRIC_PROMPTS.map((p) => [p.id, p]));
const runs = specs.map((spec) => {
  const [id, label, file] = spec.split("=");
  const raw = JSON.parse(readFileSync(file, "utf8")) as { ranAt: string; model: string; results: RawResult[] };
  const results = raw.results.map((r) => {
    const meta = promptsById.get(r.id);
    const proposals = (r.toolCalls ?? []).filter((c) => c.name === "propose_deck");
    const sum = (xs: { qty: number }[]) => xs.reduce((n, c) => n + c.qty, 0);
    const error =
      r.requestError ??
      (r.status && r.status !== 200 ? `HTTP ${r.status}: ${(r.httpError ?? "").slice(0, 200)}` : undefined) ??
      (r.errors && r.errors.length ? r.errors.join("; ") : undefined);
    return {
      id: r.id,
      format: r.format,
      prompt: r.prompt,
      lookFor: meta?.lookFor ?? "",
      afterLaunch: meta?.afterLaunch ?? false,
      unsupported: r.unsupported ?? false,
      error,
      text: r.text ?? "",
      deck: r.deck
        ? {
            main: r.deck.main.map((c) => ({ qty: c.qty, name: c.name })),
            side: (r.deck.side ?? []).map((c) => ({ qty: c.qty, name: c.name })),
            mainCount: sum(r.deck.main),
            sideCount: sum(r.deck.side ?? []),
            strategy: r.deck.strategy,
            badge: r.deck.badge,
            warnings: r.deck.warnings ?? [],
          }
        : null,
      toolCalls: (r.toolCalls ?? []).length,
      proposals: proposals.length,
      rejected: proposals.filter((c) => c.ok === false).length,
      tokensIn: r.usage?.promptTokens ?? 0,
      tokensOut: r.usage?.completionTokens ?? 0,
      ms: r.ms ?? 0,
    };
  });
  return { id, label, note: `${label}, run ${raw.ranAt.slice(0, 10)}. Rate each answer 1 to 5 on four checks.`, results };
});

const data = {
  dimensions: RUBRIC_DIMENSIONS.map((d) => ({ key: d.key, label: d.label, short: SHORT[d.key] ?? d.key })),
  runs,
};
// Keep `</script>` inside model text from closing the data block.
const json = JSON.stringify(data).replace(/</g, "\\u003c");
const html = readFileSync("evals/rating/template.html", "utf8").replace("/*DATA*/", () => json);
writeFileSync(out, html);
console.log(`wrote ${out}: ${runs.map((r) => `${r.id} (${r.results.length})`).join(", ")}`);
