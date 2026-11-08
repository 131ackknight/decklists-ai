/**
 * Can the AI recognize a hidden gem when it's shown one? (2026-10-22)
 *
 *   pnpm exec tsx scripts/gem-test.ts [--dry] [--tag r2] [--model claude-opus-5-5]
 *
 * For each Brewing Test deck (2+ first-week lists): the inventor's gems (as in
 * score-tests.ts) mixed with look-alikes, 30 cards in all. Look-alikes are just
 * as under-played (under 5% of the format's lists in the 90 days before), legal,
 * in the requested cards' colors, ranked highest by the feature-synergy model,
 * and not played by the real deck (under 20% of its lists, first week or later).
 * One call per deck rates every card 1-5 for "a strong brewer would main-deck
 * it here". Score: the chance a random gem is rated above a random look-alike
 * (50% = can't tell them apart). --dry prints the card sets and spends nothing.
 * Decks and data cutoff are the frozen gem-v1 test (evals/tests.ts); results are
 * saved after every deck and the run is recorded in evals/runs.jsonl.
 */
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { writeFileSync } from "node:fs";
import { z } from "zod";
import { loadCardIndex } from "../src/cards/load";
import { normalizeName } from "../src/cards/names";
import { FileDataSource } from "../src/data/source";
import { costUsd, MODELS } from "../src/harness/models";
import { recordRun } from "../evals/register";
import { isLand, round4Items, toCounts } from "../evals/round4/items";
import { loadLists } from "../evals/score";
import { testById } from "../evals/tests";
import { synergyScore, trainSynergy } from "../src/synergy/feature-synergy";

try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local: rely on the environment.
}

const DAY = 86_400_000;
const TEST = testById("gem-v1");
const SIZE = 30;
const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const dry = process.argv.includes("--dry");
const model = MODELS[arg("model") ?? "claude-opus-5-5"];

const Ratings = z.object({ ratings: z.array(z.object({ card: z.string(), score: z.number().int().min(1).max(5), why: z.string() })) });

// A stable shuffle, so gems don't sit in one place and reruns see the same order.
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

