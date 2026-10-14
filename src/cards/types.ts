/** Legality values we keep. Scryfall's `not_legal` is dropped to save space. */
export type Legality = "legal" | "restricted" | "banned";

/** One card per Oracle ID, trimmed from Scryfall's Oracle Cards file. */
export interface Card {
  oracleId: string;
  name: string;
  /** Face names for split, transform, adventure and MDFC cards. */
  faces?: string[];
  manaCost: string;
  cmc: number;
  typeLine: string;
  text: string;
  colors: string[];
  identity: string[];
  keywords: string[];
  /** Only formats where the card is legal, restricted or banned. */
  legal: Record<string, Legality>;
  power?: string;
  toughness?: string;
  producedMana?: string[];
  edhrecRank?: number;
  /** Direct Scryfall Tagger oracle tags (slugs). Parents are not expanded. */
  tags: string[];
}

export interface Tag {
  slug: string;
  label: string;
  description: string;
  aliases: string[];
  parents: string[];
  children: string[];
}

export interface CardIndexFile {
  builtAt: string;
  source: { cards: string; tags: string };
  cards: Card[];
  tags: Tag[];
}
