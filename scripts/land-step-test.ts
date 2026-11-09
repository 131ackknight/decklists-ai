/**
 * The owner's land step, tested on saved decks (2026-11-08): "add a land step, like reads cards if it needs
 * extra lands, and making sure the manabase makes sense."
 *
 *   pnpm exec tsx scripts/land-step-test.ts [--dry] [--model claude-opus-5-5] [--from holdout-v13-claude-opus-5-5.json]
 *
 * For each dev deck (holdout-v1) in a saved run, one call sees the request, the whole main deck with every
 * card's text, and the format's usual split of basic and nonbasic lands (lists in the 90 days before the
 * deck's date), and revises only the mana base, changing as few spell copies as it can if the land count
 * moves. A revision counts only if every card exists, was legal in the format on that date (the time-cut card
 * pool), the deck stays at its size, and at most 6 spell copies change; otherwise the deck stays as built.
 * Scored on the same decks before and after: lands shared with the settled lists, Added and match, paired
 * by deck (evals/protocol.ts pairedGain). --dry prints the land facts and spends nothing. Results save after
 * every deck; the run is recorded in evals/runs.jsonl.
 */
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { readFileSync, writeFileSync } from "node:fs";
import { z } from "zod";
import { getFormat } from "../src/cards/formats";
import { loadCardIndex } from "../src/cards/load";
import { FileDataSource } from "../src/data/source";
import { costUsd, MODELS, usageOf } from "../src/harness/models";
import { recordRun } from "../evals/register";
import { pairedGain } from "../evals/protocol";
import { isLand, round4Items, toCounts, type Line } from "../evals/round4/items";
import { addedScore, earlierLists, loadLists, overlap, settledLists, type Counts, type RefList } from "../evals/score";
import { testById } from "../evals/tests";

try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local: rely on the environment.
}

const DAY = 86_400_000;
const arg = (name: string, fallback: string) => (process.argv.includes(`--${name}`) ? process.argv[process.argv.indexOf(`--${name}`) + 1] : fallback);
const dry = process.argv.includes("--dry");
const model = MODELS[arg("model", "claude-opus-5-5")];
const FROM = `evals/results/round4/${arg("from", "holdout-v13-claude-opus-5-5.json")}`;
const OUT = `evals/results/round4/land-step-${arg("from", "holdout-v13-claude-opus-5-5.json").replace(/\.json$/, "")}.json`;
const MAX_SPELL_CHANGES = 6;
const Revised = z.object({ main: z.array(z.object({ qty: z.number().int().min(1), name: z.string() })), changes: z.string() });

