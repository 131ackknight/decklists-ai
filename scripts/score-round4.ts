/**
 * Score round 4 results against what real players did, plus no-model baselines.
 *
 *   pnpm exec tsx scripts/score-round4.ts [evals/results/round4/<run>.json ...]
 *
 * Fill in the blanks: of the 12 hidden nonland cards, how many the answer
 * restored exactly, and how many more it replaced with a card doing the same
 * job (sharing a specific function tag). Baselines: "most played" adds the
 * copies most of the archetype's recent lists run; "nearest list" fills from
 * the earlier list closest to what's left.
 *
 * Brew to archetype: main deck overlap with the owner's linked list and with
 * the lists players posted in the 60 days after it. Baseline: the best
 * overlap any visible list from before the date already had.
 *
 * Earlier near-copies of the owner's list are hidden, exactly as in the run.
 *
 * With no result files, prints only the baselines. Writes summary.json.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { loadCardIndex } from "../src/cards/load";
import type { CardIndex } from "../src/cards/card-index";
import { isLand, isNearCopy, round4Items, toCounts, type Line, type Round4Item } from "../evals/round4/items";

interface RefList {
  format: string;
  date: string;
  strategy: string;
  main: Line[];
}
interface Result {
  id: string;
  deck: { main: Line[] } | null;
  costUsd: number;
}

const WIDGET_ROW = /^Cards?\s*\(\d+%?\)\s*$/i;
const DAY = 86_400_000;
const index = loadCardIndex();
const items = round4Items(index);
const history = readFileSync("data/reference-lists-all.jsonl", "utf8")
  .split("\n")
  .filter(Boolean)
  .map((l) => JSON.parse(l) as RefList)
  .map((l) => ({ ...l, main: l.main.filter((c) => !WIDGET_ROW.test(c.name)) }));

/** Tags on more than 2% of cards say little about a card's job ("creature", "removal" stay; "has-flavor-text" goes). */
const tagCount = new Map<string, number>();
for (const c of index.cards) for (const t of c.tags) tagCount.set(t, (tagCount.get(t) ?? 0) + 1);
const specificTags = (name: string) => new Set((index.getCard(name)?.tags ?? []).filter((t) => (tagCount.get(t) ?? 0) < index.cards.length * 0.02));

const overlap = (a: Map<string, number>, b: Map<string, number>) => [...a].reduce((n, [k, q]) => n + Math.min(q, b.get(k) ?? 0), 0);
const sumOf = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0);
const diff = (a: Map<string, number>, b: Map<string, number>) =>
  new Map([...a].map(([k, q]) => [k, q - (b.get(k) ?? 0)] as const).filter(([, q]) => q > 0));

function scoreFill(it: Round4Item, added: Map<string, number>) {
  const hidden = toCounts(index, it.hidden!);
  const exact = overlap(added, hidden);
  // Same job: pair leftover added copies with leftover hidden copies sharing a specific tag.
  const extra = [...diff(added, hidden)].flatMap(([k, q]) => Array(q).fill(k) as string[]);
  const missed = [...diff(hidden, added)].flatMap(([k, q]) => Array(q).fill(k) as string[]);
  let role = 0;
  for (const a of extra) {
    const tags = specificTags(a);
    const j = missed.findIndex((m) => [...specificTags(m)].some((t) => tags.has(t)));
    if (j >= 0) {
      missed.splice(j, 1);
      role++;
    }
  }
  return { exact, role, added: sumOf(added) };
}

function archetypeLists(it: Round4Item, from: number, to: number) {
  const src = it.source!;
  return history.filter(
    (l) => l.format === src.format.toLowerCase() && l.strategy === src.strategy && Date.parse(l.date) >= from && Date.parse(l.date) < to,
  );
}

/** What the bot could see: lists before the item's date, minus near-copies of the owner's list. */
function visible(it: Round4Item, lists: RefList[]) {
  return lists.filter((l) => Date.parse(l.date) < Date.parse(it.before!) && !isNearCopy(index, it, l.main));
}

