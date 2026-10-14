import { z } from "zod";
import type { CardIndex } from "./card-index";
import { getFormat } from "./formats";
import type { Card } from "./types";

const COLOR = z.enum(["W", "U", "B", "R", "G"]);

/** Input contract for the `search_cards` tool. */
export const SearchCardsInput = z.object({
  format: z.string().describe("Format name or key, e.g. Premodern or modern."),
  colors: z
    .array(COLOR)
    .optional()
    .describe(
      "Deck colors. A card fits if its color identity (cost and abilities) is inside them; colorless always fits. Omit to also see off-color Phyrexian-mana cards like Dismember.",
    ),
  tags: z
    .array(z.string())
    .optional()
    .describe("Function tags, e.g. removal, mana-dork, untapper. A card matches if it has any of them or a tag beneath them."),
  allTags: z.array(z.string()).optional().describe("Card must match every one of these tags."),
  types: z
    .union([z.string(), z.array(z.string())])
    .transform((v) => (typeof v === "string" ? [v] : v))
    .optional()
    .describe("Every word must appear in the type line, e.g. creature, elf."),
  text: z.string().optional().describe("Case-insensitive substring of the rules text."),
  keyword: z.string().optional().describe("Keyword ability, e.g. Storm, Flash."),
  minCmc: z.number().optional(),
  maxCmc: z.number().optional(),
  limit: z.number().int().min(1).max(50).default(20),
});

export type SearchCardsInput = z.input<typeof SearchCardsInput>;

export interface CardHit {
  name: string;
  manaCost: string;
  cmc: number;
  typeLine: string;
  text: string;
  power?: string;
  toughness?: string;
  /** Which requested tags this card matched. */
  matchedTags: string[];
  restricted?: boolean;
}

export interface SearchResult {
  format: string;
  total: number;
  cards: CardHit[];
  /** Requested tags the index does not know. */
  unknownTags: string[];
}

/**
 * Color identity, not card color: lands are colorless but Otawara still
 * needs blue, and an off-color activated ability is dead in the deck.
 */
function fitsColors(card: Card, colors: Set<string>): boolean {
  return card.identity.every((c) => colors.has(c));
}

/**
 * Filter the card pool. Sorted by EDHREC rank as a rough popularity
 * proxy until Decklist Data play rates arrive (step 6).
 */
export function searchCards(index: CardIndex, raw: SearchCardsInput): SearchResult {
  const input = SearchCardsInput.parse(raw);
  const format = getFormat(input.format);
  if (!format) throw new Error(`Unknown format "${input.format}".`);

  const unknownTags: string[] = [];
  const anyTagSets = (input.tags ?? []).map((t) => {
    const set = index.tagWithDescendants(t);
    if (set.size === 0) unknownTags.push(t);
    return { tag: t, set };
  });
  const allTagSets = (input.allTags ?? []).map((t) => {
    const set = index.tagWithDescendants(t);
    if (set.size === 0) unknownTags.push(t);
    return { tag: t, set };
  });
  const colors = input.colors ? new Set(input.colors) : null;
  const types = (input.types ?? []).map((t) => t.toLowerCase());
  const text = input.text?.toLowerCase();
  const keyword = input.keyword?.toLowerCase();

  const hits: { card: Card; matched: string[] }[] = [];
  for (const card of index.cards) {
    const status = card.legal[format.key];
    if (status !== "legal" && status !== "restricted") continue;
    if (colors && !fitsColors(card, colors)) continue;
    if (input.minCmc != null && card.cmc < input.minCmc) continue;
    if (input.maxCmc != null && card.cmc > input.maxCmc) continue;
    if (types.length > 0) {
      const line = card.typeLine.toLowerCase();
      if (!types.every((t) => line.includes(t))) continue;
    }
    if (text && !card.text.toLowerCase().includes(text)) continue;
    if (keyword && !card.keywords.some((k) => k.toLowerCase() === keyword)) continue;

    const matched: string[] = [];
    if (anyTagSets.length > 0) {
      for (const { tag, set } of anyTagSets) {
        if (card.tags.some((t) => set.has(t))) matched.push(tag);
      }
      if (matched.length === 0) continue;
    }
    let allOk = true;
    for (const { tag, set } of allTagSets) {
      if (card.tags.some((t) => set.has(t))) matched.push(tag);
      else allOk = false;
    }
    if (!allOk) continue;

    hits.push({ card, matched });
  }

  hits.sort(
    (a, b) =>
      (a.card.edhrecRank ?? Infinity) - (b.card.edhrecRank ?? Infinity) ||
      a.card.name.localeCompare(b.card.name),
  );

  return {
    format: format.name,
    total: hits.length,
    unknownTags,
    cards: hits.slice(0, input.limit).map(({ card, matched }) => ({
      name: card.name,
      manaCost: card.manaCost,
      cmc: card.cmc,
      typeLine: card.typeLine,
      text: card.text,
      power: card.power,
      toughness: card.toughness,
      matchedTags: matched,
      restricted: card.legal[format.key] === "restricted" || undefined,
    })),
  };
}
