/**
 * Every signature card of each test deck, for the "idea named" test (2026-11-11; owner: "Yes, run it"). Free.
 *
 *   pnpm exec tsx scripts/build-idea-signatures.ts
 *
 * The holdout and future prompts name up to 3 signature cards (scripts/find-new-archetypes.ts: in 80% of
 * the deck's first 10 lists, in 5% or less of the format's lists before it, existing on its date). By the
 * same rule the decks have more: evals/score.ts unnamedSignature finds the ones the prompt leaves out.
 * This writes, per deck, the named cards and then the unnamed ones, most telling first (share of the
 * first 10 lists minus share of the format before, the order the original rule sorts by), to
 * evals/brew-holdout/idea-signatures.json. evals/round4/items.ts turns each entry into an item whose
 * prompt names them all.
 *
 * The file is frozen with the tests built on it (evals/tests.ts holdout-idea-v1): running this again
 * must reproduce it; a different rule means a new file and a new test version.
 */
import { writeFileSync } from "node:fs";
import { loadCardIndex } from "../src/cards/load";
import { FileDataSource } from "../src/data/source";
import { brewDeps } from "../evals/round4/deps";
import { round4Items, toCounts } from "../evals/round4/items";
import { loadLists, unnamedSignature, type Counts, type RefList } from "../evals/score";
import { testById } from "../evals/tests";

const OUT = "evals/brew-holdout/idea-signatures.json";

async function main() {
  const index = loadCardIndex();
  const items = new Map(round4Items(index).map((it) => [it.id, it]));
  const lists = loadLists(String(testById("tuning-v1").params.dataThrough));
  const history = await FileDataSource.load("data/reference-lists-all.jsonl", index);
  const today = await FileDataSource.load("data/reference-lists.jsonl", index);
  const depsOf = brewDeps(index, history, today);
  const cache = new Map<RefList, Counts>();
  const countsOf = (l: RefList) => cache.get(l) ?? cache.set(l, toCounts(index, l.main)).get(l)!;

  const out = ["holdout-v2", "future-v2"].flatMap((testId) =>
    testById(testId).items.map((id) => {
      const it = items.get(id)!;
      const t = it.target!;
      const pool = depsOf(it).index;
      const hidden = unnamedSignature(index, lists, it, countsOf, (k) => !!pool.getCard(k));
      const first = Date.parse(t.firstSeen);
      const firstTen = lists
        .filter((l) => l.format === t.format && l.strategy === t.strategy)
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(0, 10)
        .map(countsOf);
      const before = lists.filter((l) => l.format === t.format && Date.parse(l.date) < first).map(countsOf);
      const share = (ls: Counts[], k: string) => (ls.length ? ls.filter((l) => l.has(k)).length / ls.length : 0);
      const unnamed = [...hidden]
        .map((k) => ({ card: index.getCard(k)?.name ?? k, inFirst: share(firstTen, k), before: share(before, k) }))
        .sort((a, b) => b.inFirst - b.before - (a.inFirst - a.before))
        .map((c) => ({ card: c.card, inFirstLists: Math.round(c.inFirst * 100), before: Math.round(c.before * 100) }));
      return { id, format: t.format, strategy: t.strategy, firstSeen: t.firstSeen, named: it.keyCards ?? [], unnamed };
    }),
  );
  writeFileSync(OUT, JSON.stringify(out, null, 1) + "\n");
  const n = (test: string) => out.filter((o) => testById(test).items.includes(o.id));
  for (const test of ["holdout-v2", "future-v2"])
    console.log(`${test}: ${n(test).length} decks, ${n(test).filter((o) => o.unnamed.length).length} with unnamed signature cards, ${(n(test).reduce((a, o) => a + o.named.length + o.unnamed.length, 0) / n(test).length).toFixed(1)} signature cards a deck`);
  console.log(`wrote ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
