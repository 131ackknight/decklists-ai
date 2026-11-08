/**
 * Can Opus tell the right listed spells from the wrong ones when asked directly? (2026-11-08)
 *
 *   pnpm exec tsx scripts/judge-test.ts [--dry] [--model claude-opus-5-5]
 *
 * v20 showed each dev deck (holdout-v1) up to 20 little-played spells that real decks run beside the
 * requested cards, and both Haiku and Opus then played more listed spells, right and wrong alike. Here one
 * call per deck shows the same list (as saved in v20's first Opus run), in a stable shuffled order, with the
 * requested cards and every card's text, and rates each 1-5 with the gem test's wording. Right answers,
 * never shown: a listed spell that is in half or more of the settled lists (also reported: the stricter
 * borrowed spells, evals/score.ts). Only decks whose list holds at least one right spell are sent. Score per deck: the chance a right spell is rated above a wrong one (50% =
 * can't tell), against the same score for v20's own list order. --dry prints the sets and spends nothing.
 * Results save after every deck; the run is recorded in evals/runs.jsonl.
 */
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { readFileSync, writeFileSync } from "node:fs";
import { z } from "zod";
import { loadCardIndex } from "../src/cards/load";
import { normalizeName } from "../src/cards/names";
import { costUsd, MODELS, usageOf } from "../src/harness/models";
import { recordRun } from "../evals/register";
import { pairedGain } from "../evals/protocol";
import { round4Items, toCounts } from "../evals/round4/items";
import { borrowedSpells, loadLists, settledLists, type Counts, type RefList } from "../evals/score";
import { testById } from "../evals/tests";

try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local: rely on the environment.
}

const LISTS_FROM = "evals/results/round4/holdout-v20-claude-opus-5-5.json";
const OUT = "evals/results/round4/judge-test-v20-lists.json";
const dry = process.argv.includes("--dry");
const model = MODELS[process.argv.includes("--model") ? process.argv[process.argv.indexOf("--model") + 1] : "claude-opus-5-5"];
const Ratings = z.object({ ratings: z.array(z.object({ card: z.string(), score: z.number().int().min(1).max(5), why: z.string() })) });
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

/** The chance a random right card scores above a random wrong one, ties half. */
const auc = (pos: number[], neg: number[]) => {
  let wins = 0;
  for (const a of pos) for (const b of neg) wins += a > b ? 1 : a === b ? 0.5 : 0;
  return wins / (pos.length * neg.length);
};

