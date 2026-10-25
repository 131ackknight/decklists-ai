/**
 * Text playtest (2026-10-24): does playing a deck out find what the owner found?
 *
 *   pnpm exec tsx scripts/playtest.ts [--dry] [--games 2] [--from 5]
 *
 * The owner's notes are mostly problems that only show when the deck is played
 * (Wildfire kills its own creatures, Seismic Assault has no lands to throw), and
 * nothing in the harness ever plays a deck. Here the AI pilots each deck the
 * owner flagged through sample games: code shuffles the deck and deals the hand
 * and draws (no picking easy hands), the opponent is the format's most-played
 * deck, and the pilot then lists the problems it hit. It never sees the owner's
 * note. A separate grader call compares the report with the note.
 */
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { readFileSync, writeFileSync } from "node:fs";
import { z } from "zod";
import { loadCardIndex } from "../src/cards/load";
import { FileDataSource } from "../src/data/source";
import { costUsd, MODELS, type Usage } from "../src/harness/models";
import { dealGame as deal } from "../src/harness/playtest";

try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local: rely on the environment.
}

const R = "evals/results/round4";
// The deck each note was written about, and the note (the grader's answer key only).
const CASES = [
  { item: "expert2-legacy-hypergenesis", file: "expert2-v11-claude-opus-5-5.json" },
  { item: "expert2-premodern-seismic-assault", file: "expert2-v11-claude-opus-5-5.json" },
  { item: "expert2-premodern-mind-over-matter", file: "expert2-v11-claude-opus-5-5.json" },
  { item: "expert2-premodern-rofellos", file: "expert2-v11-claude-opus-5-5.json" },
  { item: "expert2-legacy-scapeshift", file: "expert2-v11-claude-opus-5-5.json" },
  { item: "expert2-legacy-kiki-pestermite", file: "expert2-v11-claude-opus-5-5.json" },
  { item: "expert2-legacy-bomberman", file: "expert2-v12-claude-opus-5-5-partial.json" },
  { item: "expert2-legacy-scapeshift", file: "expert2-v12-claude-opus-5-5-partial.json" },
  { item: "expert2-premodern-mind-over-matter", file: "expert2-v12-claude-opus-5-5-partial.json" },
  { item: "expert3-premodern-wildfire", file: "expert3-v12-claude-opus-5-5.json" },
  { item: "expert3-premodern-mill", file: "expert3-v12-claude-opus-5-5.json" },
  { item: "expert2-legacy-kiki-pestermite", file: "expert2+expert3-v18-claude-opus-5-5-panel.json" },
  { item: "expert2-premodern-mind-over-matter", file: "expert2+expert3-v18-claude-opus-5-5-panel.json" },
  { item: "expert2-premodern-seismic-assault", file: "expert2+expert3-v2-claude-opus-5-5-panel.json" },
];
const SOURCE: Record<string, string> = {
  "expert2-v11-claude-opus-5-5.json": "play-expert2-v11",
  "expert2-v12-claude-opus-5-5-partial.json": "play-expert2-v12",
  "expert3-v12-claude-opus-5-5.json": "play-expert3-v12",
};
const HARNESS: Record<string, string> = { "expert2+expert3-v18-claude-opus-5-5-panel.json": "v18", "expert2+expert3-v2-claude-opus-5-5-panel.json": "v2" };

const Report = z.object({
  games: z.string().describe("Each game turn by turn, one line per turn, at most 12 lines per game."),
  problems: z.array(z.object({ problem: z.string(), cards: z.array(z.string()) })).describe("Problems the games showed, most important first."),
});
const Grade = z.object({ found: z.enum(["yes", "partly", "no"]), which: z.string().describe("The report's line that matches, or 'none'.") });

