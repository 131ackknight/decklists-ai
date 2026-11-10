/**
 * What would a color rule do? (2026-11-10). Free: reads result files. Owner: "Colors and lands i think".
 *
 *   pnpm exec tsx scripts/color-rule-check.ts          (HARNESS=v0 for another version)
 *
 * The rule: a brew stays in the colors of the cards the prompt names. For each saved dev build this says
 * whether the rule would flag it (the deck has a color outside the named cards'), under three readings of
 * "the deck's colors" and "the named cards' colors", and whether the flagged builds had the real deck's
 * colors anyway. The per-deck lines show each build as colors on 4+ cards / colors of mana its spells need.
 */
import { readFileSync } from "node:fs";
import { loadCardIndex } from "../src/cards/load";
import { deckColors } from "../src/harness/lands";
import { latestRuns } from "../evals/register";
import { isLand, round4Items, toCounts, type Line } from "../evals/round4/items";
import { loadLists, settledLists, type Counts } from "../evals/score";
import { sameItems, testById } from "../evals/tests";

const index = loadCardIndex();
const items = new Map(round4Items(index).map((it) => [it.id, it]));
const lists = loadLists(String(testById("tuning-v1").params.dataThrough));
const ids = testById("holdout-v2").items;
const harness = process.env.HARNESS ?? "v22";
const runs = latestRuns().finished.filter((r) => r.model === "claude-opus-5-5" && r.harness === harness && (r.tests.includes("holdout-v2") || r.tests.some((x) => sameItems(x, "holdout-v2"))));
const decks = runs.map((r) => new Map((JSON.parse(readFileSync(r.file, "utf8")).results as ({ id: string; deck: { main: Line[] } | null } | null)[]).flatMap((x) => (x?.deck ? [[x.id, toCounts(index, x.deck.main)] as const] : []))));
const land = (k: string) => isLand(index, k);
const cardColors = (m: Counts) => {
  const n = new Map<string, number>();
  for (const [k, q] of m) if (!land(k)) for (const c of index.getCard(k)?.colors ?? []) n.set(c, (n.get(c) ?? 0) + q);
  return [...n].filter(([, q]) => q >= 4).map(([c]) => c).sort().join("") || "C";
};
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const pct = (x: number) => `${Math.round(x * 100)}%`;

type Row = { id: string; real: string; namedColors: string; namedIdentity: string; build: string; needs: string; right: boolean; match: number };
const rows: Row[] = [];
for (const id of ids) {
  const it = items.get(id)!;
  const settled = settledLists(index, lists, it.target!, 30, 90);
  const votes = new Map<string, number>();
  for (const l of settled) votes.set(cardColors(l), (votes.get(cardColors(l)) ?? 0) + 1);
  const real = [...votes].sort((a, b) => b[1] - a[1])[0][0];
  const named = (it.keyCards ?? []).map((n) => index.getCard(n)).filter((c) => c && !/\bLand\b/.test(c.typeLine.split(" // ")[0]));
  const union = (f: (c: NonNullable<(typeof named)[number]>) => string[]) => [...new Set(named.flatMap((c) => f(c!)))].sort().join("") || "C";
  for (const d of decks) {
    const b = d.get(id);
    if (!b) continue;
    rows.push({
      id,
      real,
      namedColors: union((c) => c.colors),
      namedIdentity: union((c) => c.identity),
      build: cardColors(b),
      needs: [...deckColors(index, b)].sort().join("") || "C",
      right: cardColors(b) === real,
      match: mean(settled.map((l) => [...b].reduce((a, [k, q]) => a + Math.min(q, l.get(k) ?? 0), 0))) / 0.6,
    });
  }
}
const extra = (deck: string, allowed: string) => deck.split("").filter((c) => c !== "C" && !allowed.includes(c)).join("");
for (const [label, allowedOf, deckOf] of [
  ["allowed = named cards' colors; deck = colors on 4+ cards", (r: Row) => r.namedColors, (r: Row) => r.build],
  ["allowed = named cards' colors; deck = mana the spells need", (r: Row) => r.namedColors, (r: Row) => r.needs],
  ["allowed = named cards' color identity; deck = mana the spells need", (r: Row) => r.namedIdentity, (r: Row) => r.needs],
] as [string, (r: Row) => string, (r: Row) => string][]) {
  const flagged = rows.filter((r) => extra(deckOf(r), allowedOf(r)));
  const clean = rows.filter((r) => !extra(deckOf(r), allowedOf(r)));
  console.log(`${label}:`);
  console.log(`  flagged ${flagged.length} of ${rows.length} builds (${pct(flagged.length / rows.length)}), on ${new Set(flagged.map((r) => r.id)).size} decks; right colors when flagged ${pct(mean(flagged.map((r) => (r.right ? 1 : 0))))}, when not ${pct(mean(clean.map((r) => (r.right ? 1 : 0))))}; match when flagged ${mean(flagged.map((r) => r.match)).toFixed(1)}, when not ${mean(clean.map((r) => r.match)).toFixed(1)}`);
  const perDeck = ids.map((id) => ({ id, allowed: allowedOf(rows.find((r) => r.id === id)!), real: rows.find((r) => r.id === id)!.real }));
  console.log(`  the allowed colors equal the real deck's on ${perDeck.filter((d) => d.allowed === d.real).length} of ${perDeck.length} decks; the real deck has a color outside them on ${perDeck.filter((d) => extra(d.real, d.allowed)).length}`);
}
console.log(`\nright colors now: ${pct(mean(rows.map((r) => (r.right ? 1 : 0))))}`);
for (const id of ids) {
  const rs = rows.filter((r) => r.id === id);
  console.log(`  ${id.replace("holdout-", "").padEnd(28)} real ${rs[0].real.padEnd(5)} named ${rs[0].namedColors.padEnd(5)} identity ${rs[0].namedIdentity.padEnd(5)} builds ${rs.map((r) => `${r.build}/${r.needs}`).join("  ")}`);
}
