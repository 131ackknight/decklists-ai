/**
 * Did the deck already exist in another format? (2026-11-11). Free.
 *
 *   pnpm exec tsx scripts/other-format-check.ts [--decks] [--most]
 *
 * Owner: "I think we are either testing incorrectly or missing something." A new deck in one format is
 * sometimes an old deck in another (Pioneer Lessons appeared seven weeks after Standard Lessons). For each
 * test deck: the lists of OTHER formats, from the 400 days before its date, that run every requested card
 * (with --most: all but one of them, when the prompt names two or more).
 * Each such list is scored as a deck for this format (cards not legal here on the date are dropped), and
 * compared with the brewer's build:
 *
 *   latest      the most recent such list (a pick made from data alone);
 *   best        the best such list, picked with hindsight (the ceiling of porting one list).
 *
 * Dev (v22, 3 runs) and the future test (v13, 2 runs).
 */
import { readFileSync } from "node:fs";
import { loadCardIndex } from "../src/cards/load";
import { FileDataSource } from "../src/data/source";
import { latestRuns } from "../evals/register";
import { brewDeps } from "../evals/round4/deps";
import { round4Items, toCounts, type Line } from "../evals/round4/items";
import { legalOnDateView, loadLists, settledLists, type Counts, type RefList } from "../evals/score";
import { sameItems, testById } from "../evals/tests";

const DAY = 86_400_000;
const perDeck = process.argv.includes("--decks");
const most = process.argv.includes("--most");

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
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
  const one = (x: number) => x.toFixed(1);
  const keyOf = (name: string) => [...toCounts(index, [{ qty: 1, name }]).keys()][0];
  const score = (d: Counts, settled: Counts[]) => (mean(settled.map((l) => [...d].reduce((n, [k, q]) => n + Math.min(q, l.get(k) ?? 0), 0))) / 60) * 100;

  for (const [label, harness, testId, from, to] of [
    ["dev (v22, 3 runs)", "v22", "holdout-v2", 30, 90],
    ["future test (v13, 2 runs)", "v13", "future-v2", 7, 365],
  ] as const) {
    const ids = testById(testId).items;
    const recs = latestRuns().finished.filter((r) => r.model === "claude-opus-5-5" && r.harness === harness && (r.tests.includes(testId) || r.tests.some((x) => sameItems(x, testId))));
    const builds = new Map<string, Counts[]>();
    for (const rec of recs)
      for (const r of JSON.parse(readFileSync(rec.file, "utf8")).results as ({ id: string; deck: { main: Line[] } | null } | null)[])
        if (r?.deck && ids.includes(r.id)) builds.set(r.id, [...(builds.get(r.id) ?? []), toCounts(index, r.deck.main)]);

    const rows: { id: string; brew: number; n: number; latest: number | null; best: number | null; from: string }[] = [];
    for (const id of ids) {
      const it = items.get(id)!;
      const t = it.target!;
      const date = it.before ?? t.firstSeen;
      const cut = Date.parse(date);
      const settled = settledLists(index, lists, t, from, to);
      if (!settled.length || !builds.has(id)) continue;
      const pool = depsOf(it).index;
      const legalHere = (d: Counts) => new Map([...d].filter(([k]) => ["legal", "restricted"].includes(pool.getCard(k)?.legal[t.format] ?? "")));
      const asked = (it.keyCards ?? []).map(keyOf);
      const others = lists
        .filter((l) => l.format !== t.format && l.format !== "duel" && Date.parse(l.date) < cut && Date.parse(l.date) >= cut - 400 * DAY && asked.filter((k) => countsOf(l).has(k)).length >= (most && asked.length >= 2 ? asked.length - 1 : asked.length))
        .sort((a, b) => b.date.localeCompare(a.date));
      const scored = others.map((l) => score(legalHere(countsOf(l)), settled));
      rows.push({
        id,
        brew: mean(builds.get(id)!.map((d) => score(legalView(d, t.format, date), settled))),
        n: others.length,
        latest: others.length ? scored[0] : null,
        best: others.length ? Math.max(...scored) : null,
        from: others.length ? `${others[0].format} ${others[0].strategy}, ${others[0].date}` : "",
      });
    }
    const has = rows.filter((r) => r.n >= 1);
    console.log(`\n== ${label}: ${rows.length} decks; ${has.length} have a list in another format, from before the date, that runs ${most ? "all but one of the requested cards" : "every requested card"}.`);
    if (has.length) {
      console.log(`   On those ${has.length} decks: the brewer ${one(mean(has.map((r) => r.brew)))} | the latest such list, played here as it is ${one(mean(has.map((r) => r.latest!)))} | the best such list (hindsight) ${one(mean(has.map((r) => r.best!)))}`);
      const better = has.filter((r) => r.latest! > r.brew);
      console.log(`   The latest such list beats the brewer on ${better.length} of ${has.length}; over all ${rows.length} decks, taking it whenever one exists would move the score from ${one(mean(rows.map((r) => r.brew)))} to ${one(mean(rows.map((r) => (r.n ? r.latest! : r.brew))))}; taking it only when it is the better one (hindsight): ${one(mean(rows.map((r) => (r.n ? Math.max(r.latest!, r.brew) : r.brew))))}.`);
    }
    if (perDeck) for (const r of rows) console.log(`     ${r.id.replace(/^(holdout|future)-/, "").padEnd(30)} brewer ${one(r.brew).padStart(5)} | lists elsewhere ${String(r.n).padStart(4)} | latest ${(r.latest === null ? "-" : one(r.latest)).padStart(5)} | best ${(r.best === null ? "-" : one(r.best)).padStart(5)} | ${r.from}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
