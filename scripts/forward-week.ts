/**
 * The forward test: brew new decks the week they appear, before anyone
 * (model or us) has seen how they settle.
 *
 *   pnpm exec tsx scripts/forward-week.ts --merge data/export-latest/reference-lists/reference-lists.jsonl
 *   pnpm exec tsx scripts/forward-week.ts --since 2026-10-13 [--brew] [--harness v5,v2] [--model claude-opus-5-5]
 *
 * --merge adds a fresh Decklist Data export to data/reference-lists-all.jsonl
 * (deduplicated), so detection always runs on everything published so far.
 *
 * Detection: archetypes whose first list ever is on or after --since, in a
 * format with 45+ days of earlier data, labeled as a strategy (not a bare
 * color), and new (first lists share at most 40 of 60 main deck cards with any
 * earlier list). Same rules as scripts/find-new-archetypes.ts, minus the
 * "15+ lists in 90 days" test, which can only be applied later: a candidate
 * counts in the score only once it has 15+ lists in its first 90 days.
 * That rule is fixed here, before any result is known.
 *
 * --brew runs each harness on each new candidate with the data cut the day
 * before it appeared and the card pool as of that day, and records the brews
 * in evals/forward/brews/<first-seen>/<id>.<harness>.json plus a line in
 * evals/forward/ledger.jsonl. Commit them: the git history is the proof that
 * the brew came before the deck settled. Score with scripts/forward-score.ts.
 */
import Anthropic from "@anthropic-ai/sdk";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { loadCardIndex } from "../src/cards/load";
import { normalizeName } from "../src/cards/names";
import { FileDataSource } from "../src/data/source";
import { MODELS } from "../src/harness/models";
import { brew, brewV5, brewV6, brewV7, type BrewResult } from "../src/harness/run";

try {
  process.loadEnvFile(".env.local");
} catch {
  // CI sets ANTHROPIC_API_KEY.
}

