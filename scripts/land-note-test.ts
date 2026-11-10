/**
 * A land note, with the AI making the swaps, tested on saved decks (2026-11-10). Owner: "Yes, test it".
 *
 *   pnpm exec tsx scripts/land-note-test.ts [--dry] [--model claude-opus-5-5] [--from holdout-v22-claude-opus-5-5.json] [--max-usd 2.5]
 *
 * For each dev deck (holdout-v2) in a saved run: the land note the brewer would get at submit
 * (src/harness/lands.ts: the deck's basic lands against the format's recent decks with as many colors,
 * and the color-fixing lands those decks play that it has fewer of). A deck with no note is left as
 * built, with no call. For the others one call sees the request, the whole main deck with every card's
 * text, the note and the named lands' text, and revises only the mana base. A revision counts only if
 * every card is in the card pool and legal in the format on the deck's date (v22's pool), the deck keeps
 * its size, and at most 6 spell copies change; otherwise the deck stays as built.
 *
 * Scored on the same decks before and after, as holdout-v2 scores them: lands shared with the settled
 * lists, Added, match and basic lands, paired by deck (evals/protocol.ts pairedGain). Beside it, the
 * code-only swap on the same decks (the note's own swaps, made by landAdvice with no call). --dry prints
 * the notes and the code-only result and spends nothing. --max-usd stops new calls once the spend
 * reaches it. Results save after every deck; the run is recorded in evals/runs.jsonl.
 */
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { readFileSync, writeFileSync } from "node:fs";
import { z } from "zod";
import { loadCardIndex } from "../src/cards/load";
import { loadStandardWindows } from "../src/cards/standard";
import type { Card } from "../src/cards/types";
import { FileDataSource } from "../src/data/source";
import { applyLandSwaps, deckColors, landAdvice, landNote, usualLands } from "../src/harness/lands";
import { costUsd, MODELS, usageOf } from "../src/harness/models";
import { recordRun } from "../evals/register";
import { pairedGain } from "../evals/protocol";
import { isLand, round4Items, toCounts, type Line } from "../evals/round4/items";
import { addedScore, earlierLists, legalOnDateView, loadLists, settledLists, type Counts, type RefList } from "../evals/score";
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
const maxUsd = Number(arg("max-usd", "2.5"));
const FROM = `evals/results/round4/${arg("from", "holdout-v22-claude-opus-5-5.json")}`;
const OUT = `evals/results/round4/land-note-${arg("from", "holdout-v22-claude-opus-5-5.json").replace(/\.json$/, "")}.json`;
const MAX_SPELL_CHANGES = 6;
const Revised = z.object({ main: z.array(z.object({ qty: z.number().int().min(1), name: z.string() })), changes: z.string() });

