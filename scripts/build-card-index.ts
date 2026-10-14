/**
 * Download Scryfall's Oracle Cards and Oracle Tags bulk files and build
 * data/scryfall/card-index.json.
 *
 *   pnpm cards:build
 *
 * Bulk files are cached by Scryfall's dated filename, so reruns on the
 * same day skip the download. Scryfall refreshes them daily.
 */
import { createReadStream, existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline";
import { createGunzip } from "node:zlib";
import type { Card, CardIndexFile, Legality, Tag } from "../src/cards/types";
import { CARD_INDEX_PATH, SCRYFALL_DIR } from "../src/cards/load";

const UA = { "User-Agent": "decklists-ai/0.1", Accept: "application/json" };

interface BulkEntry {
  type: string;
  jsonl_download_uri: string;
}

async function download(type: string): Promise<string> {
  const res = await fetch("https://api.scryfall.com/bulk-data", { headers: UA });
  if (!res.ok) throw new Error(`bulk-data listing failed: ${res.status}`);
  const { data } = (await res.json()) as { data: BulkEntry[] };
  const entry = data.find((d) => d.type === type);
  if (!entry) throw new Error(`No bulk file of type ${type}`);
  const file = path.join(SCRYFALL_DIR, path.basename(new URL(entry.jsonl_download_uri).pathname));
  if (existsSync(file)) return file;
  console.log(`downloading ${type}`);
  const body = await fetch(entry.jsonl_download_uri, { headers: UA });
  if (!body.ok) throw new Error(`${type} download failed: ${body.status}`);
  writeFileSync(file, Buffer.from(await body.arrayBuffer()));
  return file;
}

async function* readJsonl<T>(file: string): AsyncGenerator<T> {
  const lines = createInterface({ input: createReadStream(file).pipe(createGunzip()) });
  for await (const line of lines) if (line.trim()) yield JSON.parse(line) as T;
}

interface ScryfallFace {
  name: string;
  mana_cost?: string;
  type_line?: string;
  oracle_text?: string;
  colors?: string[];
  power?: string;
  toughness?: string;
}

interface ScryfallPrinting {
  oracle_id?: string;
  legalities?: Record<string, string>;
  name: string;
  lang?: string;
  printed_name?: string;
  flavor_name?: string;
  card_faces?: { printed_name?: string; flavor_name?: string }[];
}

interface ScryfallCard extends ScryfallFace {
  oracle_id?: string;
  cmc?: number;
  color_identity: string[];
  keywords?: string[];
  legalities: Record<string, string>;
  produced_mana?: string[];
  edhrec_rank?: number;
  card_faces?: ScryfallFace[];
}

interface ScryfallTag {
  slug: string;
  label: string;
  description?: string;
  aliases?: string[];
  id: string;
  parent_ids?: string[];
  child_ids?: string[];
  taggings: { oracle_id: string }[];
}

const RANK: Record<string, number> = { legal: 1, banned: 2, restricted: 3 };

function toCard(
  c: ScryfallCard,
  tags: string[],
  aliases: string[],
  printingLegal: Record<string, Legality> = {},
): Card | null {
  if (!c.oracle_id) return null;
  const legal: Record<string, Legality> = { ...printingLegal };
  for (const [format, status] of Object.entries(c.legalities)) {
    if (status === "legal" || status === "restricted" || status === "banned") {
      if (!legal[format] || RANK[status] > RANK[legal[format]]) legal[format] = status;
    }
  }
  if (Object.keys(legal).length === 0) return null;

  const faces = c.card_faces ?? [];
  const join = (pick: (f: ScryfallFace) => string | undefined) =>
    faces
      .map(pick)
      .filter((v): v is string => !!v)
      .join(" // ");
  const colors = c.colors ?? [...new Set(faces.flatMap((f) => f.colors ?? []))];

  return {
    oracleId: c.oracle_id,
    name: c.name,
    faces: faces.length > 1 ? faces.map((f) => f.name) : undefined,
    aliases: aliases.length > 0 ? aliases : undefined,
    manaCost: c.mana_cost || join((f) => f.mana_cost),
    cmc: c.cmc ?? 0,
    typeLine: c.type_line || join((f) => f.type_line),
    text: c.oracle_text ?? join((f) => f.oracle_text),
    colors,
    identity: c.color_identity,
    keywords: c.keywords ?? [],
    legal,
    power: c.power ?? faces[0]?.power,
    toughness: c.toughness ?? faces[0]?.toughness,
    producedMana: c.produced_mana,
    edhrecRank: c.edhrec_rank,
    tags,
  };
}

async function main() {
  mkdirSync(SCRYFALL_DIR, { recursive: true });
  const cardsFile = await download("oracle_cards");
  const tagsFile = await download("oracle_tags");
  const printingsFile = await download("default_cards");

  // Alternate English names from other printings, e.g. MTGO's "Through the
  // Omenpaths" names for Universes Beyond cards ("Kavaero, Mind-Bitten" is
  // Superior Spider-Man). Decklists from MTGO use these.
  const aliasesByOracle = new Map<string, Set<string>>();
  // Some formats are legal per printing (Old School 93/94 allows only 1993-94
  // printings), and the Oracle file keeps one modern printing. A card is legal
  // in a format if any printing is.
  const legalByOracle = new Map<string, Record<string, Legality>>();
  for await (const p of readJsonl<ScryfallPrinting>(printingsFile)) {
    if (!p.oracle_id || (p.lang && p.lang !== "en")) continue;
    for (const [format, status] of Object.entries(p.legalities ?? {})) {
      if (status !== "legal" && status !== "restricted" && status !== "banned") continue;
      const row = legalByOracle.get(p.oracle_id) ?? {};
      if (!row[format] || RANK[status] > RANK[row[format]]) row[format] = status;
      legalByOracle.set(p.oracle_id, row);
    }
    const names = [p.printed_name, p.flavor_name, ...(p.card_faces ?? []).flatMap((f) => [f.printed_name, f.flavor_name])];
    for (const alt of names) {
      if (!alt || alt === p.name) continue;
      const set = aliasesByOracle.get(p.oracle_id) ?? new Set<string>();
      set.add(alt);
      aliasesByOracle.set(p.oracle_id, set);
    }
  }

  const rawTags: ScryfallTag[] = [];
  for await (const t of readJsonl<ScryfallTag>(tagsFile)) rawTags.push(t);
  const slugById = new Map(rawTags.map((t) => [t.id, t.slug]));
  const tagsByOracle = new Map<string, string[]>();
  for (const t of rawTags) {
    for (const { oracle_id } of t.taggings) {
      const list = tagsByOracle.get(oracle_id) ?? [];
      list.push(t.slug);
      tagsByOracle.set(oracle_id, list);
    }
  }
  const tags: Tag[] = rawTags.map((t) => ({
    slug: t.slug,
    label: t.label,
    description: t.description ?? "",
    aliases: t.aliases ?? [],
    parents: (t.parent_ids ?? []).map((id) => slugById.get(id)).filter((s): s is string => !!s),
    children: (t.child_ids ?? []).map((id) => slugById.get(id)).filter((s): s is string => !!s),
  }));

  const cards: Card[] = [];
  for await (const raw of readJsonl<ScryfallCard>(cardsFile)) {
    const card = toCard(
      raw,
      tagsByOracle.get(raw.oracle_id ?? "") ?? [],
      [...(aliasesByOracle.get(raw.oracle_id ?? "") ?? [])],
      legalByOracle.get(raw.oracle_id ?? ""),
    );
    if (card) cards.push(card);
  }

  const out: CardIndexFile = {
    builtAt: new Date().toISOString(),
    source: { cards: path.basename(cardsFile), tags: path.basename(tagsFile) },
    cards,
    tags,
  };
  writeFileSync(CARD_INDEX_PATH, JSON.stringify(out));
  const tagged = cards.filter((c) => c.tags.length > 0).length;
  const aliased = cards.filter((c) => c.aliases).length;
  console.log(`${cards.length} cards (${tagged} tagged, ${aliased} with alternate names), ${tags.length} tags -> ${CARD_INDEX_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
