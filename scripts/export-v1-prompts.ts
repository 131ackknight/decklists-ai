/**
 * Write the rubric prompts in the shape the v1 builder takes, with the two
 * "[list pasted in eval]" placeholders filled from Decklist Data's export.
 *
 *   pnpm exec tsx scripts/export-v1-prompts.ts data/reference-lists.jsonl > v1-prompts.json
 *
 * v1 only builds Premodern, Modern, Legacy, Vintage, Pauper, Standard and
 * Pioneer. Other formats are marked unsupported and scored as such. A
 * prompt with no format goes to Modern, v1's default.
 */
import { readFileSync } from "node:fs";
import { RUBRIC_PROMPTS } from "../evals/rubric/prompts";

const V1_FORMATS = ["Premodern", "Modern", "Legacy", "Vintage", "Pauper", "Standard", "Pioneer"];

/** Which real list fills each pasted-list prompt: latest list of this strategy. */
const PASTED: Record<string, { format: string; strategy: string; mainOnly: boolean }> = {
  "legacy-sideboard-only": { format: "legacy", strategy: "Dimir Tempo", mainOnly: true },
  "premodern-paste-and-tune": { format: "premodern", strategy: "UB Psychatog", mainOnly: false },
};

interface Line {
  qty: number;
  name: string;
}
interface RefList {
  format: string;
  strategy: string;
  date: string;
  main: Line[];
  side: Line[];
}

const file = process.argv[2] ?? "data/reference-lists.jsonl";
const latest = new Map<string, RefList>();
for (const line of readFileSync(file, "utf8").split("\n")) {
  if (!line.trim()) continue;
  const l = JSON.parse(line) as RefList;
  const key = `${l.format}|${l.strategy}`;
  const prev = latest.get(key);
  if (!prev || l.date > prev.date) latest.set(key, l);
}

const asText = (l: RefList, mainOnly: boolean) =>
  [
    ...l.main.map((c) => `${c.qty} ${c.name}`),
    ...(mainOnly || l.side.length === 0 ? [] : ["", "Sideboard", ...l.side.map((c) => `${c.qty} ${c.name}`)]),
  ].join("\n");

const out = RUBRIC_PROMPTS.map((p) => {
  let prompt = p.prompt;
  const pasted = PASTED[p.id];
  if (pasted) {
    const list = latest.get(`${pasted.format}|${pasted.strategy}`);
    if (!list) throw new Error(`No ${pasted.strategy} list for ${p.id}`);
    prompt = prompt.replace(/\[[^\]]*pasted in eval\]/, `\n\n${asText(list, pasted.mainOnly)}`);
  }
  const sentFormat = p.format === "Any" ? "Modern" : p.format;
  return {
    id: p.id,
    format: p.format,
    sentFormat: V1_FORMATS.includes(sentFormat) ? sentFormat : null,
    prompt,
  };
});

process.stdout.write(JSON.stringify(out, null, 1) + "\n");
