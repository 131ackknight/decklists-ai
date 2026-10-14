import type { CardIndex } from "@/cards/card-index";
import { getFormat } from "@/cards/formats";
import { canBeCommander, type DeckInput } from "./check";

/**
 * MTGO decklists put the commander in the sideboard slot. For commander
 * formats with no commander given, move sideboard cards that can lead a
 * deck (one, or two partners) into the commander zone.
 */
export function fromMtgoList(index: CardIndex, deck: DeckInput): DeckInput {
  const format = getFormat(deck.format);
  if (!format?.commander || (deck.commander?.length ?? 0) > 0) return deck;
  const side = deck.side ?? [];
  const leaders = side.filter((line) => {
    const card = index.getCard(line.name);
    return card != null && line.qty === 1 && canBeCommander(card);
  });
  if (leaders.length === 0 || leaders.length > 2) return deck;
  return {
    ...deck,
    commander: leaders,
    side: side.filter((line) => !leaders.includes(line)),
  };
}