async function main() {
  const index = loadCardIndex();
  const items = new Map(round4Items(index).map((it) => [it.id, it]));
  const lists = loadLists(String(testById("tuning-v1").params.dataThrough));
  const history = await FileDataSource.load("data/reference-lists-all.jsonl", index);
  const cache = new Map<RefList, Counts>();
  const countsOf = (l: RefList) => cache.get(l) ?? cache.set(l, toCounts(index, l.main)).get(l)!;
  const land = (k: string) => isLand(index, k);
  const basic = (k: string) => /\bBasic\b/.test(index.getCard(k)?.typeLine ?? "");
  const part = (m: Counts, keep: (k: string) => boolean) => new Map([...m].filter(([k]) => keep(k)));
  const total = (m: Counts) => [...m.values()].reduce((a, b) => a + b, 0);
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
  const decks = (JSON.parse(readFileSync(FROM, "utf8")).results as { id: string; deck: { main: Line[] } | null }[]).filter((r) => r?.deck && testById("holdout-v1").items.includes(r.id));
  const client = new Anthropic();
  const out: Record<string, unknown>[] = [];
  let spent = 0;
  const save = (complete: boolean) => writeFileSync(OUT, JSON.stringify({ ranAt: new Date().toISOString(), model: model.id, from: FROM, complete, results: out }, null, 1));
  const started = dry ? null : recordRun({ event: "started", script: "land-step-test", file: OUT, tests: [], model: model.id, items: decks.length });

  const facts = (id: string) => {
    const it = items.get(id)!;
    const before = it.before ?? it.target!.firstSeen;
    const cut = Date.parse(before);
    const recent = lists.filter((l) => l.format === it.target!.format && Date.parse(l.date) < cut && Date.parse(l.date) >= cut - 90 * DAY).map(countsOf);
    return {
      it,
      before,
      lands: mean(recent.map((l) => total(part(l, land)))),
      basics: mean(recent.map((l) => total(part(l, (k) => land(k) && basic(k))))),
      nonbasics: mean(recent.map((l) => total(part(l, (k) => land(k) && !basic(k))))),
    };
  };
  if (dry) {
    for (const d of decks) {
      const f = facts(d.id);
      console.log(`${d.id.replace("holdout-", "").padEnd(30)} ${f.it.format}: real decks ${f.lands.toFixed(1)} lands (${f.basics.toFixed(1)} basic, ${f.nonbasics.toFixed(1)} nonbasic); this deck ${total(part(toCounts(index, d.deck!.main), land))}`);
    }
    return;
  }

  let next = 0;
  async function worker() {
    for (let i = next++; i < decks.length; i = next++) {
      const d = decks[i];
      const f = facts(d.id);
      const pool = index.asOf(f.before, history.cardsPlayedThrough(f.before));
      const key = getFormat(f.it.format!)!.key;
      const line = (l: Line) => {
        const c = pool.getCard(l.name) ?? index.getCard(l.name);
        return c ? `${l.qty} ${c.name} | ${c.manaCost} ${c.typeLine}: ${c.text}` : `${l.qty} ${l.name}`;
      };
      const msg = await client.messages.parse({
        model: model.id,
        max_tokens: 16000,
        system: "You are a strong Magic: The Gathering deck builder. You revise the mana base of a deck someone else built, without changing its plan.",
        messages: [
          {
            role: "user",
            content: [
              `Format: ${f.it.format}. Date: ${f.before}.`,
              `The player asked: ${f.it.prompt}`,
              `The deck's main deck (${total(toCounts(index, d.deck!.main))} cards):\n${d.deck!.main.map(line).join("\n")}`,
              `In ${f.it.format} decks from the 90 days before this date, the average main deck runs ${f.lands.toFixed(1)} lands: ${f.basics.toFixed(1)} basic and ${f.nonbasics.toFixed(1)} nonbasic.`,
              "Revise only the mana base. Read the spells for what they need from the lands (extra land drops, lands in the graveyard, sacrificing or discarding lands, fast mana, how much colored mana they ask for, utility lands that fit the plan), and check the land count and the colored sources. Change lands where that makes the deck better and keep what is already right. If the land count should change, change as few spell copies as you can to keep the deck's size. Use only real cards that were legal in the format on that date. Return the whole main deck, and the changes in a few lines.",
            ].join("\n\n"),
          },
        ],
        output_config: { effort: "high", format: zodOutputFormat(Revised) },
      });
      const cost = costUsd(model, usageOf(model, msg.usage));
      spent += cost;
      const before = toCounts(index, d.deck!.main);
      const revised = msg.parsed_output;
      const problems: string[] = [];
      let after: Counts = before;
      if (!revised) problems.push("no parsed output");
      else {
        for (const l of revised.main) {
          const c = pool.getCard(l.name);
          if (!c) problems.push(`not in the card pool on ${f.before}: ${l.name}`);
          else if (!["legal", "restricted"].includes(c.legal[key] ?? "")) problems.push(`not legal in ${f.it.format}: ${c.name}`);
        }
        const candidate = toCounts(index, revised.main);
        if (total(candidate) !== total(before)) problems.push(`${total(candidate)} cards, not ${total(before)}`);
        const spellsChanged = [...new Set([...before.keys(), ...candidate.keys()])].filter((k) => !land(k)).reduce((n, k) => n + Math.abs((before.get(k) ?? 0) - (candidate.get(k) ?? 0)), 0);
        if (spellsChanged > MAX_SPELL_CHANGES) problems.push(`${spellsChanged} spell copies changed (most allowed ${MAX_SPELL_CHANGES})`);
        if (!problems.length) after = candidate;
      }
      out.push({ id: d.id, used: !problems.length, problems, changes: revised?.changes, before: d.deck!.main, after: [...after].map(([k, q]) => ({ qty: q, name: index.getCard(k)?.name ?? k })), costUsd: cost });
      console.log(`${d.id.replace("holdout-", "").padEnd(30)} ${problems.length ? `kept as built: ${problems.slice(0, 2).join("; ")}` : `revised: lands ${total(part(before, land))} -> ${total(part(after, land))}`} | $${cost.toFixed(3)}`);
      save(false);
    }
  }
  await Promise.all(Array.from({ length: 4 }, worker));
  save(true);

  // Before vs after on the same decks.
  const settledOf = new Map(decks.map((d) => [d.id, settledLists(index, lists, items.get(d.id)!.target!, 30, 90)] as const));
  const earlierOf = new Map(decks.map((d) => [d.id, earlierLists(lists, items.get(d.id)!.target!.format, facts(d.id).before, countsOf)] as const));
  const results = out as { id: string; used: boolean; before: Line[]; after: Line[] }[];
  const measure = (pick: (r: (typeof results)[number]) => Line[], f: (id: string, d: Counts) => number) => new Map(results.map((r) => [r.id, f(r.id, toCounts(index, pick(r)))]));
  const s = (x: number) => `${x >= 0 ? "+" : ""}${x.toFixed(1)}`;
  console.log(`\n${results.filter((r) => r.used).length} of ${results.length} revisions passed the checks`);
  for (const [name, f] of [
    ["Lands shared with the settled lists", (id: string, d: Counts) => mean(settledOf.get(id)!.map((st) => overlap(part(d, land), part(st, land))))],
    ["Added", (id: string, d: Counts) => addedScore(d, settledOf.get(id)!, earlierOf.get(id)!).added],
    ["Match %", (id: string, d: Counts) => addedScore(d, settledOf.get(id)!, earlierOf.get(id)!).match],
    ["Basic lands", (_: string, d: Counts) => total(part(d, (k) => land(k) && basic(k)))],
  ] as const) {
    const [b, a] = [measure((r) => r.before, f), measure((r) => r.after, f)];
    const g = pairedGain([a], [b]);
    console.log(`  ${name.padEnd(36)} before ${mean([...b.values()]).toFixed(1)} | after ${mean([...a.values()]).toFixed(1)} | change ${s(g.gain)} (${s(g.lo)} to ${s(g.hi)})`);
  }
  console.log(`\nTotal $${spent.toFixed(2)}`);
  recordRun({ event: "finished", script: "land-step-test", file: OUT, tests: [], model: model.id, items: out.length, costUsd: Math.round(spent * 10000) / 10000, complete: out.length === decks.length, commit: started!.commit, dirty: started!.dirty });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
