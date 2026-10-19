/**
 * Diagnostic: is the right deck in the model's head, just not its first idea?
 *
 *   pnpm exec tsx scripts/brainstorm-shells.ts [--model claude-opus-5-5] [--ideas 5] [--menu]
 *
 * --menu adds the format's working decks that day (top archetypes and the
 * nonland cards most of their lists run) as building blocks: the knowledge a
 * player gets from playing the format.
 *
 * For each brew holdout deck, asks for N genuinely different directions built
 * around the same signature cards (no tools, one call), keeps only real cards
 * that existed that day, and scores each direction's nonland cards against the
 * original brewers' first lists. If the best of N is far above the model's
 * single brew, the gap is choosing between ideas (a search problem); if not,
 * the model is missing knowledge the harness has to supply.
 */
import Anthropic from "@anthropic-ai/sdk";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { loadCardIndex } from "../src/cards/load";
import { FileDataSource } from "../src/data/source";
import { MODELS, costUsd } from "../src/harness/models";
import { round4Items, toCounts } from "../evals/round4/items";

try {
  process.loadEnvFile(".env.local");
} catch {
  // CI sets ANTHROPIC_API_KEY.
}
const arg = (n: string, d: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const modelId = arg("model", "claude-opus-5-5");
const ideas = Number(arg("ideas", "5"));
const withMenu = process.argv.includes("--menu");
const model = MODELS[modelId];
const W = /^Cards?\s*\(\d+%?\)\s*$/i;

const Ideas = z.object({
  decks: z.array(
    z.object({
      plan: z.string().describe("One sentence: how this version wins and why these cards."),
      colors: z.string(),
      nonland: z.array(z.object({ qty: z.number().int().min(1).max(4), name: z.string() })).describe("The 12-20 most important nonland cards with copies."),
    }),
  ),
});

async function main() {
  const index = loadCardIndex();
  const history = await FileDataSource.load("data/reference-lists-all.jsonl", index);
  const raw = readFileSync("data/reference-lists-all.jsonl", "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  // The model's own v2 brew, for comparison, when one exists.
  const singleFile = `evals/results/round4/holdout-v2-${modelId}.json`;
  const single = new Map<string, any>(existsSync(singleFile) ? (JSON.parse(readFileSync(singleFile, "utf8")).results as any[]).map((r) => [r.id, r]) : []);
  const client = new Anthropic();
  const rows: Record<string, unknown>[] = [];
  let spent = 0;
  const items = round4Items(index).filter((i) => i.track === "holdout");
  const work = items.map(async (it, n) => {
    await new Promise((r) => setTimeout(r, n * 1500));
    try {
      await brainstorm(it, n);
    } catch (err) {
      rows[n] = { id: it.id, error: (err as Error).message.slice(0, 200) };
      console.log(`${it.id.replace("holdout-", "").padEnd(28)} failed: ${(err as Error).message.slice(0, 120)}`);
    }
  });
  async function brainstorm(it: (typeof items)[number], n: number) {
    const t = it.target!;
    const pool = index.asOf(it.before!, history.cardsPlayedThrough(it.before!));
    // The original brewers: cards in their first 5 lists, at average copies.
    const first = raw.filter((l: any) => l.format === t.format && l.strategy === t.strategy).sort((a: any, b: any) => a.date.localeCompare(b.date)).slice(0, 5);
    const human = new Map<string, number>();
    for (const l of first) for (const [k, q] of toCounts(index, l.main.filter((c: any) => !W.test(c.name)))) human.set(k, (human.get(k) ?? 0) + q / first.length);
    const nonland = (k: string) => !/\bLand\b/.test(index.getCard(k)?.typeLine.split(" // ")[0] ?? "");
    const humanNonland = [...human].filter(([k]) => nonland(k));
    const humanTotal = humanNonland.reduce((a, [, q]) => a + q, 0);
    const score = (m: Map<string, number>) => humanNonland.reduce((a, [k, q]) => a + Math.min(q, m.get(k) ?? 0), 0) / humanTotal;

    // What's working in the format the day before: top archetypes by share and their core nonland cards.
    let menu = "";
    if (withMenu) {
      const data = history.cut(it.before!, pool);
      const meta = data.meta(t.format).slice(0, 15);
      const lines = meta.map((m) => {
        const a = data.archetype(t.format, m.strategy);
        const core = (a?.main ?? []).filter((c) => c.adoption >= 0.7 && nonland(c.name)).slice(0, 12).map((c) => `${Math.round(c.avgCopies)} ${c.name}`);
        return `- ${m.strategy} (${Math.round(m.share * 100)}% of the field): ${core.join(", ")}`;
      });
      menu =
        `\n\nWhat is working in ${it.format} right now (last 30 days of results), as building blocks. These are packages to borrow from where they fit the cards, not decks to copy:\n` +
        lines.join("\n");
    }
    const msg = await client.messages.stream({
      model: model.id,
      max_tokens: 32000,
      ...(model.effort ? { output_config: { effort: "high" as const, format: zodOutputFormat(Ideas) } } : { output_config: { format: zodOutputFormat(Ideas) } }),
      messages: [
        {
          role: "user",
          content:
            `It is ${it.before}. Format: ${it.format}. ${it.prompt}\n\n` +
            `Give ${ideas} genuinely different decks built around these cards: different colors, partner cards or plans, not small variations. ` +
            `Include the version a strong player who knows the current ${it.format} metagame would most likely build, and some less obvious ones. ` +
            `Only real cards legal in ${it.format} on that date. For each, the plan in one sentence, its colors, and the 12-20 most important nonland cards with copies.` +
            menu,
        },
      ],
    }).finalMessage();
    const text = msg.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    const parsed = Ideas.parse(JSON.parse(text));
    spent += costUsd(model, {
      input: msg.usage.input_tokens,
      output: msg.usage.output_tokens,
      cacheRead: msg.usage.cache_read_input_tokens ?? 0,
      cacheWrite: msg.usage.cache_creation_input_tokens ?? 0,
    });
    const decks = parsed.decks.map((d) => {
      const real = d.nonland.filter((c) => pool.getCard(c.name));
      return { plan: d.plan, colors: d.colors, unknown: d.nonland.length - real.length, score: score(toCounts(index, real)) };
    });
    const s = single.get(it.id)?.deck;
    const singleScore = s ? score(toCounts(index, s.main)) : null;
    const best = decks.reduce((b, d) => (d.score > b.score ? d : b), decks[0] ?? { score: 0, plan: "" });
    rows[n] = { id: it.id, single: singleScore, first: decks[0]?.score ?? null, best: best.score, bestIndex: decks.indexOf(best), bestPlan: best.plan, decks };
    console.log(`${it.id.replace("holdout-", "").padEnd(28)} one brew ${Math.round((singleScore ?? 0) * 100)}% | idea 1 ${Math.round((decks[0]?.score ?? 0) * 100)}% | best of ${decks.length} ${Math.round(best.score * 100)}% (idea ${decks.indexOf(best) + 1})  [$${spent.toFixed(2)}]`);
  }
  await Promise.all(work);
  const done = rows.filter((r) => r && !r.error);
  const avg = (k: string) => done.reduce((a, r) => a + ((r[k] as number) ?? 0), 0) / done.length;
  console.log(`(${done.length} of ${rows.length} decks scored)`);
  console.log(`\nAVERAGE share of the original brewers' nonland cards: one tool-using brew ${Math.round(avg("single") * 100)}%, first idea ${Math.round(avg("first") * 100)}%, best of ${ideas} ideas ${Math.round(avg("best") * 100)}%. Cost $${spent.toFixed(2)}`);
  writeFileSync(`evals/results/round4/brainstorm-${modelId}${withMenu ? "-menu" : ""}.json`, JSON.stringify({ ranAt: new Date().toISOString(), model: modelId, ideas, rows }, null, 1));
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
