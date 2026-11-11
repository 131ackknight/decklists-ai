/**
 * v23's land swap on saved brews of any version, against the same brews unchanged (2026-11-10). Free.
 *
 *   pnpm exec tsx scripts/land-swap-check.ts [--harness v13] [--test future-v2|holdout-v2|tuning-v1] [--detail]
 *
 * The swap is the brewer's own step (src/harness/lands.ts swapUsualLands), made on the card pool and the
 * lists the runner gave each deck (evals/round4/deps.ts). Its rule was picked on the dev decks
 * (scripts/land-fix-check.ts), so the fair check is on decks it was never tried on: the future test's
 * saved brews (v13's two runs), and of those the decks whose archetype is not a dev deck.
 *
 * Scored as the test scores them, paired by deck (95% range): lands shared with the settled lists, match
 * % and Added (holdout-v2 and future-v2, with Standard cards not legal on the deck's date earning
 * nothing), or the share of each real list's cards and lands (tuning-v1). Two rows: every deck of the
 * test, and the decks that are not dev archetypes.
 */
import { readFileSync } from "node:fs";
import { loadCardIndex } from "../src/cards/load";
import { FileDataSource, type QtyName } from "../src/data/source";
import { swapUsualLands } from "../src/harness/lands";
import { latestRuns, type RunRecord } from "../evals/register";
import { brewDeps } from "../evals/round4/deps";
import { isLand, round4Items, toCounts } from "../evals/round4/items";
import { PROTOCOL, pairedGain } from "../evals/protocol";
import { addedScore, earlierLists, futureLists, legalOnDateView, loadLists, settledLists, shareScore, type Counts, type RefList } from "../evals/score";
import { sameItems, testById } from "../evals/tests";

const arg = (name: string) => (process.argv.includes(`--${name}`) ? process.argv[process.argv.indexOf(`--${name}`) + 1] : undefined);
const harness = arg("harness") ?? "v13";
const testId = arg("test") ?? "future-v2";
const detail = process.argv.includes("--detail");
if (!["future-v2", "holdout-v2", "tuning-v1"].includes(testId)) throw new Error("--test future-v2, holdout-v2 or tuning-v1");

