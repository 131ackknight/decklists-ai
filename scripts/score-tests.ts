/**
 * The two yardsticks on the future test decks (owner, 2026-10-22: "lets have a
 * specific Tuning Test and a Brewing Test").
 *
 *   pnpm exec tsx scripts/score-tests.ts evals/results/round4/future-<run>.json [...]
 *
 * Tuning Test (tuning-v1): mean main deck overlap with the lists players settled
 * on, a week or more after the deck appeared. Brewing Test (brewing-v1): mean
 * overlap with the deck's first lists, its first 7 days (the inventor's version,
 * before the crowd tuned it), plus the inventor's gems. The decks, parameters and
 * data cutoff are the frozen ones in evals/tests.ts; the scoring is evals/score.ts.
 * Both split into spells and lands. No model calls.
 */
import { readFileSync } from "node:fs";
import { loadCardIndex } from "../src/cards/load";
import { FileDataSource } from "../src/data/source";
import { round4Items, toCounts, type Line } from "../evals/round4/items";
import { futureLists, inventorGems, loadLists, shareScore } from "../evals/score";
import { testById } from "../evals/tests";

async function main() {
  const index = loadCardIndex();
  const tuning = testById("tuning-v1");
  const brewing = testById("brewing-v1");
  const through = String(tuning.params.dataThrough);
  const lists = loadLists(through);
  // Gems read only the data from before each deck's first day (inventorGems cuts it there).
  const history = await FileDataSource.load("data/reference-lists-all.jsonl", index);
  const runs = process.argv.slice(2).map((f) => ({
    file: f.split("/").pop()!.replace(/^future-|-claude-opus-5-5|\.json$/g, ""),
    results: new Map((JSON.parse(readFileSync(f, "utf8")).results as { id: string; deck: { main: Line[] } | null }[]).map((r) => [r.id, r])),
  }));

  const totals = new Map<string, { tune: number[]; tuneSpells: number[]; tuneLands: number[]; brew: number[]; brewSpells: number[]; gems: number; gemsOf: number }>();
  const rows: Record<string, string | number>[] = [];
  const brewIds = new Set(brewing.items);
  for (const it of round4Items(index).filter((i) => tuning.items.includes(i.id))) {
    const { firstWeek, settled } = futureLists(index, lists, it.target!);
    const gems = inventorGems(index, history, it, firstWeek);
    const t = it.target!;
    const row: Record<string, string | number> = { deck: `${t.format} ${t.strategy}`, "first lists": firstWeek.length, gems: gems.length };
    for (const run of runs) {
      const r = run.results.get(it.id);
      if (!r?.deck) {
        row[run.file] = "no deck";
        continue;
      }
      const deck = toCounts(index, r.deck.main);
      const tune = shareScore(index, deck, settled);
      const brew = shareScore(index, deck, firstWeek);
      const found = gems.filter((g) => deck.has(g)).length;
      const tot = totals.get(run.file) ?? { tune: [], tuneSpells: [], tuneLands: [], brew: [], brewSpells: [], gems: 0, gemsOf: 0 };
      tot.tune.push(tune.all);
      tot.tuneSpells.push(tune.spells);
      tot.tuneLands.push(tune.lands);
      if (brewIds.has(it.id)) {
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
