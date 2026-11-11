/**
 * Do the lists that already run the requested cards have the real deck's colors? (2026-11-10). Free.
 *
 *   pnpm exec tsx scripts/beside-colors-check.ts
 *
 * Owner: "What can we do about non basic lands then?" A third of the brewer's builds are in other colors
 * than the real deck, and those share few of its lands. Three guesses at a deck's colors, against the
 * colors most of its settled lists have: the brewer's own builds; the plain mana symbols on the requested
 * cards; and the colors of the lists (any format, or the same format, 400 days before the deck's date)
 * that run the most requested cards together, when there are 5 or more. Dev (v22) and the future test (v13).
 */
import { readFileSync } from "node:fs";
import { FORMATS } from "../src/cards/formats";
import { loadCardIndex } from "../src/cards/load";
import { FileDataSource } from "../src/data/source";
import { deckColors } from "../src/harness/lands";
import { latestRuns } from "../evals/register";
import { brewDeps } from "../evals/round4/deps";
import { round4Items, toCounts, type Line } from "../evals/round4/items";
import { legalOnDateView, loadLists, settledLists, type Counts, type RefList } from "../evals/score";
import { sameItems, testById } from "../evals/tests";

async function main() {
  const index = loadCardIndex();
  const items = new Map(round4Items(index).map((it) => [it.id, it]));
  const lists = loadLists(String(testById("tuning-v1").params.dataThrough));
  const history = await FileDataSource.load("data/reference-lists-all.jsonl", index);
  const today = await FileDataSource.load("data/reference-lists.jsonl", index);
  const depsOf = brewDeps(index, history, today);
  const cache = new Map<RefList, Counts>();
  const countsOf = (l: RefList) => cache.get(l) ?? cache.set(l, toCounts(index, l.main)).get(l)!;
  const legalView = legalOnDateView(index, lists, countsOf);
  const setOf = (colors: string[]) => [...colors].sort().join("") || "C";
  const keyOf = (name: string) => [...toCounts(index, [{ qty: 1, name }]).keys()][0];
  const mode = (xs: string[]) => {
    const n = new Map<string, number>();
    for (const x of xs) n.set(x, (n.get(x) ?? 0) + 1);
    const top = [...n].sort((a, b) => b[1] - a[1])[0];
    return top ? { value: top[0], share: top[1] / xs.length } : null;
  };
  const devKeys = new Set(testById("holdout-v2").items.map((id) => `${items.get(id)!.target!.format}|${items.get(id)!.target!.strategy}`));

  for (const [label, harness, testId, from, to] of [
    ["dev (v22)", "v22", "holdout-v2", 30, 90],
    ["future test (v13)", "v13", "future-v2", 7, 365],
  ] as const) {
    const ids = testById(testId).items;
    const recs = latestRuns().finished.filter((r) => r.model === "claude-opus-5-5" && r.harness === harness && (r.tests.includes(testId) || r.tests.some((x) => sameItems(x, testId))));
    const builds = new Map<string, string[]>();
    for (const rec of recs)
      for (const r of JSON.parse(readFileSync(rec.file, "utf8")).results as ({ id: string; deck: { main: Line[] } | null } | null)[]) {
        if (!r?.deck || !ids.includes(r.id)) continue;
        const it = items.get(r.id)!;
        builds.set(r.id, [...(builds.get(r.id) ?? []), setOf(deckColors(index, legalView(toCounts(index, r.deck.main), it.target!.format, it.before ?? it.target!.firstSeen)))]);
      }
    let n = 0;
    const hit = { brewer: 0, named: 0, beside: 0, besideWhenAny: 0, any: 0, sameFormat: 0, sameFormatAny: 0 };
    const rows: string[] = [];
    for (const id of ids) {
      const it = items.get(id)!;
      const t = it.target!;
      const settled = settledLists(index, lists, t, from, to);
      if (!settled.length) continue;
      n++;
      const real = mode(settled.map((l) => setOf(deckColors(index, l, true))))!.value;
      const asked = (it.keyCards ?? []).map(keyOf);
      // Named cards' colors: plain pips on the requested cards.
      const named = setOf([...new Set(asked.flatMap((k) => [...(index.getCard(k)?.manaCost.split(" // ")[0] ?? "").matchAll(/\{([WUBRG])\}/g)].map((m) => m[1])))]);
      // Lists (any format, 400 days before) that run the most requested cards together, 5 or more of them.
      const data = depsOf(it).data;
      const pick = (formats: string[]) => {
        const wide = formats.flatMap((f) => data.recentLists(f, { days: 400 }).map((l) => toCounts(index, l.main)));
        for (let k = asked.length; k >= 1; k--) {
          const hits = wide.filter((l) => asked.filter((a) => l.has(a)).length >= k);
          if (hits.length >= 5) return { k, lists: hits.length, ...mode(hits.map((l) => setOf(deckColors(index, l, true))))! };
        }
        return null;
      };
      const beside = pick(FORMATS.filter((f) => f.hasData).map((f) => f.key));
      const same = pick([t.format]);
      const mine = builds.get(id) ?? [];
      hit.brewer += mine.filter((c) => c === real).length / Math.max(1, mine.length);
      if (named === real) hit.named++;
      if (beside) hit.any++;
      if (beside?.value === real) hit.beside++;
      if (same) hit.sameFormatAny++;
      if (same?.value === real) hit.sameFormat++;
      rows.push(`  ${id.replace(/^(holdout|future)-/, "").padEnd(30)} real ${real.padEnd(5)} | brewer ${mine.join(",").padEnd(17)} | named cards ${named.padEnd(5)} | beside, any format ${beside ? `${beside.value} (${Math.round(beside.share * 100)}% of ${beside.lists} lists with ${beside.k} of ${asked.length})` : "too few lists"} | beside, same format ${same ? `${same.value} (${Math.round(same.share * 100)}% of ${same.lists}, ${same.k} of ${asked.length})` : "too few"}${devKeys.has(`${t.format}|${t.strategy}`) || testId === "holdout-v2" ? "" : "  *unseen"}`);
    }
    const p = (x: number, of: number) => `${Math.round((x / Math.max(1, of)) * 100)}% (${x.toFixed(1).replace(".0", "")} of ${of})`;
    console.log(`\n== ${label}: ${n} decks. Right colors:`);
    console.log(`  the brewer's builds                         ${p(hit.brewer, n)}`);
    console.log(`  the named cards' own colors                 ${p(hit.named, n)}`);
    console.log(`  lists beside the requested cards, any format ${p(hit.beside, n)}; where there are 5+ such lists: ${p(hit.beside, hit.any)}`);
    console.log(`  lists beside them, same format               ${p(hit.sameFormat, n)}; where there are 5+ such lists: ${p(hit.sameFormat, hit.sameFormatAny)}`);
    for (const r of rows) console.log(r);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
