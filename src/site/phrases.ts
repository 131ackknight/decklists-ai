import type { ToolName } from "@/harness/tools";

/**
 * D-007: each brewer step becomes one friendly phrase. The step's note is its tool names joined by ", "
 * (brewV24's onStep); the first known tool decides. Typed over ToolName so a new tool fails the build
 * until it has a phrase.
 */
const PHRASES: Record<ToolName, string> = {
  meta: "Scouting the metagame",
  archetype: "Scouting the metagame",
  format_staples: "Scouting the metagame",
  search_cards: "Shuffling through the archives",
  find_tags: "Shuffling through the archives",
  card_info: "Shuffling through the archives",
  reference_list: "Studying the champions' lists",
  played_with: "Studying the champions' lists",
  synergy_candidates: "Hunting for hidden gems",
  mana_base: "Tuning the mana",
  draw_odds: "Tuning the mana",
  simulate: "Goldfishing a few hands",
  check_deck: "Double-checking legality",
  coach_check: "Double-checking legality",
  declare_plan: "Sleeving up the final list",
  submit_engine: "Sleeving up the final list",
  submit_brew: "Sleeving up the final list",
  submit_deck: "Sleeving up the final list",
};

export const FLAVOR_LINES: string[] = ["Pondering the multiverse", "Consulting the Oracle", "Tapping for inspiration", "Cracking a fetchland"];

let flavor = 0;

/** A flavor line, rotating so repeats are rare. */
export function flavorLine(): string {
  return FLAVOR_LINES[flavor++ % FLAVOR_LINES.length];
}

export function phraseForStep(note: string): string {
  for (const name of note.split(",")) {
    const phrase = PHRASES[name.trim() as ToolName];
    if (phrase) return phrase;
  }
  return flavorLine();
}
