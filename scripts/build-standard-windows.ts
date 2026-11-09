/**
 * When was each card legal in Standard? (2026-11-08.) The card index holds today's legality, and the
 * time-cut card pool only hides cards first printed after a date, so a card reprinted into Standard later
 * (the shock lands, back in January 2026) looked legal in 2025 Standard decks too.
 *
 *   pnpm exec tsx scripts/build-standard-windows.ts
 *
 * From Scryfall's printings (data/scryfall/default-cards-*.jsonl.gz, newest) and the tournament lists
 * (data/reference-lists-all.jsonl), writes data/scryfall/standard-windows.json:
 * - sets: every paper expansion or core set, with its release date, whether it is in Standard today (a card
 *   printed in no other such set is Standard-legal or banned today), and the last date a Standard list ran a
 *   card printed only in it (when it left Standard, for sets no longer in it);
 * - cards: for each card with such a printing, the sets it was printed in.
 * src/cards/standard.ts reads it: a card is Standard-legal on a date if one of its sets was released by then
 * and was still in Standard then.
 */
import { createReadStream, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { createGunzip } from "node:zlib";
import { normalizeName } from "../src/cards/names";

const DIR = "data/scryfall";
const STANDARD_TYPES = new Set(["expansion", "core"]);

interface Printing {
  name: string;
  set: string;
  set_type: string;
  released_at: string;
  lang?: string;
  games?: string[];
  legalities?: Record<string, string>;
}

async function main() {
  const file = readdirSync(DIR).filter((f) => f.startsWith("default-cards-")).sort().at(-1)!;
  const sets = new Map<string, { released: string; unique: Set<string>; legalToday: boolean; lastSeen: string | null }>();
  const cardSets = new Map<string, Set<string>>();
  const legalToday = new Map<string, boolean>();
  const lines = createInterface({ input: createReadStream(`${DIR}/${file}`).pipe(createGunzip()) });
  for await (const line of lines) {
    if (!line.trim()) continue;
    const p = JSON.parse(line) as Printing;
    if ((p.lang && p.lang !== "en") || !STANDARD_TYPES.has(p.set_type) || !(p.games ?? []).includes("paper")) continue;
    const k = normalizeName(p.name);
    const s = sets.get(p.set) ?? { released: p.released_at, unique: new Set(), legalToday: false, lastSeen: null };
    if (p.released_at < s.released) s.released = p.released_at;
    sets.set(p.set, s);
    cardSets.set(k, (cardSets.get(k) ?? new Set()).add(p.set));
    const st = p.legalities?.standard;
    legalToday.set(k, st === "legal" || st === "banned");
  }
  // A set's own cards: printed in no other expansion or core set.
  for (const [k, ss] of cardSets) if (ss.size === 1) sets.get([...ss][0])!.unique.add(k);
  for (const s of sets.values()) s.legalToday = [...s.unique].some((k) => legalToday.get(k));
  // When each set's own cards were last played in Standard.
  const setOfUnique = new Map<string, string>();
  for (const [code, s] of sets) for (const k of s.unique) setOfUnique.set(k, code);
  for (const line of readFileSync("data/reference-lists-all.jsonl", "utf8").split("\n")) {
    if (!line) continue;
    const l = JSON.parse(line) as { format: string; date: string; main: { name: string }[] };
    if (l.format !== "standard") continue;
    for (const c of l.main) {
      const code = setOfUnique.get(normalizeName(c.name.split(" // ")[0])) ?? setOfUnique.get(normalizeName(c.name));
      if (!code) continue;
      const s = sets.get(code)!;
      if (!s.lastSeen || l.date > s.lastSeen) s.lastSeen = l.date;
    }
  }
  const out = {
    builtFrom: [file, "reference-lists-all.jsonl"],
    builtAt: new Date().toISOString(),
    sets: Object.fromEntries([...sets].sort((a, b) => a[1].released.localeCompare(b[1].released)).map(([code, s]) => [code, { released: s.released, legalToday: s.legalToday, lastSeen: s.lastSeen, ownCards: s.unique.size }])),
    cards: Object.fromEntries([...cardSets].map(([k, ss]) => [k, [...ss].sort()])),
  };
  writeFileSync(`${DIR}/standard-windows.json`, JSON.stringify(out));
  const recent = Object.entries(out.sets).filter(([, s]) => s.released >= "2022-01-01");
  console.log(`${sets.size} sets, ${cardSets.size} cards; sets since 2022 (released / in Standard today / last seen in a Standard list):`);
  for (const [code, s] of recent) console.log(`  ${code.padEnd(5)} ${s.released}  ${s.legalToday ? "today" : "     "}  ${s.lastSeen ?? "-"}  (${s.ownCards} own cards)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