async function main() {
  const index = loadCardIndex();
  const items = new Map(round4Items(index).map((it) => [it.id, it]));
  const lists = loadLists(String(testById("tuning-v1").params.dataThrough));
  const history = await FileDataSource.load("data/reference-lists-all.jsonl", index);
  const windows = loadStandardWindows();
  const cache = new Map<RefList, Counts>();
  const countsOf = (l: RefList) => cache.get(l) ?? cache.set(l, toCounts(index, l.main)).get(l)!;
  const ranked = new Map<Counts, string[]>();
  const rankedOf = (l: Counts) => ranked.get(l) ?? ranked.set(l, deckColors(index, l, true)).get(l)!;
  const land = (k: string) => isLand(index, k);
  const basic = (k: string) => land(k) && /\bBasic\b/.test(index.getCard(k)?.typeLine ?? "");
  const total = (m: Counts, keep: (k: string) => boolean = () => true) => [...m].reduce((a, [k, q]) => a + (keep(k) ? q : 0), 0);
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
  const keyOf = (name: string) => [...toCounts(index, [{ qty: 1, name }]).keys()][0];
  const legalView = legalOnDateView(index, lists, countsOf);
  const decks = (JSON.parse(readFileSync(FROM, "utf8")).results as { id: string; deck: { main: Line[] } | null }[]).filter((r) => r?.deck && testById("holdout-v2").items.includes(r.id));

  /** Everything the note needs for one deck, from data before its date. */
  const facts = (id: string, main: Line[]) => {
    const it = items.get(id)!;
    const format = it.target!.format;
    const before = it.before ?? it.target!.firstSeen;
    const cut = Date.parse(before);
    const pool = index.asOf(before, history.cardsPlayedThrough(before), windows);
    const legal = (c: Card) => ["legal", "restricted"].includes(pool.getCard(c.name)?.legal[format] ?? "");
    const deck = toCounts(index, main);
    const colors = deckColors(index, deck);
    const same = lists
      .filter((l) => l.format === format && Date.parse(l.date) < cut && Date.parse(l.date) >= cut - 90 * DAY)
      .map(countsOf)
      .filter((l) => rankedOf(l).length === colors.length)
      .map((l) => ({ deck: l, colors: rankedOf(l) }));
    const usual = usualLands(index, same, colors, legal);
    const advice = usual ? landAdvice(index, deck, usual) : null;
    const note = usual && advice ? landNote(it.format, colors.length, usual, advice) : null;
    const codeOnly = advice ? (applyLandSwaps(index, deck, advice.swaps, keyOf) as Counts) : deck;
    return { it, format, before, pool, legal, deck, colors, advice, note, codeOnly };
  };

  const out: Record<string, unknown>[] = [];
  let spent = 0;
  const save = (complete: boolean) => writeFileSync(OUT, JSON.stringify({ ranAt: new Date().toISOString(), model: model.id, from: FROM, complete, results: out }, null, 1));
  const linesOf = (m: Counts) => [...m].map(([k, q]) => ({ qty: q, name: index.getCard(k)?.name ?? k }));
  const report = () => {
    const results = out as { id: string; used: boolean; note: string | null; before: Line[]; after: Line[]; codeOnly: Line[] }[];
    const settledOf = new Map(results.map((r) => [r.id, settledLists(index, lists, items.get(r.id)!.target!, 30, 90)] as const));
    const dateOf = (id: string) => items.get(id)!.before ?? items.get(id)!.target!.firstSeen;
    const viewOf = (id: string, d: Counts) => legalView(d, items.get(id)!.target!.format, dateOf(id));
    const earlierOf = new Map(results.map((r) => [r.id, earlierLists(lists, items.get(r.id)!.target!.format, dateOf(r.id), countsOf)] as const));
    const measure = (pick: (r: (typeof results)[number]) => Line[], f: (id: string, d: Counts) => number) => new Map(results.map((r) => [r.id, f(r.id, toCounts(index, pick(r)))]));
    const s = (x: number) => `${x >= 0 ? "+" : ""}${x.toFixed(2)}`;
    const measures = [
      ["Lands shared with the settled lists", (id: string, d: Counts) => mean(settledOf.get(id)!.map((st) => [...viewOf(id, d)].reduce((a, [k, q]) => a + (land(k) ? Math.min(q, st.get(k) ?? 0) : 0), 0)))],
      ["Added", (id: string, d: Counts) => addedScore(d, settledOf.get(id)!, earlierOf.get(id)!, (x) => viewOf(id, x)).added],
      ["Match %", (id: string, d: Counts) => addedScore(d, settledOf.get(id)!, earlierOf.get(id)!, (x) => viewOf(id, x)).match],
      ["Basic lands", (_: string, d: Counts) => total(d, basic)],
    ] as const;
    for (const [label, pick] of [
      ["The AI's revision", (r: (typeof results)[number]) => r.after],
      ["The code-only swap", (r: (typeof results)[number]) => r.codeOnly],
    ] as const) {
      console.log(`\n${label}, ${results.length} decks (${results.filter((r) => r.note).length} got a note):`);
      for (const [name, f] of measures) {
        const [b, a] = [measure((r) => r.before, f), measure(pick, f)];
        const g = pairedGain([a], [b]);
        console.log(`  ${name.padEnd(36)} before ${mean([...b.values()]).toFixed(1)} | after ${mean([...a.values()]).toFixed(1)} | change ${s(g.gain)} (${s(g.lo)} to ${s(g.hi)})`);
      }
    }
  };

  if (dry) {
    for (const d of decks) {
      const f = facts(d.id, d.deck!.main);
      console.log(`\n== ${d.id} (${f.colors.join("") || "colorless"})${f.note ? "" : ": no note"}`);
      if (f.note) console.log(f.note);
      out.push({ id: d.id, used: false, note: f.note, before: d.deck!.main, after: d.deck!.main, codeOnly: linesOf(f.codeOnly) });
    }
    console.log(`\n${out.filter((r) => r.note).length} of ${decks.length} decks would get a note (one call each).`);
    report();
    return;
  }

  const client = new Anthropic();
  const started = recordRun({ event: "started", script: "land-note-test", file: OUT, tests: [], model: model.id, items: decks.length });
  let next = 0;
  let stopped = false;
  async function worker() {
    for (let i = next++; i < decks.length; i = next++) {
      const d = decks[i];
      const f = facts(d.id, d.deck!.main);
      const base = { id: d.id, note: f.note, before: d.deck!.main, codeOnly: linesOf(f.codeOnly) };
      if (!f.note) {
        out.push({ ...base, used: false, problems: [], after: d.deck!.main, costUsd: 0 });
        console.log(`${d.id.replace("holdout-", "").padEnd(30)} no note: kept as built`);
        save(false);
        continue;
      }
      if (spent >= maxUsd) {
        stopped = true;
        break;
      }
      const line = (l: Line) => {
        const c = f.pool.getCard(l.name) ?? index.getCard(l.name);
        return c ? `${l.qty} ${c.name} | ${c.manaCost} ${c.typeLine}: ${c.text}` : `${l.qty} ${l.name}`;
      };
      const named = f.advice!.missing.map((m) => f.pool.getCard(m.name)).filter((c): c is Card => !!c);
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
              `The deck's main deck (${total(f.deck)} cards):\n${d.deck!.main.map(line).join("\n")}`,
              f.note,
              `The lands named above:\n${named.map((c) => `${c.name} | ${c.typeLine}: ${c.text}`).join("\n")}`,
              "Revise only the mana base. Follow the note where it makes the deck better: read the spells for what they need from the lands (basic land types they count or fetch, how much colored mana they ask for, utility lands that fit the plan), and keep any basic land a card needs. If the land count should change, change as few spell copies as you can to keep the deck's size. Use only real cards that were legal in the format on that date. Return the whole main deck, and the changes in a few lines.",
            ].join("\n\n"),
          },
        ],
        output_config: { effort: "high", format: zodOutputFormat(Revised) },
      });
      const cost = costUsd(model, usageOf(model, msg.usage));
      spent += cost;
      const revised = msg.parsed_output;
      const problems: string[] = [];
      let after: Counts = f.deck;
      if (!revised) problems.push("no parsed output");
      else {
        for (const l of revised.main) {
          const c = f.pool.getCard(l.name);
          if (!c) problems.push(`not in the card pool on ${f.before}: ${l.name}`);
          else if (!f.legal(c)) problems.push(`not legal in ${f.it.format}: ${c.name}`);
        }
        const candidate = toCounts(index, revised.main);
        if (total(candidate) !== total(f.deck)) problems.push(`${total(candidate)} cards, not ${total(f.deck)}`);
        const spellsChanged = [...new Set([...f.deck.keys(), ...candidate.keys()])].filter((k) => !land(k)).reduce((n, k) => n + Math.abs((f.deck.get(k) ?? 0) - (candidate.get(k) ?? 0)), 0);
        if (spellsChanged > MAX_SPELL_CHANGES) problems.push(`${spellsChanged} spell copies changed (most allowed ${MAX_SPELL_CHANGES})`);
        if (!problems.length) after = candidate;
      }
      out.push({ ...base, used: !problems.length, problems, changes: revised?.changes, after: linesOf(after), costUsd: cost });
      console.log(
        `${d.id.replace("holdout-", "").padEnd(30)} ${problems.length ? `kept as built: ${problems.slice(0, 2).join("; ")}` : `revised: basics ${total(f.deck, basic)} -> ${total(after, basic)}, lands ${total(f.deck, land)} -> ${total(after, land)}`} | $${cost.toFixed(3)}  [total $${spent.toFixed(2)}]`,
      );
      save(false);
    }
  }
  await Promise.all(Array.from({ length: 4 }, worker));
  const complete = out.length === decks.length;
  save(complete);
  const results = out as { used: boolean; note: string | null }[];
  console.log(`\n${results.filter((r) => r.note).length} of ${results.length} decks got a note; ${results.filter((r) => r.used).length} revisions passed the checks${stopped ? `; stopped at the $${maxUsd} cap` : ""}`);
  report();
  console.log(`\nTotal $${spent.toFixed(2)}`);
  recordRun({ event: "finished", script: "land-note-test", file: OUT, tests: [], model: model.id, items: out.length, costUsd: Math.round(spent * 10000) / 10000, complete, commit: started.commit, dirty: started.dirty });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