async function main() {
  const index = loadCardIndex();
  const history = await FileDataSource.load("data/reference-lists-all.jsonl", index);
  const raw = loadLists(String(TEST.params.dataThrough));
  const synergy = trainSynergy(index, raw.filter((l) => l.format !== "duel" && l.date < "2026-04-01").map((l) => l.main.map((c) => c.name)));
  const land = (k: string) => isLand(index, k);
  const canon = (k: string) => normalizeName(index.getCard(k)?.name ?? k);
  const client = new Anthropic();
  const out: unknown[] = [];
  const pairs: number[] = [];
  let spent = 0;
  const tag = arg("tag");
  const outFile = `evals/results/round4/gem-test${tag ? `-${tag}` : ""}.json`;
  const save = (complete: boolean) => {
    const mean = pairs.reduce((a, b) => a + b, 0) / Math.max(1, pairs.length);
    writeFileSync(outFile, JSON.stringify({ ranAt: new Date().toISOString(), model: model.id, complete, mean, results: out }, null, 1));
  };
  const started = dry ? null : recordRun({ event: "started", script: "gem-test", file: outFile, tests: [TEST.id], model: model.id, tag, items: TEST.items.length });

  for (const it of round4Items(index).filter((i) => TEST.items.includes(i.id) && i.target)) {
    const t = it.target!;
    const first = Date.parse(t.firstSeen);
    const ofDeck = raw.filter((l) => l.format === t.format && l.strategy === t.strategy).map((l) => ({ date: l.date, c: toCounts(index, l.main) }));
    const firstWeek = ofDeck.filter((l) => Date.parse(l.date) < first + 7 * DAY);
    if (firstWeek.length < 2) continue;

    const before = history.cut(t.firstSeen);
    const fmtShare = (k: string) => before.cardPlayRate(t.format, index.getCard(k)?.name ?? k)?.share ?? 0;
    const share = (lists: typeof ofDeck) => {
      const m = new Map<string, number>();
      for (const l of lists) for (const k of l.c.keys()) m.set(canon(k), (m.get(canon(k)) ?? 0) + 1 / lists.length);
      return m;
    };
    const sig = (it.keyCards ?? []).map((k) => index.getCard(k)).filter((c): c is NonNullable<typeof c> => !!c);
    const asked = new Set(sig.map((c) => normalizeName(c.name)));
    const inFirst = share(firstWeek);
    const gems = [...inFirst].filter(([k, s]) => s >= 0.8 && !land(k) && !asked.has(k) && fmtShare(k) < 0.05).map(([k]) => k);
    if (!gems.length) continue;

    const played = share(ofDeck);
    const colors = new Set(sig.flatMap((c) => c.colors));
    const pool = index.asOf(t.firstSeen, history.cardsPlayedThrough(t.firstSeen));
    const ranked = pool.cards
      .filter((c) => {
        const k = normalizeName(c.name);
        return (
          !land(c.name) &&
          (c.legal[t.format] === "legal" || c.legal[t.format] === "restricted") &&
          !asked.has(k) &&
          !gems.includes(k) &&
          (played.get(k) ?? 0) < 0.2 &&
          (colors.size === 0 || c.colors.every((x) => colors.has(x)))
        );
      })
      .map((c) => ({ c, s: synergyScore(synergy, sig, c) }))
      .sort((a, b) => b.s - a.s)
      .map(({ c }) => normalizeName(c.name));
    // Walk down the synergy ranking until enough are under-played; checking the whole pool is slow.
    const lookAlikes: string[] = [];
    for (const k of ranked) {
      if (lookAlikes.length >= SIZE - gems.length) break;
      if (fmtShare(k) < 0.05) lookAlikes.push(k);
    }
    const shown = [...gems, ...lookAlikes].sort((a, b) => hash(a + it.id) - hash(b + it.id));
    const name = (k: string) => index.getCard(k)?.name ?? k;
    console.log(`${t.format} ${t.strategy}: ${gems.length} gems (${gems.map(name).join(", ")}) + ${lookAlikes.length} look-alikes`);
    if (dry) continue;

    const cardLine = (k: string) => {
      const c = index.getCard(k)!;
      return `- ${c.name} | ${c.manaCost} ${c.typeLine}: ${c.text}`;
    };
    const msg = await client.messages.parse({
      model: model.id,
      max_tokens: 16000,
      system:
        "You are a strong Magic: The Gathering deck builder. A player is brewing a new deck. For each card listed, rate how likely a strong brewer would put it in this deck's main deck: 5 = clearly belongs, 4 = likely, 3 = could go either way, 2 = unlikely, 1 = doesn't belong. Judge each card on its own merits for this deck. Rate every card, using its exact name.",
      messages: [
        {
          role: "user",
          content: `Format: ${t.format}. Date: ${t.firstSeen}.\nThe deck is built around: ${sig.map((c) => c.name).join(", ")}.\n${sig.map((c) => `- ${c.name} | ${c.manaCost} ${c.typeLine}: ${c.text}`).join("\n")}\n\nCards to rate:\n${shown.map(cardLine).join("\n")}`,
        },
      ],
      output_config: { effort: "high", format: zodOutputFormat(Ratings) },
    });
    const cost = costUsd(model, { input: msg.usage.input_tokens, output: msg.usage.output_tokens, cacheRead: 0, cacheWrite: 0 });
    spent += cost;
    const score = new Map((msg.parsed_output?.ratings ?? []).map((r) => [canon(r.card), r]));
    const g = gems.map((k) => score.get(k)?.score ?? 0);
    const l = lookAlikes.map((k) => score.get(k)?.score ?? 0);
    let wins = 0;
    for (const a of g) for (const b of l) wins += a > b ? 1 : a === b ? 0.5 : 0;
    const auc = wins / (g.length * l.length);
    pairs.push(auc);
    const rank = [...score.values()].sort((a, b) => b.score - a.score);
    console.log(
      `  gems ${g.join(",")} (mean ${(g.reduce((a, b) => a + b, 0) / g.length).toFixed(1)}) | look-alikes mean ${(l.reduce((a, b) => a + b, 0) / l.length).toFixed(1)} | gem above look-alike ${Math.round(auc * 100)}% | $${cost.toFixed(3)}`,
    );
    console.log(`  rated 5: ${rank.filter((r) => r.score === 5).map((r) => `${r.card}${gems.includes(canon(r.card)) ? "*" : ""}`).join(", ")}`);
    out.push({ id: it.id, gems: gems.map(name), lookAlikes: lookAlikes.map(name), ratings: msg.parsed_output?.ratings, auc, costUsd: cost });
    save(false);
  }
  if (dry) return;
  const mean = pairs.reduce((a, b) => a + b, 0) / pairs.length;
  console.log(`\n${pairs.length} decks: a gem is rated above a look-alike ${Math.round(mean * 100)}% of the time (50% = can't tell). Total $${spent.toFixed(2)}`);
  save(true);
  recordRun({ event: "finished", script: "gem-test", file: outFile, tests: [TEST.id], model: model.id, tag, items: out.length, costUsd: Math.round(spent * 10000) / 10000, complete: out.length === TEST.items.length, commit: started!.commit, dirty: started!.dirty });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
