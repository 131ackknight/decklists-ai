/**
 * Hand labels for the intent stage: the request type and hard constraints a
 * correct reading of each rubric prompt finds. "Tainted Pact in Modern" is a
 * brew by its words; the card pool, not the classifier, finds it illegal.
 */
import type { Intent } from "@/pipeline/intent";

export interface IntentLabel {
  type: Intent["type"];
  /** Other readings that are also correct. */
  alsoType?: Intent["type"][];
  /** Skip the color check when the request is ambiguous about colors. */
  colorsOpen?: boolean;
  /** Format key expected, or null when the player left it open. */
  format: string | null;
  namedCards: string[];
  colorsExactly?: string[];
  colorsExclude?: string[];
}

export const INTENT_LABELS: Record<string, IntentLabel> = {
  "premodern-mono-g-storm": { type: "brew", format: "premodern", namedCards: [], colorsExactly: ["G"] },
  "premodern-stock-goblins": { type: "stock", format: "premodern", namedCards: [] },
  "premodern-replenish-twist": { type: "brew", format: "premodern", namedCards: ["Replenish"], colorsExclude: ["U"] },
  "modern-named-two-cards": { type: "brew", format: "modern", namedCards: ["Thassa's Oracle", "Tainted Pact"] },
  "modern-tribal-brew": { type: "stock", format: "modern", namedCards: [] },
  "modern-off-meta-color": { type: "brew", format: "modern", namedCards: [], colorsExactly: ["W"] },
  // The supplied main deck is blue-black, so the sideboard is too.
  "legacy-sideboard-only": { type: "sideboard", format: "legacy", namedCards: [], colorsExactly: ["U", "B"] },
  // "Red aggro" may or may not mean mono red.
  "pauper-budget-aggro": { type: "stock", format: "pauper", namedCards: [], colorsOpen: true },
  "pioneer-named-card": { type: "brew", format: "pioneer", namedCards: ["Greasefang, Okiba Boss"] },
  "vintage-restricted": { type: "stock", format: "vintage", namedCards: [] },
  "standard-midrange": { type: "stock", format: "standard", namedCards: [], colorsExactly: ["B", "G"] },
  "legacy-impossible": { type: "impossible", format: "legacy", namedCards: [] },
  "timeless-no-data": { type: "stock", format: "timeless", namedCards: [] },
  "historic-no-data": { type: "stock", format: "historic", namedCards: [] },
  "oldschool-no-data": { type: "stock", format: "oldschool", namedCards: [] },
  "penny-no-data": { type: "stock", format: "penny", namedCards: [] },
  "premodern-paste-and-tune": { type: "tune", format: "premodern", namedCards: [] },
  "modern-combine-strategies": { type: "brew", format: "modern", namedCards: ["Living End"] },
  "pauper-named-common": { type: "brew", format: "pauper", namedCards: ["Kiln Fiend"] },
  "premodern-dream-halls-no-storm": { type: "brew", format: "premodern", namedCards: ["Dream Halls"] },
  "any-format-peter-parkers-camera": { type: "brew", format: null, namedCards: ["Peter Parker's Camera"] },
  "commander-atraxa-proliferate": { type: "brew", format: "commander", namedCards: ["Atraxa, Praetors' Voice"] },
  // "A red commander" could be multicolor (Boros, Rakdos), so no exact colors.
  "duel-commander-red-aggro": { type: "stock", alsoType: ["brew"], format: "duel", namedCards: [], colorsOpen: true },
  "premodern-vague": { type: "brew", format: "premodern", namedCards: [] },
};
