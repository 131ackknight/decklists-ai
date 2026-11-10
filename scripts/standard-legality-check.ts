/**
 * Does the Standard-legality-on-a-date rule (src/cards/standard.ts) hold up? (2026-11-08.) Free.
 *
 *   pnpm exec tsx scripts/standard-legality-check.ts
 *
 * 1. Real decks should pass: every Standard list the dev and future-test items score against (the
 *    first-week and settled lists), checked on its own date.
 * 2. Opus v13's saved Standard decks, checked on their item's date: what v22's card pool would not have
 *    allowed. A card counts as legal if its set was out and not rotated on the date, or if it had already
 *    been played by then and its set came out within 30 days (MTGO gets sets early), as in CardIndex.asOf.
 */
import { existsSync, readFileSync } from "node:fs";
import { loadCardIndex } from "../src/cards/load";
import { loadStandardWindows, standardEnds, standardLegalOn } from "../src/cards/standard";
import { round4Items, toCounts, type Line } from "../evals/round4/items";
import { loadLists, settledLists, type RefList } from "../evals/score";
import { testById } from "../evals/tests";

const DAY = 86_400_000;

async function main() {
  const index = loadCardIndex();
  const w = loadStandardWindows();
  const ends = standardEnds(w);
  const lists = loadLists(String(testById("tuning-v1").params.dataThrough));
  // The first date each card was played in any list (what history.cardsPlayedThrough(date) tests), computed once.
  const firstPlayed = new Map<string, string>();
  for (const l of lists) for (const k of toCounts(index, l.main).keys()) if (!firstPlayed.has(k) || l.date < firstPlayed.get(k)!) firstPlayed.set(k, l.date);
  const items = round4Items(index).filter((it) => it.format === "Standard" && it.target && (testById("holdout-v1").items.includes(it.id) || testById("future-v1").items.includes(it.id)));
  // Lists use front faces and MTGO's alternate names; the windows use Scryfall's full names, as CardIndex.asOf does.
  const fullName = (name: string) => index.getCard(name)?.name ?? name;
  const legal = (listName: string, date: string, allowance: boolean) => {
    const name = fullName(listName);
    if (standardLegalOn(w, ends, name, date)) return true;
    if (!allowance) return false;
    const soon = new Date(Date.parse(date) + 30 * DAY).toISOString().slice(0, 10);
    const played = firstPlayed.get([...toCounts(index, [{ qty: 1, name }]).keys()][0]);
    return !!played && played <= date && standardLegalOn(w, ends, name, soon);
  };
  const isBasic = (n: string) => /\bBasic\b/.test(index.getCard(n)?.typeLine ?? "");

  // 1. Real decks, each on its own date.
  let copies = 0;
  let pure = 0;
  let allowed = 0;
  const offenders = new Map<string, number>();
  const seenLists = new Set<RefList>();
  for (const it of items) {
    const t = it.target!;
    const first = Date.parse(t.firstSeen);
    const real = [
      ...lists.filter((l) => l.format === t.format && l.strategy === t.strategy && Date.parse(l.date) >= first && Date.parse(l.date) < first + 7 * DAY),
      ...lists.filter((l) => l.format === t.format && l.strategy === t.strategy && Date.parse(l.date) >= first + 7 * DAY && Date.parse(l.date) < first + 365 * DAY),
    ];
    for (const l of real) {
      if (seenLists.has(l)) continue;
      seenLists.add(l);
      for (const c of l.main) {
        if (isBasic(c.name)) continue;
        copies += c.qty;
        if (legal(c.name, l.date, false)) pure += c.qty;
        if (legal(c.name, l.date, true)) allowed += c.qty;
        else offenders.set(c.name, (offenders.get(c.name) ?? 0) + c.qty);
      }
    }
  }
  const pct = (a: number, b: number) => `${((a / Math.max(1, b)) * 100).toFixed(2)}%`;
  console.log(`1. Real Standard lists behind ${items.length} dev and future-test items: ${seenLists.size} lists, ${copies} nonbasic card copies`);
  console.log(`   legal on their own date: ${pct(pure, copies)} by the set windows alone, ${pct(allowed, copies)} with the MTGO allowance`);
  console.log(`   not legal by the rule: ${[...offenders].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([n, q]) => `${n} ${q}`).join(", ") || "none"}`);

  // 2. Opus v13's saved Standard decks, on their item's date.
  for (const [label, files] of [
    ["dev (holdout-v1)", ["holdout-v13-claude-opus-5-5.json", "holdout-v13-claude-opus-5-5-r2.json", "holdout-v13-claude-opus-5-5-r3.json"]],
    ["future test (future-v1)", ["future-v13-claude-opus-5-5.json", "future-v13-claude-opus-5-5-r2.json"]],
  ] as const) {
    let decks = 0;
    let flaggedDecks = 0;
    let flaggedCopies = 0;
    const bad = new Map<string, number>();
    for (const f of files) {
      const path = `evals/results/round4/${f}`;
      if (!existsSync(path)) continue;
      for (const r of JSON.parse(readFileSync(path, "utf8")).results as { id: string; deck: { main: Line[] } | null }[]) {
        const it = items.find((x) => x.id === r?.id);
        if (!it || !r.deck) continue;
        decks++;
        const date = it.before ?? it.target!.firstSeen;
        const off = r.deck.main.filter((c) => !isBasic(c.name) && !legal(c.name, date, true));
        if (off.length) flaggedDecks++;
        for (const c of off) {
          flaggedCopies += c.qty;
          bad.set(c.name, (bad.get(c.name) ?? 0) + c.qty);
        }
      }
    }
    console.log(`2. Opus v13 Standard decks, ${label}: ${decks} decks; ${flaggedDecks} have cards v22 would not allow; ${(flaggedCopies / Math.max(1, decks)).toFixed(1)} copies per deck`);
    console.log(`   ${[...bad].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([n, q]) => `${n} ${q}`).join(", ") || "none"}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
