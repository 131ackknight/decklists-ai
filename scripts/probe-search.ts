/**
 * Spot-check card search against the real index.
 *
 *   pnpm exec tsx scripts/probe-search.ts
 */
import { loadCardIndex } from "../src/cards/load";
import { searchCards, type SearchCardsInput } from "../src/cards/search";

const index = loadCardIndex();

function show(label: string, input: SearchCardsInput) {
  const r = searchCards(index, input);
  const unknown = r.unknownTags.length > 0 ? ` (unknown tags: ${r.unknownTags.join(", ")})` : "";
  console.log(`\n${label}: ${r.total} matches${unknown}`);
  for (const c of r.cards) console.log(`  ${c.name} ${c.manaCost} [${c.matchedTags.join(", ")}]`);
}

show("Premodern green untappers", { format: "premodern", colors: ["G"], tags: ["untapper"], limit: 15 });
show("Premodern green storm", { format: "premodern", colors: ["G"], keyword: "storm" });
show("Pioneer black removal, 2 mana or less", {
  format: "pioneer",
  colors: ["B"],
  tags: ["removal"],
  maxCmc: 2,
  limit: 10,
});

console.log("\nName lookups:");
console.log("  fire // ice ->", index.getCard("fire // ice")?.name);
console.log("  Delver of Secrets faces ->", index.getCard("Delver of Secrets")?.faces);
console.log("  Lim-Dul's Vault ->", index.getCard("Lim-Dul's Vault")?.name);
console.log("\nTags containing 'graveyard':", index.findTags("graveyard", 10).map((t) => t.slug));