const arg = (n: string, d?: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const HISTORY = "data/reference-lists-all.jsonl";
const LEDGER = "evals/forward/ledger.jsonl";
const DAY = 86_400_000;
const LEAD_DAYS = 45;
const NEW_MAX = 40;
const FIRST_LISTS = 5;
const WIDGET_ROW = /^Cards?\s*\(\d+%?\)\s*$/i;
const COLOR_NAMES = new Set([
  "azorius", "dimir", "rakdos", "gruul", "selesnya", "orzhov", "izzet", "golgari", "boros", "simic",
  "bant", "esper", "grixis", "jund", "naya", "abzan", "jeskai", "sultai", "mardu", "temur",
  "mono-white", "mono-blue", "mono-black", "mono-red", "mono-green", "colorless", "4-color", "5-color", "domain", "rogue",
]);

interface Line {
  qty: number;
  name: string;
}
interface RefList {
  format: string;
  date: string;
  event: string;
  eventType: string;
  place: number | null;
  record: string | null;
  archetype: string;
  strategy: string;
  main: Line[];
  side: Line[];
  commander: Line[];
  companion?: Line[];
}

const listKey = (l: RefList) =>
  `${l.format}|${l.date}|${l.event}|${l.strategy}|${[...l.main].sort((a, b) => a.name.localeCompare(b.name)).map((c) => `${c.qty}${c.name}`).join(",")}`;

function merge(file: string) {
  const have = new Set<string>();
  const existing = existsSync(HISTORY) ? readFileSync(HISTORY, "utf8").split("\n").filter(Boolean) : [];
  for (const line of existing) have.add(listKey(JSON.parse(line) as RefList));
  const fresh = readFileSync(file, "utf8").split("\n").filter(Boolean);
  const added: string[] = [];
  for (const line of fresh) {
    const k = listKey(JSON.parse(line) as RefList);
    if (!have.has(k)) {
      have.add(k);
      added.push(line);
    }
  }
  if (added.length) appendFileSync(HISTORY, (existing.length ? "" : "") + added.join("\n") + "\n");
  console.log(`merged ${file}: ${added.length} new lists (history now ${existing.length + added.length})`);
}

async function main() {
  const mergeFile = arg("merge");
  if (mergeFile) merge(mergeFile);
  const since = arg("since");
  if (!since) return;

  const index = loadCardIndex();
  const canon = (n: string) => normalizeName(index.getCard(n)?.name ?? n);
  const isLand = (n: string) => /\bLand\b/.test(index.getCard(n)?.typeLine.split(" // ")[0] ?? "");
  const counts = (lines: Line[]) => {
    const m = new Map<string, number>();
    for (const l of lines) if (!WIDGET_ROW.test(l.name)) m.set(canon(l.name), (m.get(canon(l.name)) ?? 0) + l.qty);
    return m;
  };
  const overlap = (a: Map<string, number>, b: Map<string, number>) => [...a].reduce((n, [k, q]) => n + Math.min(q, b.get(k) ?? 0), 0);

  const all = readFileSync(HISTORY, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as RefList)
    .filter((l) => l.format !== "duel")
    .sort((a, b) => a.date.localeCompare(b.date));
  const newest = all.at(-1)!.date;
  const byFormat = new Map<string, (RefList & { c: Map<string, number> })[]>();
  for (const l of all) byFormat.set(l.format, [...(byFormat.get(l.format) ?? []), { ...l, c: counts(l.main) }]);

  const ledger = existsSync(LEDGER) ? readFileSync(LEDGER, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
  const already = new Set(ledger.map((e: { id: string; harness: string }) => `${e.id}|${e.harness}`));

  interface Candidate {
    id: string;
    format: string;
    strategy: string;
    firstSeen: string;
    listsSoFar: number;
    closestEarlierOverlap: number;
    signature: string[];
  }
  const candidates: Candidate[] = [];
  for (const [format, lists] of byFormat) {
    const start = Date.parse(lists[0].date);
    const strategies = new Map<string, typeof lists>();
    for (const l of lists) strategies.set(l.strategy, [...(strategies.get(l.strategy) ?? []), l]);
    for (const [strategy, mine] of strategies) {
      const first = mine[0].date;
      if (first < since || COLOR_NAMES.has(strategy.toLowerCase())) continue;
      if (Date.parse(first) - start < LEAD_DAYS * DAY) continue;
      const before = lists.filter((l) => l.date < first);
      const closest = mine.slice(0, FIRST_LISTS).map((l) => Math.max(0, ...before.map((b) => overlap(l.c, b.c))));
      const median = [...closest].sort((a, b) => a - b)[Math.floor(closest.length / 2)];
      if (median > NEW_MAX) continue;
      const share = (ls: typeof lists) => {
        const m = new Map<string, number>();
        for (const l of ls) for (const k of l.c.keys()) if (!isLand(k)) m.set(k, (m.get(k) ?? 0) + 1 / ls.length);
        return m;
      };
      const inA = share(mine.slice(0, 10));
      const pre = share(before);
      const playedByCutoff = new Set(lists.filter((l) => l.date <= first).flatMap((l) => [...l.c.keys()]));
      const signature = [...inA]
        .filter(([key]) => (index.getCard(key)?.released ?? "") <= first || playedByCutoff.has(key))
        .map(([key, s]) => ({ card: (index.getCard(key)?.name ?? key).split(" // ")[0], inArchetype: s, before: pre.get(key) ?? 0 }))
        .filter((c) => c.inArchetype >= 0.8 && c.before <= 0.05)
        .sort((a, b) => b.inArchetype - b.before - (a.inArchetype - a.before))
        .slice(0, 3)
        .map((c) => c.card);
      if (!signature.length) continue;
      candidates.push({
        id: `fwd-${format}-${strategy.toLowerCase().replace(/\W+/g, "-")}-${first}`,
        format,
        strategy,
        firstSeen: first,
        listsSoFar: mine.length,
        closestEarlierOverlap: median,
        signature,
      });
    }
  }
  console.log(`data through ${newest}; ${candidates.length} archetypes first seen on or after ${since}:`);
  for (const c of candidates) console.log(`  ${c.id}: ${c.listsSoFar} lists so far, closest earlier ${c.closestEarlierOverlap}/60, around ${c.signature.join(", ")}`);
  if (!process.argv.includes("--brew") || !candidates.length) return;

  const harnesses = (arg("harness", "v5") as string).split(",");
  const modelId = arg("model", "claude-opus-5-5")!;
  const model = MODELS[modelId];
  if (!model) throw new Error(`Unknown model ${modelId}`);
  const history = await FileDataSource.load(HISTORY, index);
  const client = new Anthropic();
  const title = (f: string) => f[0].toUpperCase() + f.slice(1);
  const natural = (cards: string[]) => (cards.length <= 2 ? cards.join(" and ") : `${cards.slice(0, -1).join(", ")} and ${cards.at(-1)}`);
  let spent = 0;
  for (const c of candidates) {
    const pool = index.asOf(c.firstSeen, history.cardsPlayedThrough(c.firstSeen));
    const data = history.cut(c.firstSeen, pool);
    const req = { prompt: `Brew me a ${title(c.format)} deck built around ${natural(c.signature)}.`, format: title(c.format) };
    for (const h of harnesses) {
      if (already.has(`${c.id}|${h}`)) {
        console.log(`  ${c.id} ${h}: already brewed`);
        continue;
      }
      const deps = { index: pool, data };
      const r: BrewResult =
        h === "v7"
          ? await brewV7(client, model, req, deps, undefined, c.firstSeen)
          : h === "v6"
            ? await brewV6(client, model, req, deps)
            : h === "v5"
              ? await brewV5(client, model, req, deps)
              : await brew(client, model, req, deps);
      spent += r.costUsd;
      const sum = (xs: Line[]) => xs.reduce((n, x) => n + x.qty, 0);
      console.log(`  ${c.id} ${h}: ${r.deck ? `deck ${sum(r.deck.main)}+${sum(r.deck.side)}` : "no deck"}, $${r.costUsd.toFixed(3)}${r.error ? `, error: ${r.error}` : ""}`);
      const dir = `evals/forward/brews/${c.firstSeen}`;
      mkdirSync(dir, { recursive: true });
      const brewedAt = new Date().toISOString();
      writeFileSync(
        `${dir}/${c.id}.${h}.json`,
        JSON.stringify({ ...c, harness: h, model: modelId, brewedAt, dataThrough: newest, prompt: req.prompt, text: r.text, deck: r.deck, costUsd: r.costUsd, error: r.error }, null, 1),
      );
      mkdirSync("evals/forward", { recursive: true });
      appendFileSync(LEDGER, JSON.stringify({ id: c.id, format: c.format, strategy: c.strategy, firstSeen: c.firstSeen, harness: h, model: modelId, brewedAt, dataThrough: newest, hasDeck: !!r.deck }) + "\n");
    }
  }
  console.log(`spent $${spent.toFixed(2)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
