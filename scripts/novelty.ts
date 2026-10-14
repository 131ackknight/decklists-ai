/**
 * How much of each answer is an existing deck? Two numbers per deck:
 *
 * - copy rate: the highest share of its main deck found card for card in a
 *   single real list (same format, last 90 days). 100% = a copied list.
 * - core overlap: the highest share of its nonland cards that are core cards
 *   (in 50%+ of lists) of one real archetype, and which archetype.
 *
 *   pnpm exec tsx scripts/novelty.ts evals/results/model-comparison/*-p1.json evals/results/harness-v2/*-p1.json
 *
 * Writes evals/results/novelty.json and prints averages by set and prompt type.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getFormat } from "../src/cards/formats";
import { loadCardIndex } from "../src/cards/load";
import { normalizeName } from "../src/cards/names";
import { landWeight } from "../src/checker/mana";

interface Line {
  qty: number;
  name: string;
}
interface RefList {
  format: string;
  date: string;
  strategy: string;
  main: Line[];
}

/** Prompts where an existing deck is the right answer; everything else asks for something new. */
const EXISTING_OK = new Set(["premodern-stock-goblins", "modern-tribal-brew", "pauper-budget-aggro", "legacy-sideboard-only", "premodern-paste-and-tune"]);

const index = loadCardIndex();
const canon = (n: string) => normalizeName(index.getCard(n)?.name ?? n);
const isLand = (n: string) => {
  const c = index.getCard(n);
  return c ? landWeight(c) > 0 : false;
};

const lists = readFileSync("data/reference-lists.jsonl", "utf8")
  .split("\n")
  .filter(Boolean)
  .map((l) => JSON.parse(l) as RefList);
const newest = lists.reduce((d, l) => (l.date > d ? l.date : d), "");
const since = new Date(Date.parse(newest) - 90 * 86_400_000).toISOString().slice(0, 10);

const byFormat = new Map<string, Map<string, number>[]>();
const core = new Map<string, Map<string, Map<string, number>>>(); // format -> strategy -> card -> copies
for (const f of new Set(lists.map((l) => l.format))) {
  const fl = lists.filter((l) => l.format === f && l.date > since);
  byFormat.set(
    f,
    fl.map((l) => {
      const m = new Map<string, number>();
      for (const c of l.main) m.set(canon(c.name), (m.get(canon(c.name)) ?? 0) + c.qty);
      return m;
    }),
  );
  const strategies = new Map<string, RefList[]>();
  for (const l of fl) strategies.set(l.strategy, [...(strategies.get(l.strategy) ?? []), l]);
  const cores = new Map<string, Map<string, number>>();
  for (const [s, ls] of strategies) {
    if (ls.length < 5) continue;
    const seen = new Map<string, { n: number; copies: number }>();
    for (const l of ls) {
      for (const c of l.main) {
        const k = canon(c.name);
        const r = seen.get(k) ?? { n: 0, copies: 0 };
        r.n++;
        r.copies += c.qty;
        seen.set(k, r);
      }
    }
    const coreCards = new Map<string, number>();
    for (const [k, r] of seen) if (r.n / ls.length >= 0.5 && !isLand(k)) coreCards.set(k, Math.round(r.copies / r.n));
    cores.set(s, coreCards);
  }
  core.set(f, cores);
}

const rows: Record<string, unknown>[] = [];
for (const file of process.argv.slice(2)) {
  const base = path.basename(file, ".json");
  const label = (file.includes("harness-v2") ? "v2-" : "v1-") + base.replace(/-p\d+$/, "");
  const run = JSON.parse(readFileSync(file, "utf8")) as {
    results: { id: string; sentFormat: string | null; deck?: { main: Line[]; format?: string } | null }[];
  };
  for (const r of run.results) {
    if (!r.deck) continue;
    const fmt = getFormat(r.deck.format ?? r.sentFormat ?? "")?.key;
    if (!fmt || !byFormat.has(fmt)) continue;
    const deck = new Map<string, number>();
    for (const c of r.deck.main) deck.set(canon(c.name), (deck.get(canon(c.name)) ?? 0) + c.qty);
    const total = [...deck.values()].reduce((a, b) => a + b, 0);
    let copy = 0;
    for (const real of byFormat.get(fmt)!) {
      let shared = 0;
      for (const [k, q] of deck) shared += Math.min(q, real.get(k) ?? 0);
      copy = Math.max(copy, shared / total);
    }
    const spells = [...deck].filter(([k]) => !isLand(k));
    const spellCount = spells.reduce((n, [, q]) => n + q, 0) || 1;
    let best = { strategy: "", overlap: 0 };
    for (const [s, cc] of core.get(fmt)!) {
      const shared = spells.reduce((n, [k, q]) => n + Math.min(q, cc.get(k) ?? 0), 0);
      if (shared / spellCount > best.overlap) best = { strategy: s, overlap: shared / spellCount };
    }
    rows.push({
      set: label,
      prompt: r.id,
      kind: EXISTING_OK.has(r.id) ? "existing deck is fine" : "asks for something new",
      copyRate: Math.round(copy * 100),
      coreOverlap: Math.round(best.overlap * 100),
      nearest: best.strategy,
    });
  }
}

const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
const sets = [...new Set(rows.map((r) => r.set as string))].sort();
const table = sets.flatMap((set) =>
  ["existing deck is fine", "asks for something new"].map((kind) => {
    const rs = rows.filter((r) => r.set === set && r.kind === kind);
    return {
      set,
      kind,
      decks: rs.length,
      avgCopyRate: avg(rs.map((r) => r.copyRate as number)),
      avgCoreOverlap: avg(rs.map((r) => r.coreOverlap as number)),
      copiedOver80: rs.filter((r) => (r.copyRate as number) >= 80).length,
    };
  }),
);
console.table(table);
writeFileSync("evals/results/novelty.json", JSON.stringify({ table, rows }, null, 1));
