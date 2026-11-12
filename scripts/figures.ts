/**
 * Draws the figures in docs/figures/ from the scoreboard. Free, and needs nothing outside the repository.
 *
 *   pnpm figures          (pnpm exec tsx scripts/figures.ts)
 *
 * PROGRESS.md is generated from the result files by scripts/scoreboard.ts; this reads its sections 2h, 2i
 * and 7a (evals/figures.ts) and writes one SVG per figure. Run it after the scoreboard. The figures show
 * only numbers the scoreboard prints.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { FIGURES, scoreboardData } from "../evals/figures";

const DIR = "docs/figures";
const data = scoreboardData(readFileSync("PROGRESS.md", "utf8"));
mkdirSync(DIR, { recursive: true });
for (const [file, draw] of FIGURES) {
  writeFileSync(`${DIR}/${file}`, draw(data));
  console.log(`wrote ${DIR}/${file}`);
}
