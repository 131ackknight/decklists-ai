import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { CardIndex } from "@/cards/card-index";
import type { DataSource, QtyName } from "@/data/source";
import { costUsd, usageOf, type ModelConfig, type Usage } from "./models";
import type { SubmittedDeck } from "./tools";

/**
 * Harness v19's playtest: the AI pilots the finished deck through a game
 * against the format's most-played deck and reports what went wrong. Code
 * shuffles and deals the hand and draws, so the pilot can't pick an easy hand.
 * Built after the owner's notes turned out to be mostly problems that only show
 * when the deck is played (Wildfire killing its own creatures, Seismic Assault
 * with no lands to throw); in a test on 14 flagged decks, two played games
 * found the owner's complaint in 4 and part of it in 7, where the card-by-card
 * reviewer found 0 of 4 (scripts/playtest.ts). Generic: nothing about any card.
 */

export const PlaytestReport = z.object({
  game: z.string().describe("The game turn by turn, one line per turn, at most 12 lines."),
  problems: z
    .array(
      z.object({
        problem: z.string().describe("What went wrong, naming cards."),
        cards: z.array(z.string()),
        fix: z.string().describe("What you would change: a named card to add, cut or swap."),
      }),
    )
    .max(3)
    .describe("The problems that hurt the deck most, most important first. At most three; none is a fine answer."),
});
export type PlaytestReport = z.infer<typeof PlaytestReport>;

const PLAYTEST_SYSTEM = `You are a strong Magic: The Gathering player playtesting a brew before a tournament. Play the game honestly with the cards you are dealt, turn by turn, as the deck's pilot, on the play. Track your mana, life and board. The opponent plays its deck's usual game: assume sensible draws and plays for it. After the game, name the problems that hurt the deck most: cards that were dead or hurt you, things the plan needed and didn't have, cards that didn't earn their slot, mana trouble. Rank them by how much they hurt the deck in general, not only in this one matchup. At most three.`;

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A shuffled deck dealt as an opening hand, the next eight draws, and a second hand in case of a mulligan. */
export function dealGame(main: QtyName[], seed: number) {
  const cards = main.flatMap((l) => Array<string>(l.qty).fill(l.name));
  const rand = mulberry32(seed);
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return { hand: cards.slice(0, 7), draws: cards.slice(7, 15), backupHand: cards.slice(15, 22) };
}

export async function playtestDeck(
  client: Anthropic,
  model: ModelConfig,
  req: { prompt: string; format?: string | null },
  deck: SubmittedDeck,
  deps: { index: CardIndex; data: DataSource },
  seed = Math.floor(Math.random() * 2 ** 31),
): Promise<{ report: PlaytestReport; opponent: string; seed: number; usage: Usage; costUsd: number }> {
  const opponent = deps.data.meta(deck.format)[0]?.strategy ?? "a typical deck in the format";
  const text = [...new Set(deck.main.map((l) => deps.index.getCard(l.name)?.name ?? l.name))]
    .map((n) => deps.index.getCard(n))
    .filter((c): c is NonNullable<typeof c> => !!c && !/\bBasic\b/.test(c.typeLine))
    .map((c) => `- ${c.name} | ${c.manaCost} ${c.typeLine}: ${c.text}`)
    .join("\n");
  const d = dealGame(deck.main, seed);
  const msg = await client.messages.parse({
    model: model.id,
    max_tokens: 20000,
    system: PLAYTEST_SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          `Format: ${deck.format}. The player asked: ${req.prompt}`,
          `Deck:\n${deck.main.map((l) => `${l.qty} ${l.name}`).join("\n")}`,
          `Card text:\n${text}`,
          `Opponent: ${opponent}, the most-played deck in the format.`,
          `Opening hand: ${d.hand.join(", ")}. Your draws, in order, from turn 2: ${d.draws.join(", ")}. (If you would mulligan the opening hand, say so and play this 7 instead: ${d.backupHand.join(", ")}.)`,
        ].join("\n\n"),
      },
    ],
    ...(model.effort ? { output_config: { effort: "high" as const, format: zodOutputFormat(PlaytestReport) } } : { output_config: { format: zodOutputFormat(PlaytestReport) } }),
  });
  const usage: Usage = usageOf(model, msg.usage);
  return { report: msg.parsed_output ?? { game: "", problems: [] }, opponent, seed, usage, costUsd: costUsd(model, usage) };
}
