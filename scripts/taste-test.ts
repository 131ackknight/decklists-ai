/**
 * The taste test (2026-10-24): does the AI value what a strong brewer values?
 *
 *   pnpm exec tsx scripts/taste-test.ts [--run evals/results/round4/future-v13-claude-opus-5-5.json] [--vs first|settled] [--no-request] [--evidence] [--goldfish] [--tag r2] [--dry]
 *
 * For each future-test deck: the inventor's first real list (the earliest list
 * of the archetype, which other players went on to adopt) against the AI's
 * brew for the same request. A judge sees the request and both main decks with
 * card text, unlabeled, in both orders, and picks the one a strong player would
 * rather take to a tournament. Score: how often it picks the inventor's deck.
 * --vs settled swaps the inventor's first list for the most typical list a week
 * or more later (the one closest to all the others): the tuned deck, which a
 * brew should rarely beat. --no-request leaves out the request, so a deck isn't
 * favored for running every requested card as a 4-of. --evidence adds, for each
 * deck's nonland cards, how real decks used them up to the deck's first day
 * (play share, home deck, usual partners; cardEvidence from the v17 reviewer).
 * --goldfish adds each deck's mana stats from the goldfish simulator.
 * The picker test found the AI prefers "established shells"; a judge with a
 * strong brewer's taste should pick the inventor's deck most of the time.
 * Decks and data cutoff are the frozen taste-v1 (--vs settled) or taste-first-v1
 * test; results are saved after every pair and runs recorded in evals/runs.jsonl.
 */
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { readFileSync, writeFileSync } from "node:fs";
import { z } from "zod";
import { loadCardIndex } from "../src/cards/load";
import { FileDataSource } from "../src/data/source";
import { costUsd, MODELS } from "../src/harness/models";
import { cardEvidence } from "../src/harness/review";
import { goldfish } from "../src/sim/goldfish";
import { recordRun } from "../evals/register";
import { round4Items, type Line } from "../evals/round4/items";
import { loadLists } from "../evals/score";
import { testById } from "../evals/tests";

try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local: rely on the environment.
}

