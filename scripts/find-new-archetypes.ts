/**
 * Find decks that appeared from nothing in Decklist Data's history: the
 * candidates for the brew holdout test (brew to archetype at scale).
 *
 *   pnpm exec tsx scripts/find-new-archetypes.ts [data/reference-lists-all.jsonl]
 *
 * An archetype qualifies when:
 *   - its first list comes at least 45 days after the format's data begins
 *     (so there is a real "before" to rebuild from),
 *   - it became a deck people play: 15+ lists in the 90 days after it appeared,
 *   - it was new, not a relabeled or lightly changed existing deck: its first
 *     lists share at most NEW_MAX of 60 main deck cards with any earlier list,
 *   - its label is a strategy, not a bare color fallback ("Mono-Black", "Jund").
 *
 * For each, records the cutoff date, signature cards (in 80% of its first 10
 * lists, rare in the format before it, and existing on the cutoff day), whether those cards were newly printed, and
 * the settled lists (days 30-90 after it appeared) that brews are scored against.
 * Writes evals/brew-holdout/candidates.json. Commander formats are skipped.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { loadCardIndex } from "../src/cards/load";
import { normalizeName } from "../src/cards/names";

interface Line {
  qty: number;
  name: string;
}
interface RefList {
  format: string;
  date: string;
  event: string;
  record: string | null;
  strategy: string;
  main: Line[];
}

const DAY = 86_400_000;
const LEAD_DAYS = 45;
const MIN_LISTS_90D = 15;
const NEW_MAX = 40;
const FIRST_LISTS = 5;
const WIDGET_ROW = /^Cards?\s*\(\d+%?\)\s*$/i;
const COLOR_NAMES = new Set(
  [
    "azorius", "dimir", "rakdos", "gruul", "selesnya", "orzhov", "izzet", "golgari", "boros", "simic",
    "bant", "esper", "grixis", "jund", "naya", "abzan", "jeskai", "sultai", "mardu", "temur",
    "mono-white", "mono-blue", "mono-black", "mono-red", "mono-green", "colorless", "4-color", "5-color", "domain",
  ],
);

const file = process.argv[2] ?? "data/reference-lists-all.jsonl";
const index = loadCardIndex();
const canon = (n: string) => normalizeName(index.getCard(n)?.name ?? n);
const isLand = (n: string) => /\bLand\b/.test(index.getCard(n)?.typeLine.split(" // ")[0] ?? "");
const counts = (lines: Line[]) => {
  const m = new Map<string, number>();
  for (const l of lines) m.set(canon(l.name), (m.get(canon(l.name)) ?? 0) + l.qty);
  return m;
};
const overlap = (a: Map<string, number>, b: Map<string, number>) => [...a].reduce((n, [k, q]) => n + Math.min(q, b.get(k) ?? 0), 0);

const all = readFileSync(file, "utf8")
  .split("\n")
  .filter(Boolean)
  .map((l) => JSON.parse(l) as RefList)
  .filter((l) => l.format !== "duel")
  .map((l) => ({ ...l, main: l.main.filter((c) => !WIDGET_ROW.test(c.name)) }))
  .sort((a, b) => a.date.localeCompare(b.date));

const byFormat = new Map<string, (RefList & { counts: Map<string, number> })[]>();
for (const l of all) byFormat.set(l.format, [...(byFormat.get(l.format) ?? []), { ...l, counts: counts(l.main) }]);

const out: unknown[] = [];
const rejected: Record<string, number> = {};
const reject = (why: string) => (rejected[why] = (rejected[why] ?? 0) + 1);

for (const [format, lists] of byFormat) {
  const start = Date.parse(lists[0].date);
  const strategies = new Map<string, typeof lists>();
  for (const l of lists) strategies.set(l.strategy, [...(strategies.get(l.strategy) ?? []), l]);

  for (const [strategy, mine] of strategies) {
    if (COLOR_NAMES.has(strategy.toLowerCase())) {
      reject("bare color label");
      continue;
    }
    const first = Date.parse(mine[0].date);
    if (first - start < LEAD_DAYS * DAY) {
      reject("appeared too close to the start of the data");
      continue;
    }
    const in90 = mine.filter((l) => Date.parse(l.date) < first + 90 * DAY);
    if (in90.length < MIN_LISTS_90D) {
      reject("fewer than 15 lists in its first 90 days");
      continue;
    }
    // New, not relabeled: each of its first lists vs. everything posted before the archetype existed.
    const before = lists.filter((l) => Date.parse(l.date) < first);
    const closest = mine.slice(0, FIRST_LISTS).map((l) => Math.max(0, ...before.map((b) => overlap(l.counts, b.counts))));
    const medianClosest = [...closest].sort((a, b) => a - b)[Math.floor(closest.length / 2)];
    if (medianClosest > NEW_MAX) {
      reject(`first lists share more than ${NEW_MAX}/60 with an earlier list`);
      continue;
    }

    const share = (ls: typeof lists) => {
      const m = new Map<string, number>();
      for (const l of ls) for (const k of l.counts.keys()) if (!isLand(k)) m.set(k, (m.get(k) ?? 0) + 1 / ls.length);
      return m;
    };
    // Signature cards come from the deck as it first appeared (its first 10 lists),
    // not as it ended up: a card added months later is not what it was brewed around.
    const inA = share(mine.slice(0, 10));
    const pre = share(before);
    const playedByCutoff = new Set(lists.filter((l) => l.date <= mine[0].date).flatMap((l) => [...l.counts.keys()]));
    const signature = [...inA]
      // It must exist on the cutoff day: printed by then, or already played on MTGO (sets reach MTGO before paper).
      .filter(([key]) => (index.getCard(key)?.released ?? "") <= mine[0].date || playedByCutoff.has(key))
      .map(([key, s]) => ({ card: index.getCard(key)?.name ?? key, inArchetype: s, before: pre.get(key) ?? 0 }))
      .filter((c) => c.inArchetype >= 0.8 && c.before <= 0.05)
      .sort((a, b) => b.inArchetype - b.before - (a.inArchetype - a.before))
      .slice(0, 3)
      .map((c) => ({
        ...c,
        inArchetype: Math.round(c.inArchetype * 100),
        before: Math.round(c.before * 100),
        released: index.getCard(c.card)?.released ?? null,
      }));
    const cutoff = mine[0].date;
    const settled = mine.filter((l) => Date.parse(l.date) >= first + 30 * DAY && Date.parse(l.date) < first + 90 * DAY);
    out.push({
      format,
      strategy,
      firstSeen: cutoff,
      listsFirst90Days: in90.length,
      listsTotal: mine.length,
      closestEarlierOverlap: medianClosest,
      signature,
      newCards: signature.filter((c) => c.released && Date.parse(c.released) > first - 60 * DAY).map((c) => c.card),
      settledLists: settled.length,
    });
  }
}

writeFileSync("evals/brew-holdout/candidates.json", JSON.stringify(out, null, 1) + "\n");
console.log(`${out.length} candidates; rejected:`, rejected);
console.table(
  (out as { format: string; strategy: string; firstSeen: string; listsFirst90Days: number; closestEarlierOverlap: number; signature: { card: string }[]; newCards: string[]; settledLists: number }[]).map((c) => ({
    format: c.format,
    strategy: c.strategy,
    first: c.firstSeen,
    "90d": c.listsFirst90Days,
    settled: c.settledLists,
    closest: c.closestEarlierOverlap,
    signature: c.signature.map((s) => s.card).join(", "),
    "new cards": c.newCards.length,
  })),
);