type SavedDeck = { main: QtyName[]; side?: QtyName[]; commander?: QtyName[]; label?: string };

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
  const land = (k: string) => isLand(index, k);
  const basic = (k: string) => land(k) && /\bBasic\b/.test(index.getCard(k)?.typeLine ?? "");
  const total = (m: Counts, keep: (k: string) => boolean = () => true) => [...m].reduce((a, [k, q]) => a + (keep(k) ? q : 0), 0);
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);

  const ids = testById(testId).items;
  const devKeys = new Set(testById("holdout-v2").items.map((id) => `${items.get(id)!.target!.format}|${items.get(id)!.target!.strategy}`));
  const unseen = ids.filter((id) => !devKeys.has(`${items.get(id)!.target!.format}|${items.get(id)!.target!.strategy}`));
  const dateOf = (id: string) => items.get(id)!.before ?? items.get(id)!.target!.firstSeen;
  const share = testId === "tuning-v1";
  const settled = new Map(
    ids.map((id) => {
      const t = items.get(id)!.target!;
      return [id, share ? futureLists(index, lists, t).settled : testId === "holdout-v2" ? settledLists(index, lists, t, 30, 90) : settledLists(index, lists, t, 7, 365)] as const;
    }),
  );
  const earlier = new Map(ids.map((id) => [id, share ? [] : earlierLists(lists, items.get(id)!.target!.format, dateOf(id), countsOf)] as const));
  const viewOf = (id: string, d: Counts) => (share ? d : legalView(d, items.get(id)!.target!.format, dateOf(id)));

  /** Each measure of one deck, as the test scores it. */
  const scoreOf = (id: string, d: Counts): Record<string, number> => {
    const s = settled.get(id)!;
    if (share) {
      const x = shareScore(index, d, s);
      return { "Share of the real lists' cards %": x.all * 100, "Share of their lands %": x.lands * 100, "Basic lands": total(d, basic) };
    }
    const a = addedScore(d, s, earlier.get(id)!, (x) => viewOf(id, x));
    return {
      "Lands shared with the settled lists": mean(s.map((l) => [...viewOf(id, d)].reduce((n, [k, q]) => n + (land(k) ? Math.min(q, l.get(k) ?? 0) : 0), 0))),
      "Match %": a.match,
      Added: a.added,
      "Basic lands": total(d, basic),
    };
  };

  const covers = (r: RunRecord, t: string) => r.tests.includes(t) || r.tests.some((x) => sameItems(x, t));
  const runNo = (f: string) => Number(f.match(/-r(\d+)(?:-partial)?\.json$/)?.[1] ?? 1);
  const records = latestRuns()
    .finished.filter((r) => r.model === PROTOCOL.model && r.harness === harness && covers(r, testId))
    .sort((a, b) => runNo(a.file) - runNo(b.file));
  if (!records.length) throw new Error(`no ${harness} runs on ${testId}`);

  type Row = { before: Record<string, number>; after: Record<string, number>; changed: boolean; text: string };
  const runs = records.map((rec) => {
    const out = new Map<string, Row>();
    for (const r of JSON.parse(readFileSync(rec.file, "utf8")).results as ({ id: string; deck: SavedDeck | null } | null)[]) {
      if (!r?.deck || !ids.includes(r.id) || !settled.get(r.id)!.length) continue;
      const it = items.get(r.id)!;
      const swap = swapUsualLands(depsOf(it).index, depsOf(it).data, { ...r.deck, format: it.target!.format });
      const list = (xs: { name: string; copies: number }[]) => xs.map((x) => `${x.copies} ${x.name}`).join(", ");
      out.set(r.id, {
        before: scoreOf(r.id, toCounts(index, r.deck.main)),
        after: scoreOf(r.id, toCounts(index, swap ? swap.main : r.deck.main)),
        changed: !!swap,
        text: swap ? `out: ${list(swap.cut)} | in: ${list(swap.added)}` : "as built",
      });
    }
    return out;
  });

  const two = (x: number) => `${x >= 0 ? "+" : ""}${x.toFixed(2)}`;
  const measures = Object.keys([...runs[0].values()][0].before);
  console.log(`${harness} on ${testId}: ${records.length} run(s), ${ids.length} decks, ${unseen.length} of them not dev archetypes. The swap against the same builds unchanged, paired by deck (95% range).`);
  for (const [label, keep] of [
    ["Every deck", ids],
    ["Decks that are not dev archetypes", unseen],
  ] as const) {
    const col = (side: "before" | "after", m: string) => runs.map((run) => new Map([...run].filter(([id]) => keep.includes(id)).map(([id, row]) => [id, row[side][m]] as const)));
    const builds = runs.flatMap((run) => [...run].filter(([id]) => keep.includes(id)));
    console.log(`\n${label}: ${new Set(builds.map(([id]) => id)).size} decks, ${builds.length} builds, ${builds.filter(([, row]) => row.changed).length} changed`);
    if (!builds.length) continue;
    for (const m of measures) {
      const [b, a] = [col("before", m), col("after", m)];
      const g = pairedGain(a, b);
      const avg = (xs: Map<string, number>[]) => mean(xs.map((x) => mean([...x.values()])));
      console.log(`  ${m.padEnd(38)} before ${avg(b).toFixed(1)} | after ${avg(a).toFixed(1)} | change ${two(g.gain)} (${two(g.lo)} to ${two(g.hi)})`);
    }
  }
  if (detail) {
    console.log("");
    runs.forEach((run, i) => {
      for (const [id, row] of run) {
        const m = measures[0];
        console.log(`  run ${i + 1} ${unseen.includes(id) ? "*" : " "} ${id.padEnd(36)} ${m.toLowerCase()} ${row.before[m].toFixed(1)} -> ${row.after[m].toFixed(1)} | ${row.text}`);
      }
    });
    console.log("  * = not a dev archetype");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