async function main() {
  const games = Number(process.argv.includes("--games") ? process.argv[process.argv.indexOf("--games") + 1] : 2);
  // --from N resumes at case N (0-based) and appends to the saved results; seeds stay tied to the case number.
  const from = Number(process.argv.includes("--from") ? process.argv[process.argv.indexOf("--from") + 1] : 0);
  const notes = JSON.parse(readFileSync("evals/owner-notes/notes.json", "utf8")) as { item: string; note: string; source?: string; harness?: string }[];
  const cases = CASES.map((c) => {
    const r = (JSON.parse(readFileSync(`${R}/${c.file}`, "utf8")).results as { id: string; format: string; prompt: string; deck: { main: { qty: number; name: string }[] } }[]).find((x) => x?.id === c.item)!;
    const note = notes.find((n) => n.item === c.item && (SOURCE[c.file] ? n.source === SOURCE[c.file] : n.harness === HARNESS[c.file]))!;
    return { ...c, r, note: note.note };
  });
  console.log(`${cases.length} decks`);
  if (process.argv.includes("--dry")) {
    for (const c of cases) console.log(`  ${c.item} (${c.file}): ${c.note.slice(0, 80)}`);
    return;
  }
  const index = loadCardIndex();
  const today = await FileDataSource.load("data/reference-lists.jsonl", index);
  const model = MODELS["claude-opus-5-5"];
  const client = new Anthropic();
  const cost = (u: Anthropic.Usage) => costUsd(model, { input: u.input_tokens, output: u.output_tokens, cacheRead: 0, cacheWrite: 0 } as Usage);
  let spent = 0;
  const tally = { yes: 0, partly: 0, no: 0 };
  const outFile = `${R}/playtest.json`;
  const out: unknown[] = from > 0 ? (JSON.parse(readFileSync(outFile, "utf8")).results as unknown[]) : [];
  for (const [n, c] of cases.entries()) {
    if (n < from) continue;
    const fmt = c.r.format.toLowerCase();
    const opponent = today.meta(fmt)[0]?.strategy ?? "a typical deck";
    const text = [...new Set(c.r.deck.main.map((l) => l.name))]
      .map((x) => index.getCard(x))
      .filter((x): x is NonNullable<typeof x> => !!x && !/\bBasic\b/.test(x.typeLine))
      .map((x) => `- ${x.name} | ${x.manaCost} ${x.typeLine}: ${x.text}`)
      .join("\n");
    const dealt = Array.from({ length: games }, (_, g) => deal(c.r.deck.main, 1000 * n + g + 1));
    let msg;
    try {
      msg = await client.messages.parse({
      model: model.id,
      max_tokens: 21000,
      system:
        "You are a strong Magic: The Gathering player playtesting a brew before a tournament. Play each game honestly with the cards you are dealt, turn by turn, as the deck's pilot, on the play. Track your mana, life and board. The opponent plays its deck's usual game: assume sensible draws and plays for it. After the games, list the problems the games showed: cards that were dead or hurt you, things the plan needed and didn't have, cards that didn't earn their slot, mana trouble. Be concrete and name cards.",
      messages: [
        {
          role: "user",
          content: [
            `Format: ${c.r.format}. The player asked: ${c.r.prompt}`,
            `Deck:\n${c.r.deck.main.map((l) => `${l.qty} ${l.name}`).join("\n")}`,
            `Card text:\n${text}`,
            `Opponent: ${opponent}, the most-played deck in the format.`,
            ...dealt.map(
              (d, g) =>
                `Game ${g + 1}. Opening hand: ${d.hand.join(", ")}. Your draws, in order, from turn 2: ${d.draws.join(", ")}. (If you would mulligan the opening hand, say so and play this 7 instead: ${d.backupHand.join(", ")}.)`,
            ),
          ].join("\n\n"),
        },
      ],
      output_config: { effort: "high", format: zodOutputFormat(Report) },
    });
    } catch (err) {
      console.log(`${c.item.replace(/^expert\d-/, "").padEnd(30)} failed: ${(err as Error).message.slice(0, 100)}`);
      continue;
    }
    spent += cost(msg.usage);
    const report = msg.parsed_output!;
    const graded = await client.messages.parse({
      model: model.id,
      max_tokens: 4000,
      system: "You compare a playtest report with a strong player's note on the same deck. Say whether the report identifies the problem the note describes (the same problem, even in other words): yes, partly (part of it, or a weaker version), or no.",
      messages: [{ role: "user", content: `The player's note: ${c.note}\n\nThe playtest report's problems:\n${report.problems.map((p, i) => `${i + 1}. ${p.problem}`).join("\n")}` }],
      output_config: { format: zodOutputFormat(Grade) },
    });
    spent += cost(graded.usage);
    const g = graded.parsed_output!;
    tally[g.found]++;
    console.log(`${c.item.replace(/^expert\d-/, "").padEnd(30)} ${(HARNESS[c.file] ?? SOURCE[c.file]).padEnd(17)} ${g.found.padEnd(6)} ${g.which.slice(0, 110)}`);
    out.push({ item: c.item, file: c.file, note: c.note, opponent, report, grade: g });
    writeFileSync(outFile, JSON.stringify({ ranAt: new Date().toISOString(), games, results: out }, null, 1));
  }
  console.log(`\nFound the owner's complaint: yes ${tally.yes}, partly ${tally.partly}, no ${tally.no} (of ${cases.length}). Total $${spent.toFixed(2)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
