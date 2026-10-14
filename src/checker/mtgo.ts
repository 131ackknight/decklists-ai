import type { CardIndex } from "@/cards/card-index";
import { getFormat } from "@/cards/formats";
import { canBeCommander, type DeckInput } from "./check";

/**
 * MTGO decklists put the commander, and any companion, in the sideboard
 * slot. For commander formats with no commander given, move a companion
 * (Lurrus) to its own zone and the cards that can lead the deck (one, or
 * two partners) into the commander zone.
 */
export function fromMtgoList(index: CardIndex, deck: DeckInput): DeckInput {
  const format = getFormat(deck.format);
  if (!format?.commander || (deck.commander?.length ?? 0) > 0) return deck;
  const isCompanion = (name: string) => index.getCard(name)?.keywords.includes("Companion") ?? false;
  const all = deck.side ?? [];
  const companion = all.length > 1 ? all.filter((line) => isCompanion(line.name)).slice(0, 1) : [];
  const side = all.filter((line) => !companion.includes(line));
  const leaders = side.filter((line) => {
    const card = index.getCard(line.name);
    return card != null && line.qty === 1 && canBeCommander(card);
  });
  if (leaders.length === 0 || leaders.length > 2) return deck;
  return {
    ...deck,
    commander: leaders,
    companion: companion.length > 0 ? companion : deck.companion,
    side: side.filter((line) => !leaders.includes(line)),
  };
}