const arg = (name: string, fallback?: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const runFile = arg("run", "evals/results/round4/future-v13-claude-opus-5-5.json")!;
const vs = arg("vs", "first")!;
const noRequest = process.argv.includes("--no-request");
const withEvidence = process.argv.includes("--evidence");
const withGoldfish = process.argv.includes("--goldfish");
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
  const TEST = testById(vs === "settled" ? "taste-v1" : "taste-first-v1");
  const raw = loadLists(String(TEST.params.dataThrough));
  const brews = new Map((JSON.parse(readFileSync(runFile, "utf8")).results as { id: string; deck: { main: Line[] } | null }[]).map((r) => [r.id, r]));

  const pairs = round4Items(index)
    .filter((it) => TEST.items.includes(it.id) && it.target && brews.get(it.id)?.deck)
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
      return pick ? [{ it, inventor: pick.main, brew: brews.get(it.id)!.deck!.main, date: ofDeck[0].date }] : [];
    });
  console.log(`${pairs.length} pairs (brews from ${runFile})`);
  if (process.argv.includes("--dry")) {
    for (const p of pairs) console.log(`  ${p.it.id}: inventor ${p.date}, ${p.inventor.reduce((n, l) => n + l.qty, 0)} cards`);
    return;
  }

  const history = withEvidence ? await FileDataSource.load("data/reference-lists-all.jsonl", index) : null;
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  // What the judge sees about one deck beyond its list, by the flags.
  const extra = (d: Line[], format: string, date: string) => {
    const parts: string[] = [];
    if (history) {
      const ev = cardEvidence(index, history.cut(date), format, d);
      parts.push(`How real ${format} decks used these cards in the year before ${date} (share = % of all lists; home = decks that play it; partners = cards usually beside it that this deck lacks):\n${ev.map((e) => `- ${e.card}: share ${e.sharePct}% | home: ${e.homes} | partners: ${e.partners}`).join("\n")}`);
    }
    if (withGoldfish) {
      const g = goldfish(index, { main: d, games: 3000, seed: 1 });
      parts.push(`Goldfish simulation, mana only (3,000 games on the play): mulligan ${pct(g.mulliganRate)}, land drop every turn through 4: ${pct(g.landDropsThroughT4)}, screw (2 or fewer lands on turn 4) ${pct(g.screwRate)}, flood (8+ lands by turn 6) ${pct(g.floodRate)}, can cast everything in hand it has mana for, turns 1-4: ${g.colorOkByTurn.slice(0, 4).map(pct).join(", ")}.`);
    }
    return parts.length ? `\n${parts.join("\n")}` : "";
  };

  const client = new Anthropic();
  const list = (d: Line[]) => d.map((l) => `${l.qty} ${index.getCard(l.name)?.name ?? l.name}`).join("\n");
  const out: unknown[] = [];
  let inventor = 0;
  let total = 0;
  let pickedA = 0;
  let spent = 0;
  const tag = arg("tag");
  const outFile = `evals/results/round4/taste-test${vs === "settled" ? "-settled" : ""}${noRequest ? "-norequest" : ""}${withEvidence ? "-evidence" : ""}${withGoldfish ? "-goldfish" : ""}${tag ? `-${tag}` : ""}.json`;
  const save = (complete: boolean) =>
    writeFileSync(outFile, JSON.stringify({ ranAt: new Date().toISOString(), model: model.id, runFile, vs, noRequest, withEvidence, withGoldfish, complete, inventor, total, pickedA, results: out }, null, 1));
  const note = `judge ${model.id}; real ${vs}; request ${noRequest ? "hidden" : "shown"}${withEvidence ? "; card evidence" : ""}${withGoldfish ? "; goldfish" : ""}; brews ${runFile}`;
  const started = recordRun({ event: "started", script: "taste-test", file: outFile, tests: [TEST.id], model: model.id, tag, items: pairs.length, note });
  for (const p of pairs) {
    const text = [...new Set([...p.inventor, ...p.brew].map((l) => index.getCard(l.name)?.name ?? l.name))]
      .map((n) => index.getCard(n))
      .filter((c): c is NonNullable<typeof c> => !!c && !/\bBasic\b/.test(c.typeLine))
      .map((c) => `- ${c.name} | ${c.manaCost} ${c.typeLine}: ${c.text}`)
      .join("\n");
    const marks: string[] = [];
    for (const inventorFirst of [true, false]) {
      const [A, B] = inventorFirst ? [p.inventor, p.brew] : [p.brew, p.inventor];
      const fmt = p.it.target!.format;
      const msg = await client.messages.parse({
        model: model.id,
        max_tokens: 16000,
        system: JUDGE_SYSTEM,
        messages: [{ role: "user", content: `Format: ${p.it.format}. Date: ${p.date}.\n${noRequest ? "Which deck would a strong player rather take to a tournament?" : `Request: ${p.it.prompt}`}\n\nDeck A:\n${list(A)}${extra(A, fmt, p.date)}\n\nDeck B:\n${list(B)}${extra(B, fmt, p.date)}\n\nCard text:\n${text}` }],
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
    save(false);
  }
  console.log(`\nPicked the real deck (${vs === "settled" ? "tuned list" : "inventor's first list"}) ${inventor} of ${total} (${Math.round((inventor / total) * 100)}%). Picked "A" ${pickedA} of ${total}. Total $${spent.toFixed(2)}`);
  save(true);
  recordRun({ event: "finished", script: "taste-test", file: outFile, tests: [TEST.id], model: model.id, tag, items: pairs.length, costUsd: Math.round(spent * 10000) / 10000, complete: true, note, commit: started.commit, dirty: started.dirty });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
