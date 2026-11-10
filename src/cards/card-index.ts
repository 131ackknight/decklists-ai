import { normalizeName } from "./names";
import { standardEnds, standardLegalOn, type StandardWindows } from "./standard";
import type { Card, CardIndexFile, Tag } from "./types";

/** In-memory card and tag lookup built from the index file. */
export class CardIndex {
  readonly cards: Card[];
  private readonly byName = new Map<string, Card>();
  private readonly tagsBySlug = new Map<string, Tag>();
  private readonly tagAlias = new Map<string, string>();
  private readonly descendantCache = new Map<string, Set<string>>();

  constructor(file: Pick<CardIndexFile, "cards" | "tags">) {
    this.cards = file.cards;
    for (const card of file.cards) {
      this.byName.set(normalizeName(card.name), card);
      for (const face of [...(card.faces ?? []), ...(card.aliases ?? [])]) {
        const key = normalizeName(face);
        if (!this.byName.has(key)) this.byName.set(key, card);
      }
    }
    for (const tag of file.tags) {
      this.tagsBySlug.set(tag.slug, tag);
      for (const alias of tag.aliases) this.tagAlias.set(alias, tag.slug);
    }
  }

  /**
   * The same index without cards that didn't exist yet on `date`, for evals rebuilt as of a past day.
   * `released` is the paper date and MTGO often gets a set days earlier, so cards in `seen`
   * (normalized names already played on MTGO by then) count as existing too.
   */
  asOf(date: string, seen: Set<string> = new Set(), standard?: StandardWindows): CardIndex {
    const exists = (c: Card) => !c.released || c.released <= date || seen.has(normalizeName(c.name));
    let cards = this.cards.filter(exists);
    // Harness v22 (2026-11-08): Standard legality on `date`, not today's (src/cards/standard.ts). A card
    // already played by then (`seen`) whose set came out within 30 days counts, as MTGO gets sets early.
    if (standard) {
      const ends = standardEnds(standard);
      const soon = new Date(Date.parse(date) + 30 * 86_400_000).toISOString().slice(0, 10);
      cards = cards.map((c) => {
        const ok = standardLegalOn(standard, ends, c.name, date) || (seen.has(normalizeName(c.name)) && standardLegalOn(standard, ends, c.name, soon));
        const status = ok ? (c.legal.standard === "banned" ? "banned" : "legal") : undefined;
        if (status === c.legal.standard) return c;
        const legal = { ...c.legal };
        if (status) legal.standard = status;
        else delete legal.standard;
        return { ...c, legal };
      });
    }
    return new CardIndex({ cards, tags: [...this.tagsBySlug.values()] });
  }

  getCard(name: string): Card | undefined {
    return this.byName.get(normalizeName(name));
  }

  getTag(slugOrAlias: string): Tag | undefined {
    const slug = slugOrAlias.trim().toLowerCase();
    return this.tagsBySlug.get(slug) ?? this.tagsBySlug.get(this.tagAlias.get(slug) ?? "");
  }

  /** The tag plus every tag beneath it. Unknown tags return an empty set. */
  tagWithDescendants(slugOrAlias: string): Set<string> {
    const root = this.getTag(slugOrAlias);
    if (!root) return new Set();
    const cached = this.descendantCache.get(root.slug);
    if (cached) return cached;
    const out = new Set<string>();
    const stack = [root.slug];
    while (stack.length > 0) {
      const slug = stack.pop()!;
      if (out.has(slug)) continue;
      out.add(slug);
      for (const child of this.tagsBySlug.get(slug)?.children ?? []) stack.push(child);
    }
    this.descendantCache.set(root.slug, out);
    return out;
  }

  /** Tag slugs containing the query, for the model to discover vocabulary. */
  findTags(query: string, limit = 20): Tag[] {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const hits: Tag[] = [];
    for (const tag of this.tagsBySlug.values()) {
      if (
        tag.slug.includes(q) ||
        tag.label.toLowerCase().includes(q) ||
        tag.aliases.some((a) => a.includes(q))
      ) {
        hits.push(tag);
      }
    }
    return hits.sort((a, b) => a.slug.length - b.slug.length).slice(0, limit);
  }
}
