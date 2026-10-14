/**
 * Build per-archetype mana profiles (land count and colored sources) from
 * Decklist Data's export, and report how many real lists sit inside their
 * own archetype's bands.
 *
 *   pnpm exec tsx scripts/build-archetype-profiles.ts data/reference-lists.jsonl
 *
 * Writes data/archetype-mana.json (derived from Decklist Data; not in git).
 * Archetypes with fewer than 10 lists are skipped.
 */
import { createReadStream, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { loadCardIndex } from "../src/cards/load";
import { buildProfile, compareToArchetype } from "../src/checker/archetype-mana";
import type { QtyName } from "../src/checker/check";
import { analyzeMana, type Entry, type ManaReport } from "../src/checker/mana";
import { fromMtgoList } from "../src/checker/mtgo";

const MIN_LISTS = 10;
const file = process.argv[2] ?? "data/reference-lists.jsonl";

async function main() {
  const index = loadCardIndex();
  const reports = new Map<string, { format: string; strategy: string; reports: ManaReport[] }>();
  for await (const line of createInterface({ input: createReadStream(file) })) {
    if (!line.trim()) continue;
    const l = JSON.parse(line) as { format: string; strategy: string; main: QtyName[]; side: QtyName[]; commander: QtyName[] };
    const deck = fromMtgoList(index, { format: l.format, main: l.main, side: l.side, commander: l.commander });
    const main: Entry[] = [];
    let unknown = false;
    for (const c of deck.main) {
      const card = index.getCard(c.name);
      if (!card) unknown = true;
      else main.push({ qty: c.qty, card });
    }
    if (unknown || main.length === 0) continue;
    const key = `${l.format}|${l.strategy}`;
    const row = reports.get(key) ?? { format: l.format, strategy: l.strategy, reports: [] };
    row.reports.push(analyzeMana(index, main));
    reports.set(key, row);
  }

  const profiles = [];
  const pass = new Map<string, { ok: number; total: number }>();
  for (const { format, strategy, reports: rs } of reports.values()) {
    if (rs.length < MIN_LISTS) continue;
    const profile = buildProfile(format, strategy, rs);
    profiles.push(profile);
    const p = pass.get(format) ?? { ok: 0, total: 0 };
    for (const r of rs) {
      p.total++;
      if (compareToArchetype(r, profile).length === 0) p.ok++;
    }
    pass.set(format, p);
  }
  for (const [format, p] of [...pass].sort()) {
    const n = profiles.filter((x) => x.format === format).length;
    console.log(`${format.padEnd(10)} ${n} archetypes, ${((p.ok / p.total) * 100).toFixed(1)}% of ${p.total} lists inside their archetype's mana bands`);
  }
  writeFileSync("data/archetype-mana.json", JSON.stringify(profiles));
  console.log(`wrote ${profiles.length} profiles to data/archetype-mana.json`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
