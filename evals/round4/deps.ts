/**
 * The card pool and the real lists the brewer is given for an eval item, as scripts/run-round4.ts builds
 * them for harness v22 and later (keep the two in step): cards and lists from before the item's date,
 * Standard legality on that date, near-copies of the owner's list hidden; today's data for an item with
 * no date. For free checks that rerun a code-only step on saved brews (2026-11-10).
 */
import type { CardIndex } from "../../src/cards/card-index";
import { loadStandardWindows } from "../../src/cards/standard";
import type { DataSource, FileDataSource } from "../../src/data/source";
import { isNearCopy, type Round4Item } from "./items";

export function brewDeps(index: CardIndex, history: FileDataSource, today: DataSource) {
  const windows = loadStandardWindows();
  const cache = new Map<string, { index: CardIndex; data: DataSource }>();
  return (it: Round4Item): { index: CardIndex; data: DataSource } => {
    let deps = cache.get(it.id);
    if (!deps) {
      const pool = it.before ? index.asOf(it.before, history.cardsPlayedThrough(it.before), windows) : index;
      const data = it.before ? history.cut(it.before, pool, (l) => isNearCopy(index, it, l.main)) : today;
      cache.set(it.id, (deps = { index: pool, data }));
    }
    return deps;
  };
}