/** Copies most of the archetype's last 60 days of lists run, highest share first. */
function mostPlayed(it: Round4Item): Map<string, number> {
  const before = Date.parse(it.before!);
  const lists = visible(it, archetypeLists(it, before - 60 * DAY, before)).map((l) => toCounts(index, l.main));
  const partial = toCounts(index, it.partial!);
  const share = new Map<string, number>(); // "name|k" -> share of lists with at least k copies
  for (const m of lists) for (const [k, q] of m) for (let c = 1; c <= q; c++) share.set(`${k}|${c}`, (share.get(`${k}|${c}`) ?? 0) + 1 / lists.length);
  const picks = [...share]
    .map(([key, s]) => ({ name: key.split("|")[0], k: Number(key.split("|")[1]), s }))
    .filter((p) => !isLand(index, p.name) && (partial.get(p.name) ?? 0) < p.k)
    .sort((a, b) => b.s - a.s || a.name.localeCompare(b.name));
  const added = new Map<string, number>();
  for (const p of picks) {
    if (sumOf(added) >= 12) break;
    // Only the next copy up is allowed, so a 3rd copy never comes before the 2nd.
    if ((partial.get(p.name) ?? 0) + (added.get(p.name) ?? 0) === p.k - 1) added.set(p.name, (added.get(p.name) ?? 0) + 1);
  }
  return added;
}

/** Fill from the earlier list closest to what's left. */
function nearestList(it: Round4Item): Map<string, number> {
  const before = Date.parse(it.before!);
  const partial = toCounts(index, it.partial!);
  let best: Map<string, number> | null = null;
  let bestScore = -1;
  for (const l of visible(it, archetypeLists(it, 0, before))) {
    const m = toCounts(index, l.main);
    const s = overlap(partial, m);
    if (s > bestScore) [best, bestScore] = [m, s];
  }
  const added = new Map<string, number>();
  for (const [k, q] of diff(best ?? new Map(), partial)) {
    if (isLand(index, k)) continue;
    const take = Math.min(q, 12 - sumOf(added));
    if (take > 0) added.set(k, take);
  }
  return added;
}

const files = process.argv.slice(2);
const runs = files.map((f) => ({ file: f, results: new Map((JSON.parse(readFileSync(f, "utf8")).results as Result[]).filter(Boolean).map((r) => [r.id, r])) }));
const fillRows: Record<string, unknown>[] = [];
const brewRows: Record<string, unknown>[] = [];

for (const it of items.filter((i) => i.track === "fill")) {
  const row: Record<string, unknown> = { item: it.id };
  const fmt = (s: { exact: number; role: number }) => `${s.exact}+${s.role}`;
  row["most played"] = fmt(scoreFill(it, mostPlayed(it)));
  row["nearest list"] = fmt(scoreFill(it, nearestList(it)));
  for (const run of runs) {
    const r = run.results.get(it.id);
    if (!r) continue;
    if (!r.deck) {
      row[run.file] = "no deck";
      continue;
    }
    const final = toCounts(index, r.deck.main);
    const partial = toCounts(index, it.partial!);
    const s = scoreFill(it, diff(final, partial));
    const dropped = sumOf(diff(partial, final));
    row[run.file] = `${fmt(s)}${dropped ? ` (cut ${dropped} given)` : ""}`;
  }
  fillRows.push(row);
}

for (const it of items.filter((i) => i.track === "brew")) {
  const target = toCounts(index, it.source!.main);
  const before = Date.parse(it.before!);
  const later = archetypeLists(it, before + DAY, before + 61 * DAY).map((l) => toCounts(index, l.main));
  const pct = (n: number) => `${Math.round((n / 60) * 100)}%`;
  const vsLater = (m: Map<string, number>) => (later.length ? pct(later.reduce((a, l) => a + overlap(m, l), 0) / later.length) : "n/a");
  const prior = visible(it, history.filter((l) => l.format === it.source!.format.toLowerCase()));
  const floor = prior.reduce((b, l) => Math.max(b, overlap(toCounts(index, l.main), target)), 0);
  const row: Record<string, unknown> = { item: it.id, "later lists": later.length, "closest earlier list": pct(floor) };
  for (const run of runs) {
    const r = run.results.get(it.id);
    if (!r) continue;
    if (!r.deck) {
      row[run.file] = "no deck";
      continue;
    }
    const m = toCounts(index, r.deck.main);
    row[run.file] = `${pct(overlap(m, target))} / ${vsLater(m)}`;
  }
  brewRows.push(row);
}

console.log("Fill in the blanks: exact restores + same-job replacements, out of 12");
console.table(fillRows);
console.log("Brew to archetype: overlap with the linked list / mean overlap with lists in the 60 days after");
console.table(brewRows);
writeFileSync("evals/results/round4/summary.json", JSON.stringify({ files, fillRows, brewRows }, null, 1));
