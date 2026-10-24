/**
 * The taste test (2026-10-24): does the AI value what a strong brewer values?
 *
 *   pnpm exec tsx scripts/taste-test.ts [--run evals/results/round4/future-v13-claude-opus-5-5.json] [--vs first|settled] [--no-request] [--tag r2] [--dry]
 *
 * For each future-test deck: the inventor's first real list (the earliest list
 * of the archetype, which other players went on to adopt) against the AI's
 * brew for the same request. A judge sees the request and both main decks with
 * card text, unlabeled, in both orders, and picks the one a strong player would
 * rather take to a tournament. Score: how often it picks the inventor's deck.
 * --vs settled swaps the inventor's first list for the most typical list a week
 * or more later (the one closest to all the others): the tuned deck, which a
 * brew should rarely beat. --no-request leaves out the request, so a deck isn't
 * favored for running every requested card as a 4-of.
 * The picker test found the AI prefers "established shells"; a judge with a
 * strong brewer's taste should pick the inventor's deck most of the time.
 */
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { readFileSync, writeFileSync } from "node:fs";
import { z } from "zod";
import { loadCardIndex } from "../src/cards/load";
import { costUsd, MODELS } from "../src/harness/models";
import { round4Items, type Line } from "../evals/round4/items";

try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local: rely on the environment.
}

const W = /^Cards?\s*\(\d+%?\)\s*$/i;
const arg = (name: string, fallback?: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const runFile = arg("run", "evals/results/round4/future-v13-claude-opus-5-5.json")!;
const vs = arg("vs", "first")!;
const noRequest = process.argv.includes("--no-request");
const DAY = 86_400_000;
const counts = (d: Line[]) => {
  const m = new Map<string, number>();
  for (const l of d) m.set(l.name, (m.get(l.name) ?? 0) + l.qty);
  return m;
};
const overlap = (a: Map<string, number>, b: Map<string, number>) => [...a].reduce((n, [k, q]) => n + Math.min(q, b.get(k) ?? 0), 0);
const model = MODELS[arg("model", "claude-opus-5-5")!];
const Pick = z.object({ choice: z.enum(["A", "B"]), why: z.string().describe("Two or three sentences.") });

export const JUDGE_SYSTEM =
  "You are a strong Magic: The Gathering player judging two brews built for the same request. Pick the one a strong player would rather take to a tournament in this format: does it do what was asked, does the plan hang together, are the card choices and numbers right, does the mana work. Judge the decks only.";

async function main() {
  const index = loadCardIndex();
  const raw = readFileSync("data/reference-lists-all.jsonl", "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as { format: string; date: string; strategy: string; main: Line[] });
  const brews = new Map((JSON.parse(readFileSync(runFile, "utf8")).results as { id: string; deck: { main: Line[] } | null }[]).map((r) => [r.id, r]));

  const pairs = round4Items(index)
    .filter((it) => it.track === "future" && it.target && brews.get(it.id)?.deck)
    .flatMap((it) => {
      const t = it.target!;
      const ofDeck = raw.filter((l) => l.format === t.format && l.strategy === t.strategy).sort((a, b) => a.date.localeCompare(b.date));
      let pick = ofDeck[0];
      if (vs === "settled") {
        const later = ofDeck.filter((l) => Date.parse(l.date) >= Date.parse(t.firstSeen) + 7 * DAY);
        const step = Math.max(1, Math.floor(later.length / 50));
        const sample = later.filter((_, i) => i % step === 0).slice(0, 50);
        const c = sample.map((l) => counts(l.main));
        pick = sample.map((l, i) => ({ l, s: c.reduce((n, o) => n + overlap(c[i], o), 0) })).sort((a, b) => b.s - a.s)[0]?.l;
      }
      // The judge is told the deck's first day either way: the brew was built with what existed then.
      return pick ? [{ it, inventor: pick.main.filter((c) => !W.test(c.name)), brew: brews.get(it.id)!.deck!.main, date: ofDeck[0].date }] : [];
    });
  console.log(`${pairs.length} pairs (brews from ${runFile})`);
  if (process.argv.includes("--dry")) {
    for (const p of pairs) console.log(`  ${p.it.id}: inventor ${p.date}, ${p.inventor.reduce((n, l) => n + l.qty, 0)} cards`);
    return;
  }

  const client = new Anthropic();
  const list = (d: Line[]) => d.map((l) => `${l.qty} ${index.getCard(l.name)?.name ?? l.name}`).join("\n");
  const out: unknown[] = [];
  let inventor = 0;
  let total = 0;
  let pickedA = 0;
  let spent = 0;
  for (const p of pairs) {
    const text = [...new Set([...p.inventor, ...p.brew].map((l) => index.getCard(l.name)?.name ?? l.name))]
      .map((n) => index.getCard(n))
      .filter((c): c is NonNullable<typeof c> => !!c && !/\bBasic\b/.test(c.typeLine))
      .map((c) => `- ${c.name} | ${c.manaCost} ${c.typeLine}: ${c.text}`)
      .join("\n");
    const marks: string[] = [];
    for (const inventorFirst of [true, false]) {
      const [A, B] = inventorFirst ? [p.inventor, p.brew] : [p.brew, p.inventor];
      const msg = await client.messages.parse({
        model: model.id,
        max_tokens: 16000,
        system: JUDGE_SYSTEM,
        messages: [{ role: "user", content: `Format: ${p.it.format}. Date: ${p.date}.\n${noRequest ? "Which deck would a strong player rather take to a tournament?" : `Request: ${p.it.prompt}`}\n\nDeck A:\n${list(A)}\n\nDeck B:\n${list(B)}\n\nCard text:\n${text}` }],
        output_config: { effort: "high", format: zodOutputFormat(Pick) },
      });
      const cost = costUsd(model, { input: msg.usage.input_tokens, output: msg.usage.output_tokens, cacheRead: 0, cacheWrite: 0 });
      spent += cost;
      const pick = msg.parsed_output?.choice;
      const choseInventor = (pick === "A") === inventorFirst;
      if (pick === "A") pickedA++;
      if (choseInventor) inventor++;
      total++;
      marks.push(choseInventor ? "inventor" : "AI brew");
      out.push({ item: p.it.id, inventorFirst, pick, choseInventor, why: msg.parsed_output?.why, costUsd: cost });
    }
    console.log(`${p.it.id.replace("future-", "").padEnd(36)} ${marks.join(" / ")}`);
  }
  console.log(`\nPicked the real deck (${vs === "settled" ? "tuned list" : "inventor's first list"}) ${inventor} of ${total} (${Math.round((inventor / total) * 100)}%). Picked "A" ${pickedA} of ${total}. Total $${spent.toFixed(2)}`);
  const tag = arg("tag");
  writeFileSync(`evals/results/round4/taste-test${vs === "settled" ? "-settled" : ""}${noRequest ? "-norequest" : ""}${tag ? `-${tag}` : ""}.json`, JSON.stringify({ ranAt: new Date().toISOString(), model: model.id, runFile, vs, noRequest, inventor, total, pickedA, results: out }, null, 1));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
