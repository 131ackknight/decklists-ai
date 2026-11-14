/**
 * Stale cards in saved brews (2026-11-14). Free: no model call.
 *
 *   pnpm exec tsx scripts/stale-card-check.ts [--harness v22] [--test holdout-v2|future-v2] [--detail]
 *
 * The owner's first live brew put Lorwyn-era Faeries in a 2026 Modern deck ("the creature suite is from
 * like 2014"): four of its eight creatures were in no Modern list of the 90 days before. The proposed fix
 * is a flag: a card nobody in the format played in the 90 days before the brew, and not new (released more
 * than 180 days before), must be justified or replaced. Before building it, this measures on saved brews:
 *
 *   - how many stale nonland copies a brew plays;
 *   - how many of them the real decks play (copies shared with the settled lists, averaged over them):
 *     the flag's cost, since inventors do take cards nobody was playing;
 *   - how many stale nonland copies the real decks themselves play.
 *
 * Lands are left out (owner, 2026-11-10: "Yes, stop on lands"). The dev decks (holdout-v2) and the future
 * test's decks that are not dev archetypes are reported apart, as protocol-v4 asks of a rule picked on dev.
 */
import { readFileSync } from "node:fs";
import { loadCardIndex } from "../src/cards/load";
import type { QtyName } from "../src/data/source";
import { latestRuns, type RunRecord } from "../evals/register";
import { isLand, round4Items, toCounts } from "../evals/round4/items";
import { PROTOCOL } from "../evals/protocol";
import { loadLists, settledLists, type Counts, type RefList } from "../evals/score";
import { sameItems, testById } from "../evals/tests";

const arg = (name: string) => (process.argv.includes(`--${name}`) ? process.argv[process.argv.indexOf(`--${name}`) + 1] : undefined);
const harness = arg("harness") ?? "v22";
const testId = arg("test") ?? "holdout-v2";
const detail = process.argv.includes("--detail");
if (!["future-v2", "holdout-v2"].includes(testId)) throw new Error("--test holdout-v2 or future-v2");

const DAY = 86_400_000;
/** "Lately": the 90 days before the brew, the same window the brewer's own data uses. */
const RECENT_DAYS = 90;
/** Cards released this close to the brew are new, not stale. */
const NEW_DAYS = 180;

type SavedDeck = { main: QtyName[] };

