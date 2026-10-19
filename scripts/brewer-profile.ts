/**
 * What a known good brewer's public lists tell us.
 *
 *   pnpm exec tsx scripts/brewer-profile.ts evals/brewers/lists/<handle> [...]
 *
 * For each list: how much of it is one earlier list in the format (copy rate,
 * the same measure used on the AI's brews), whether it was the first list of
 * its archetype, and whether its archetype is in the brew holdout. Answers
 * "is this brewer's style a usable target?" and "did they originate decks we
 * test on?" without any model calls.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { loadCardIndex } from "../src/cards/load";
import { toCounts, type Line } from "../evals/round4/items";

const index = loadCardIndex();
const W = /^Cards?\s*\(\d+%?\)\s*$/i;
const hist = readFileSync("data/reference-lists-all.jsonl", "utf8")
  .split("\n")
  .filter(Boolean)
  .map((l) => JSON.parse(l) as { format: string; date: string; strategy: string; main: Line[] })
  .map((l) => ({ format: l.format, date: l.date, strategy: l.strategy, c: toCounts(index, l.main.filter((x) => !W.test(x.name))) }));
const firstOf = new Map<string, string>();
for (const l of [...hist].sort((a, b) => a.date.localeCompare(b.date))) {
  const k = `${l.format}:${l.strategy}`;
  if (!firstOf.has(k)) firstOf.set(k, l.date);
}
const holdout = new Set((JSON.parse(readFileSync("evals/brew-holdout/candidates.json", "utf8")) as { format: string; strategy: string }[]).map((c) => `${c.format}:${c.strategy}`));
const overlap = (a: Map<string, number>, b: Map<string, number>) => [...a].reduce((n, [k, q]) => n + Math.min(q, b.get(k) ?? 0), 0);

for (const dir of process.argv.slice(2)) {
  const rows: { date: string; format: string; strategy: string; copy: number; borrow: number; first: boolean; holdout: boolean; new: number }[] = [];
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".json")).sort()) {
    const d = JSON.parse(readFileSync(path.join(dir, f), "utf8"));
    const format = d.format.toLowerCase();
    const date = d.eventDate.slice(0, 10);
    const m = toCounts(index, d.main);
    const prior = hist.filter((l) => l.format === format && l.date < date);
    const copy = prior.reduce((b, l) => Math.max(b, overlap(m, l.c)), 0) / 60;
    // Borrowing from other decks only: the AI brews from scratch, so its decks have no earlier versions of themselves.
    const others = prior.filter((l) => l.strategy !== d.strategy);
    const borrow = others.reduce((b, l) => Math.max(b, overlap(m, l.c)), 0) / 60;
    // Nonland cards in no earlier list of the format in the last 90 days: new choices, not just new arrangements.
    const recent = new Set(prior.filter((l) => Date.parse(date) - Date.parse(l.date) < 90 * 86_400_000).flatMap((l) => [...l.c.keys()]));
    const fresh = [...m].filter(([k]) => !recent.has(k) && !/\bLand\b/.test(index.getCard(k)?.typeLine ?? "")).reduce((n, [, q]) => n + q, 0);
    const key = `${format}:${d.strategy}`;
    rows.push({ date, format, strategy: d.strategy, copy, borrow, first: firstOf.get(key) === date, holdout: holdout.has(key), new: fresh });
  }
  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
  const brews = rows.filter((r) => r.copy < 0.65);
  console.log(`\n${path.basename(dir)}: ${rows.length} lists, ${[...new Set(rows.map((r) => r.format))].join("/")}`);
  console.log(`  copy rate (share of deck in one earlier list): mean ${Math.round(avg(rows.map((r) => r.copy)) * 100)}%; under 65% ("brews"): ${brews.length} lists, mean ${Math.round(avg(brews.map((r) => r.copy)) * 100)}%`);
  const firsts = rows.filter((r) => r.first);
  console.log(`  borrowed from other archetypes' lists only: mean ${Math.round(avg(rows.map((r) => r.borrow)) * 100)}%; on brews ${Math.round(avg(brews.map((r) => r.borrow)) * 100)}%; on first-ever lists ${firsts.length ? Math.round(avg(firsts.map((r) => r.borrow)) * 100) + "%" : "n/a"}`);
  console.log(`  cards no one in the format played in the prior 90 days: mean ${avg(rows.map((r) => r.new)).toFixed(1)} per deck (brews ${avg(brews.map((r) => r.new)).toFixed(1)})`);
  console.log(`  first list ever of its archetype: ${rows.filter((r) => r.first).map((r) => `${r.strategy} (${r.date}${r.holdout ? ", in holdout" : ""})`).join("; ") || "none"}`);
  console.log(`  lists in holdout archetypes: ${rows.filter((r) => r.holdout).map((r) => `${r.strategy} ${r.date}`).join("; ") || "none"}`);
  console.log("  most original lists: " + [...rows].sort((a, b) => a.copy - b.copy).slice(0, 6).map((r) => `${r.strategy} ${r.date} (${Math.round(r.copy * 100)}%, ${r.new} new)`).join("; "));
}
