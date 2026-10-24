/**
 * Can the AI pick the deck the owner would play? (2026-10-24)
 *
 *   pnpm exec tsx scripts/picker-test.ts [--dry] [--model claude-opus-5-5]
 *
 * Pairs of decks for one prompt where the owner said yes to one and no to the
 * other: the blind panel's v2 vs v18 splits, plus v18's two builds where the
 * owner's verdicts differ. The picker sees the request and both main decks
 * with card text, never the replies or the owner's notes, and picks one. Each
 * pair is asked in both orders, so a lean toward "A" can't pass for judgment.
 * Score: how often it picks the owner's yes (50% = can't tell).
 */
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { readFileSync, writeFileSync } from "node:fs";
import { z } from "zod";
import { loadCardIndex } from "../src/cards/load";
import { costUsd, MODELS } from "../src/harness/models";

try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local: rely on the environment.
}

interface Line {
  qty: number;
  name: string;
}
interface Result {
  id: string;
  format: string;
  prompt: string;
  deck: { main: Line[]; side: Line[] } | null;
}
const R = "evals/results/round4";
const load = (f: string) => new Map((JSON.parse(readFileSync(`${R}/${f}`, "utf8")).results as Result[]).map((r) => [r.id, r]));
const panelV2 = load("expert2+expert3-v2-claude-opus-5-5-panel.json");
const panelV18 = load("expert2+expert3-v18-claude-opus-5-5-panel.json");
const firstV18 = load("expert2+expert3-v18-claude-opus-5-5-partial.json");
const answers = JSON.parse(readFileSync(`${R}/play-panel-1-answers.json`, "utf8")) as { item: string; harness: string; play: string }[];
const verdict = (item: string, harness: string) => answers.find((a) => a.item === item && a.harness === harness)?.play === "yes";

// The owner's verdicts on v18's first builds (2026-10-24, "better than last time" page): closer and further count as no.
const FIRST_V18_YES = new Set(["expert2-premodern-rising-waters", "expert2-premodern-mind-over-matter", "expert3-premodern-mill", "expert3-premodern-nether-spirit", "expert3-premodern-zurs-weirding"]);

const pairs: { item: string; yes: Result; no: Result; source: string }[] = [];
for (const [item, b] of panelV18) {
  const a = panelV2.get(item)!;
  const [ya, yb] = [verdict(item, "v2"), verdict(item, "v18")];
  if (ya !== yb) pairs.push({ item, yes: ya ? a : b, no: ya ? b : a, source: "v2 vs v18" });
  const f = firstV18.get(item);
  if (f && FIRST_V18_YES.has(item) !== yb) pairs.push({ item, yes: yb ? b : f, no: yb ? f : b, source: "v18 two builds" });
}

const Pick = z.object({ choice: z.enum(["A", "B"]), why: z.string().describe("Two or three sentences.") });
const model = MODELS[process.argv.includes("--model") ? process.argv[process.argv.indexOf("--model") + 1] : "claude-opus-5-5"];

async function main() {
  console.log(`${pairs.length} pairs: ${pairs.map((p) => `${p.item.replace(/^expert\d-/, "")} (${p.source})`).join(", ")}`);
  if (process.argv.includes("--dry")) return;
  const index = loadCardIndex();
  const client = new Anthropic();
  const list = (d: Result) => d.deck!.main.map((l) => `${l.qty} ${l.name}`).join("\n");
  const out: unknown[] = [];
  let right = 0;
  let total = 0;
  let pickedA = 0;
  let spent = 0;
  for (const p of pairs) {
    const names = [...new Set([...p.yes.deck!.main, ...p.no.deck!.main].map((l) => l.name))];
    const text = names
      .map((n) => index.getCard(n))
      .filter((c): c is NonNullable<typeof c> => !!c && !/\bBasic\b/.test(c.typeLine))
      .map((c) => `- ${c.name} | ${c.manaCost} ${c.typeLine}: ${c.text}`)
      .join("\n");
    const verdicts: string[] = [];
    for (const [A, B] of [
      [p.yes, p.no],
      [p.no, p.yes],
    ]) {
      const msg = await client.messages.parse({
        model: model.id,
        max_tokens: 16000,
        system:
          "You are a strong Magic: The Gathering player judging two brews built for the same request. Pick the one a strong player would rather take to a tournament in this format: does it do what was asked, does the plan hang together, are the card choices and numbers right, does the mana work. Judge the decks only.",
        messages: [{ role: "user", content: `Format: ${p.yes.format}\nRequest: ${p.yes.prompt}\n\nDeck A:\n${list(A)}\n\nDeck B:\n${list(B)}\n\nCard text:\n${text}` }],
        output_config: { effort: "high", format: zodOutputFormat(Pick) },
      });
      const cost = costUsd(model, { input: msg.usage.input_tokens, output: msg.usage.output_tokens, cacheRead: 0, cacheWrite: 0 });
      spent += cost;
      const pick = msg.parsed_output?.choice;
      const correct = (pick === "A") === (A === p.yes);
      if (pick === "A") pickedA++;
      if (correct) right++;
      total++;
      verdicts.push(correct ? "right" : "wrong");
      out.push({ item: p.item, source: p.source, yesFirst: A === p.yes, pick, correct, why: msg.parsed_output?.why, costUsd: cost });
    }
    console.log(`${p.item.padEnd(40)} ${p.source.padEnd(15)} ${verdicts.join(" / ")}`);
  }
  console.log(`\nPicked your yes ${right} of ${total} (${Math.round((right / total) * 100)}%; 50% = can't tell). Picked "A" ${pickedA} of ${total}. Total $${spent.toFixed(2)}`);
  writeFileSync(`${R}/picker-test.json`, JSON.stringify({ ranAt: new Date().toISOString(), model: model.id, right, total, pickedA, results: out }, null, 1));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