async function main() {
  const index = loadCardIndex();
  const items = new Map(round4Items(index).map((it) => [it.id, it]));
  const lists = loadLists(String(testById("tuning-v1").params.dataThrough));
  const cache = new Map<RefList, Counts>();
  const countsOf = (l: RefList) => cache.get(l) ?? cache.set(l, toCounts(index, l.main)).get(l)!;
  const land = (k: string) => isLand(index, k);
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);

  /** Cards played in the format in the 90 days before `date` (one entry per list that plays them). */
  const playedCache = new Map<string, Set<string>>();
  const playedBefore = (format: string, date: string) => {
    const key = `${format}|${date}`;
    if (playedCache.has(key)) return playedCache.get(key)!;
    const cut = Date.parse(date);
    const set = new Set<string>();
    for (const l of lists) {
      if (l.format !== format) continue;
      const t = Date.parse(l.date);
      if (t < cut && t >= cut - RECENT_DAYS * DAY) for (const k of countsOf(l).keys()) set.add(k);
    }
    playedCache.set(key, set);
    return set;
  };
  const staleIn = (format: string, date: string) => {
    const played = playedBefore(format, date);
    const cut = Date.parse(date);
    return (k: string) => {
      if (land(k) || played.has(k)) return false;
      const released = index.getCard(k)?.released;
      return !released || Date.parse(released) < cut - NEW_DAYS * DAY;
    };
  };

  const ids = testById(testId).items;
  const devKeys = new Set(testById("holdout-v2").items.map((id) => `${items.get(id)!.target!.format}|${items.get(id)!.target!.strategy}`));
  const unseen = ids.filter((id) => !devKeys.has(`${items.get(id)!.target!.format}|${items.get(id)!.target!.strategy}`));
  const dateOf = (id: string) => items.get(id)!.before ?? items.get(id)!.target!.firstSeen;
  const settled = new Map(
    ids.map((id) => {
      const t = items.get(id)!.target!;
      return [id, testId === "holdout-v2" ? settledLists(index, lists, t, 30, 90) : settledLists(index, lists, t, 7, 365)] as const;
    }),
  );

  const covers = (r: RunRecord, t: string) => r.tests.includes(t) || r.tests.some((x) => sameItems(x, t));
  const records = latestRuns().finished.filter((r) => r.model === PROTOCOL.model && r.harness === harness && covers(r, testId));
  if (!records.length) throw new Error(`no ${harness} runs on ${testId}`);

  /** Whether the request names this card (its front face, case-insensitive). */
  const named = (id: string, k: string) => {
    const name = (index.getCard(k)?.name ?? k).split(" // ")[0].toLowerCase();
    return items.get(id)!.prompt.toLowerCase().includes(name);
  };

  type Row = { id: string; stale: number; staleRight: number; unnamed: number; unnamedRight: number; realStale: number; cards: string[] };
  const rows: Row[] = [];
  for (const rec of records) {
    for (const r of JSON.parse(readFileSync(rec.file, "utf8")).results as ({ id: string; deck: SavedDeck | null } | null)[]) {
      if (!r?.deck || !ids.includes(r.id) || !settled.get(r.id)!.length) continue;
      const t = items.get(r.id)!.target!;
      const isStale = staleIn(t.format, dateOf(r.id));
      const deck = toCounts(index, r.deck.main);
      const s = settled.get(r.id)!;
      const staleCards = [...deck].filter(([k]) => isStale(k));
      const unnamedCards = staleCards.filter(([k]) => !named(r.id, k));
      const rightOf = (cs: [string, number][]) => mean(s.map((l) => cs.reduce((n, [k, q]) => n + Math.min(q, l.get(k) ?? 0), 0)));
      rows.push({
        id: r.id,
        stale: staleCards.reduce((n, [, q]) => n + q, 0),
        staleRight: rightOf(staleCards),
        unnamed: unnamedCards.reduce((n, [, q]) => n + q, 0),
        unnamedRight: rightOf(unnamedCards),
        realStale: mean(s.map((l) => [...l].reduce((n, [k, q]) => n + (isStale(k) ? q : 0), 0))),
        cards: staleCards.map(([k, q]) => `${q} ${index.getCard(k)?.name ?? k}${named(r.id, k) ? " (named)" : ""}`),
      });
    }
  }

  console.log(`${harness} on ${testId}: ${records.length} run(s), ${rows.length} builds. Stale = a nonland card no ${RECENT_DAYS}-day list in the format played, released over ${NEW_DAYS} days before the brew.`);
  for (const [label, keep] of [
    ["Every deck", ids],
    ["Decks that are not dev archetypes", unseen],
  ] as const) {
    const sub = rows.filter((r) => keep.includes(r.id));
    if (!sub.length) continue;
    const stale = mean(sub.map((r) => r.stale));
    const right = mean(sub.map((r) => r.staleRight));
    console.log(`\n${label}: ${new Set(sub.map((r) => r.id)).size} decks, ${sub.length} builds`);
    console.log(`  builds with any stale card       ${sub.filter((r) => r.stale > 0).length} of ${sub.length}`);
    console.log(`  stale copies per brew            ${stale.toFixed(2)}`);
    console.log(`  of them, played by the real deck ${right.toFixed(2)} (${stale ? ((right / stale) * 100).toFixed(0) : "0"}%)`);
    const un = mean(sub.map((r) => r.unnamed));
    const unRight = mean(sub.map((r) => r.unnamedRight));
    console.log(`  stale copies the request did not name ${un.toFixed(2)}, played by the real deck ${unRight.toFixed(2)} (${un ? ((unRight / un) * 100).toFixed(0) : "0"}%)`);
    console.log(`  stale copies in the real decks   ${mean(sub.map((r) => r.realStale)).toFixed(2)}`);
  }
  if (detail) {
    console.log("");
    for (const r of rows.filter((x) => x.stale > 0)) {
      console.log(`  ${unseen.includes(r.id) ? "*" : " "} ${r.id.padEnd(36)} ${r.stale} stale, ${r.staleRight.toFixed(1)} right | ${r.cards.join(", ")}`);
    }
    console.log("  * = not a dev archetype");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
