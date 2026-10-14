import { readFileSync } from "node:fs";
import path from "node:path";
import { CardIndex } from "./card-index";
import type { CardIndexFile } from "./types";

export const SCRYFALL_DIR = path.join(process.cwd(), "data", "scryfall");
export const CARD_INDEX_PATH = path.join(SCRYFALL_DIR, "card-index.json");

let cached: CardIndex | null = null;

/** Load the card index built by `pnpm cards:build`. Cached per process. */
export function loadCardIndex(file = CARD_INDEX_PATH): CardIndex {
  if (cached) return cached;
  const parsed = JSON.parse(readFileSync(file, "utf8")) as CardIndexFile;
  cached = new CardIndex(parsed);
  return cached;
}