async function main() {
  const index = loadCardIndex();
  const items = new Map(round4Items(index).map((it) => [it.id, it]));
  const lists = loadLists(String(testById("tuning-v1").params.dataThrough));
  const cache = new Map<RefList, Counts>();
  const countsOf = (l: RefList) => cache.get(l) ?? cache.set(l, toCounts(index, l.main)).get(l)!;
  const canon = (n: string) => normalizeName(index.getCard(n)?.name ?? n);
  const shown = new Map((JSON.parse(readFileSync(LISTS_FROM, "utf8")).results as { id: string; borrow?: string[] }[]).filter((r) => r?.borrow?.length).map((r) => [r.id, r.borrow!] as const));
  const client = new Anthropic();
  const out: Record<string, unknown>[] = [];
  let spent = 0;
  const save = (complete: boolean) => writeFileSync(OUT, JSON.stringify({ ranAt: new Date().toISOString(), model: model.id, listsFrom: LISTS_FROM, complete, results: out }, null, 1));
  const started = dry ? null : recordRun({ event: "started", script: "judge-test", file: OUT, tests: [], model: model.id, items: shown.size });

  const decks = [...shown].map(([id, names]) => {
    const it = items.get(id)!;
    const settled = settledLists(index, lists, it.target!, 30, 90);
    const keys = names.map(canon);
    const right = new Set(keys.filter((k) => settled.filter((s) => s.has(k)).length >= settled.length / 2));
    const borrowed = borrowedSpells(index, lists, it, countsOf);
    return { id, it, names, keys, right, strict: new Set(keys.filter((k) => borrowed.has(k))) };
  }).filter((d) => d.right.size > 0); // Decks with no right spell on their list can't be scored; they aren't sent.
  for (const d of decks) console.log(`${d.id.replace("holdout-", "").padEnd(30)} ${d.names.length} listed, right ${d.right.size}, borrowed spells ${d.strict.size}`);
  console.log(`${decks.length} decks; right spells ${decks.reduce((n, d) => n + d.right.size, 0)}, borrowed spells ${decks.reduce((n, d) => n + d.strict.size, 0)}, listed ${decks.reduce((n, d) => n + d.names.length, 0)}`);
  if (dry) return;

  let next = 0;
  async function worker() {
    for (let i = next++; i < decks.length; i = next++) {
      const d = decks[i];
      const requested = (d.it.keyCards ?? []).map((n) => index.getCard(n)).filter((c) => !!c);
      const order = [...d.names].sort((a, b) => hash(a + d.id) - hash(b + d.id));
      const line = (n: string) => {
        const c = index.getCard(n)!;
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
            content: `Format: ${d.it.format}. Date: ${d.it.before}.\nThe deck is built around: ${requested.map((c) => c!.name).join(", ")}.\n${requested.map((c) => `- ${c!.name} | ${c!.manaCost} ${c!.typeLine}: ${c!.text}`).join("\n")}\n\nCards to rate (little-played spells that real decks have run beside the requested cards):\n${order.map(line).join("\n")}`,
          },
        ],
        output_config: { effort: "high", format: zodOutputFormat(Ratings) },
      });
      const cost = costUsd(model, usageOf(model, msg.usage));
      spent += cost;
      const score = new Map((msg.parsed_output?.ratings ?? []).map((r) => [canon(r.card), r.score]));
      const scores = d.keys.map((k) => score.get(k) ?? 0);
      const listOrder = d.keys.map((_, j) => -j);
      const pick = (s: number[]) => d.keys.map((k, j) => ({ k, s: s[j], j })).sort((a, b) => b.s - a.s || a.j - b.j).slice(0, 3).map((x) => x.k);
      out.push({
        id: d.id,
        listed: d.names,
        right: [...d.right].map((k) => index.getCard(k)?.name ?? k),
        borrowed: [...d.strict].map((k) => index.getCard(k)?.name ?? k),
        ratings: msg.parsed_output?.ratings,
        unrated: d.keys.filter((k) => !score.has(k)).length,
        scores,
        top3: { opus: pick(scores), list: pick(listOrder) },
        costUsd: cost,
      });
      console.log(`${d.id.replace("holdout-", "").padEnd(30)} rated ${score.size}/${d.keys.length}, right spells rated ${d.keys.flatMap((k, j) => (d.right.has(k) ? [scores[j]] : [])).join(",") || "-"} | $${cost.toFixed(3)}`);
      save(false);
    }
  }
  await Promise.all(Array.from({ length: 4 }, worker));
  save(true);

  // Scores, over decks with at least one right and one wrong listed spell.
  const results = out as { id: string; scores: number[]; top3: { opus: string[]; list: string[] } }[];
  for (const [label, key] of [
    ["right = in half or more of the settled lists", "right"],
    ["right = borrowed spells (strict)", "strict"],
  ] as const) {
    const [opusAuc, listAuc, half] = [new Map<string, number>(), new Map<string, number>(), new Map<string, number>()];
    let top = { opus: 0, list: 0, decks: 0 };
    for (const r of results) {
      const d = decks.find((x) => x.id === r.id)!;
      const set = d[key];
      const pos = d.keys.flatMap((k, j) => (set.has(k) ? [j] : []));
      const neg = d.keys.flatMap((k, j) => (set.has(k) ? [] : [j]));
      if (!pos.length || !neg.length) continue;
      opusAuc.set(r.id, auc(pos.map((j) => r.scores[j]), neg.map((j) => r.scores[j])) * 100);
      listAuc.set(r.id, auc(pos.map((j) => -j), neg.map((j) => -j)) * 100);
      half.set(r.id, 50);
      top.opus += r.top3.opus.filter((k) => set.has(k)).length;
      top.list += r.top3.list.filter((k) => set.has(k)).length;
      top.decks++;
    }
    const vsCoin = pairedGain([opusAuc], [half]);
    const vsList = pairedGain([opusAuc], [listAuc]);
    const listVsCoin = pairedGain([listAuc], [half]);
    const s = (x: number) => `${x >= 0 ? "+" : ""}${x.toFixed(1)}`;
    console.log(`\n${label}: ${opusAuc.size} decks`);
    console.log(`  Opus rates a right spell above a wrong one ${(50 + vsCoin.gain).toFixed(0)}% of the time (95% range ${(50 + vsCoin.lo).toFixed(0)}-${(50 + vsCoin.hi).toFixed(0)}%)`);
    console.log(`  v20's list order puts it higher ${(50 + listVsCoin.gain).toFixed(0)}% of the time (${(50 + listVsCoin.lo).toFixed(0)}-${(50 + listVsCoin.hi).toFixed(0)}%); Opus minus list order ${s(vsList.gain)} (${s(vsList.lo)} to ${s(vsList.hi)})`);
    console.log(`  right spells in the top 3 per deck: Opus's ratings ${top.opus}, list order ${top.list} (of ${top.decks * 3} picks)`);
  }
  console.log(`\nTotal $${spent.toFixed(2)}`);
  recordRun({ event: "finished", script: "judge-test", file: OUT, tests: [], model: model.id, items: out.length, costUsd: Math.round(spent * 10000) / 10000, complete: out.length === decks.length, commit: started!.commit, dirty: started!.dirty });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
