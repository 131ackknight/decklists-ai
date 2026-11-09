/**
 * Standard legality on a date (2026-11-08). The card index holds today's legality, so a card reprinted into
 * Standard after a deck's date (the shock lands, January 2026) looked legal in that deck. The windows come
 * from scripts/build-standard-windows.ts: each paper expansion or core set's release date, whether it is in
 * Standard today, and the last date a Standard list ran a card printed only in it.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { normalizeName } from "./names";

export interface StandardWindows {
  sets: Record<string, { released: string; legalToday: boolean; lastSeen: string | null }>;
  /** Normalized card name -> the expansion and core sets it was printed in. */
  cards: Record<string, string[]>;
}

export const STANDARD_WINDOWS_PATH = path.join(process.cwd(), "data", "scryfall", "standard-windows.json");

let cached: StandardWindows | null = null;
export function loadStandardWindows(file = STANDARD_WINDOWS_PATH): StandardWindows {
  if (cached && file === STANDARD_WINDOWS_PATH) return cached;
  if (!existsSync(file)) throw new Error(`${file} is missing: run pnpm exec tsx scripts/build-standard-windows.ts`);
  const w = JSON.parse(readFileSync(file, "utf8")) as StandardWindows;
  if (file === STANDARD_WINDOWS_PATH) cached = w;
  return w;
}

/**
 * The last day each set was in Standard: none for sets in Standard today; for the rest, the day before the
 * first set released after its last Standard list (rotation comes with a new set), or that list's date if
 * no set came after.
 */
export function standardEnds(w: StandardWindows): Map<string, string | null> {
  const releases = [...new Set(Object.values(w.sets).map((s) => s.released))].sort();
  const ends = new Map<string, string | null>();
  for (const [code, s] of Object.entries(w.sets)) {
    if (s.legalToday) ends.set(code, null);
    else if (!s.lastSeen) ends.set(code, "0000-00-00");
    else {
      const next = releases.find((r) => r > s.lastSeen!);
      ends.set(code, next ? new Date(Date.parse(next) - 86_400_000).toISOString().slice(0, 10) : s.lastSeen);
    }
  }
  return ends;
}

/** Was the card legal in Standard on this date: one of its sets out by then and not yet rotated? */
export function standardLegalOn(w: StandardWindows, ends: Map<string, string | null>, name: string, date: string): boolean {
  const sets = w.cards[normalizeName(name)] ?? w.cards[normalizeName(name.split(" // ")[0])] ?? [];
  return sets.some((code) => {
    const s = w.sets[code];
    if (!s || s.released > date) return false;
    const end = ends.get(code);
    return end === null || (end !== undefined && date <= end);
  });
}
