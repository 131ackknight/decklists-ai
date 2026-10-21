/**
 * The two yardsticks on the future test decks (owner, 2026-10-22: "lets have a
 * specific Tuning Test and a Brewing Test").
 *
 *   pnpm exec tsx scripts/score-tests.ts evals/results/round4/future-<run>.json [...]
 *
 * Tuning Test: mean main deck overlap with the lists players settled on, a week
 * or more after the deck appeared (the same score as the future test so far).
 * Brewing Test: mean overlap with the deck's first lists, its first 7 days (the
 * inventor's version, before the crowd tuned it), plus the inventor's gems: core
 * nonland cards of those first lists (in 80%+ of them) that had under 5% play
 * in the format in the 90 days before, not counting the requested cards.
 * Decks with a single first-week list stay in the Tuning Test but not the
 * Brewing Test: one list is one player's choices, and it swung single decks by
 * 30 points between runs. Both split into spells and lands. No model calls.
 */
import { readFileSync } from "node:fs";
import { loadCardIndex } from "../src/cards/load";
import { normalizeName } from "../src/cards/names";
import { FileDataSource } from "../src/data/source";
import { isLand, round4Items, toCounts, type Line } from "../evals/round4/items";

const W = /^Cards?\s*\(\d+%?\)\s*$/i;
const DAY = 86_400_000;
type Counts = Map<string, number>;
const overlap = (a: Counts, b: Counts) => [...a].reduce((n, [k, q]) => n + Math.min(q, b.get(k) ?? 0), 0);
const only = (m: Counts, keep: (k: string) => boolean) => new Map([...m].filter(([k]) => keep(k)));
const sum = (m: Counts) => [...m.values()].reduce((a, b) => a + b, 0);

async function main() {
  const index = loadCardIndex();
  const history = await FileDataSource.load("data/reference-lists-all.jsonl", index);
  const raw = readFileSync("data/reference-lists-all.jsonl", "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as { format: string; date: string; strategy: string; main: Line[] })
    .map((l) => ({ ...l, main: l.main.filter((c) => !W.test(c.name)) }));
  const land = (k: string) => isLand(index, k);
  const runs = process.argv.slice(2).map((f) => ({
    file: f.split("/").pop()!.replace(/^future-|-claude-opus-5-5|\.json$/g, ""),
    results: new Map((JSON.parse(readFileSync(f, "utf8")).results as { id: string; deck: { main: Line[] } | null }[]).map((r) => [r.id, r])),
  }));

  // Mean overlap with a set of real lists, as a share of each real list's spells / lands / all.
  const score = (deck: Counts, real: Counts[]) => {
    const part = (keep: (k: string) => boolean) =>
      real.reduce((a, l) => a + overlap(only(deck, keep), only(l, keep)) / Math.max(1, sum(only(l, keep))), 0) / real.length;
    return { all: real.reduce((a, l) => a + overlap(deck, l) / sum(l), 0) / real.length, spells: part((k) => !land(k)), lands: part(land) };
  };

  const totals = new Map<string, { tune: number[]; tuneSpells: number[]; tuneLands: number[]; brew: number[]; brewSpells: number[]; gems: number; gemsOf: number }>();
  const rows: Record<string, string | number>[] = [];
  for (const it of round4Items(index).filter((i) => i.track === "future" && i.target)) {
    const t = it.target!;
    const first = Date.parse(t.firstSeen);
    const ofDeck = raw.filter((l) => l.format === t.format && l.strategy === t.strategy);
    const firstWeek = ofDeck.filter((l) => Date.parse(l.date) < first + 7 * DAY).map((l) => toCounts(index, l.main));
    const later = ofDeck.filter((l) => Date.parse(l.date) >= first + 7 * DAY);
    const step = Math.max(1, Math.floor(later.length / 50));
    const settled = later.filter((_, i) => i % step === 0).slice(0, 50).map((l) => toCounts(index, l.main));
    if (!firstWeek.length || !settled.length) continue;

    const before = history.cut(t.firstSeen);
    const asked = new Set((it.keyCards ?? []).map((k) => normalizeName(index.getCard(k)?.name ?? k)));
    const inFirst = new Map<string, number>();
    for (const l of firstWeek) for (const k of l.keys()) inFirst.set(k, (inFirst.get(k) ?? 0) + 1 / firstWeek.length);
    const gems = [...inFirst]
      .filter(([k, s]) => s >= 0.8 && !land(k) && !asked.has(normalizeName(index.getCard(k)?.name ?? k)))
      .map(([k]) => k)
      .filter((k) => (before.cardPlayRate(t.format, index.getCard(k)?.name ?? k)?.share ?? 0) < 0.05);

    const row: Record<string, string | number> = { deck: `${t.format} ${t.strategy}`, "first lists": firstWeek.length, gems: gems.length };
    for (const run of runs) {
      const r = run.results.get(it.id);
      if (!r?.deck) {
        row[run.file] = "no deck";
        continue;
      }
      const deck = toCounts(index, r.deck.main);
      const tune = score(deck, settled);
      const brew = score(deck, firstWeek);
      const found = gems.filter((g) => deck.has(g)).length;
      const tot = totals.get(run.file) ?? { tune: [], tuneSpells: [], tuneLands: [], brew: [], brewSpells: [], gems: 0, gemsOf: 0 };
      tot.tune.push(tune.all);
      tot.tuneSpells.push(tune.spells);
      tot.tuneLands.push(tune.lands);
      if (firstWeek.length >= 2) {
        tot.brew.push(brew.all);
        tot.brewSpells.push(brew.spells);
        tot.gems += found;
        tot.gemsOf += gems.length;
      }
      totals.set(run.file, tot);
      row[run.file] = `T ${Math.round(tune.all * 100)} / B ${Math.round(brew.all * 100)} / gems ${found}`;
    }
    rows.push(row);
  }
  console.table(rows);
  const mean = (a: number[]) => `${((a.reduce((x, y) => x + y, 0) / a.length) * 100).toFixed(1)}%`;
  console.table(
    [...totals].map(([run, t]) => ({
      run,
      "tune decks": t.tune.length,
      "brew decks": t.brew.length,
      "Tuning Test": mean(t.tune),
      "tune spells": mean(t.tuneSpells),
      "tune lands": mean(t.tuneLands),
      "Brewing Test": mean(t.brew),
      "brew spells": mean(t.brewSpells),
      gems: `${t.gems}/${t.gemsOf}`,
    })),
  );
}

main();
