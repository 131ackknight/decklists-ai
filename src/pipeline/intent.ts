import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

/**
 * Stage 0 of the brew pipeline: read what the player is asking for. The
 * request type picks the path (and how much tournament data may steer it);
 * the constraints are what "did it do what was asked?" is judged against.
 * Feasibility is not decided here: named cards are checked against the card
 * pool in code, so a confident model can't declare a legal card illegal.
 */
export const Intent = z.object({
  type: z
    .enum(["stock", "tune", "sideboard", "brew", "impossible"])
    .describe(
      "stock: a proven version of a deck or style that exists (named archetype, or a style like 'fast red aggro'). " +
        "tune: change a decklist the player supplied. sideboard: build only a sideboard for a supplied main deck. " +
        "brew: something without a proven list: built around named cards, a twist on a known deck, an unusual constraint, or open-ended. " +
        "impossible: the goal itself can't be met by any deck (e.g. win on turn 1 every game).",
    ),
  format: z.string().nullable().describe("The format named or clearly implied; null if the player left it open."),
  archetype: z.string().nullable().describe("An existing deck or style the request names, e.g. Goblins, Merfolk, Replenish, burn."),
  namedCards: z
    .array(z.string())
    .describe("Cards the player names in their own words, spelled as written. Not the cards of a pasted decklist."),
  colors: z
    .object({
      exactly: z.array(z.enum(["W", "U", "B", "R", "G"])).nullable().describe("Colors the deck must be exactly, e.g. mono green = [G]."),
      exclude: z.array(z.enum(["W", "U", "B", "R", "G"])).describe("Colors the deck must not play."),
    })
    .describe("Color constraints stated or implied by the request."),
  constraints: z.array(z.string()).describe("Every other hard constraint, in the player's terms, e.g. 'doesn't win with storm', 'commons only'."),
  pastedList: z.boolean().describe("The player pasted a decklist."),
  goal: z.string().describe("One sentence: what a good answer delivers."),
});

export type Intent = z.infer<typeof Intent>;

const SYSTEM = `You read a Magic: The Gathering deck request and record what the player wants, for a deck-building system. Record only what the request says or clearly implies; don't add your own deck ideas. Judge the type by what the player is asking for, not by whether you think it is a good idea. If the request names a deck that exists but adds a twist that changes how it is built (a missing color, a different win condition, "not the usual list"), it is a brew.`;

/**
 * Code-level fixes to the model's reading: a deck named after a card must
 * contain that card ("a Dream Halls deck"), and cards from a pasted list
 * are not cards the player named.
 */
export function normalizeIntent(intent: Intent, prompt: string, isCard: (name: string) => string | undefined): Intent {
  const pasted = new Set(
    intent.pastedList
      ? prompt
          .split("\n")
          .map((l) => l.match(/^\s*\d+\s+(.+?)\s*$/)?.[1]?.toLowerCase())
          .filter((n): n is string => !!n)
      : [],
  );
  const named = intent.namedCards.filter((n) => !pasted.has(n.toLowerCase()));
  // Only a full card name counts ("Burn" is not "Turn // Burn"), and a pasted list already decides its own cards.
  const archetypeCard = intent.archetype && !intent.pastedList ? isCard(intent.archetype) : undefined;
  if (
    archetypeCard &&
    archetypeCard.toLowerCase() === intent.archetype!.trim().toLowerCase() &&
    !named.some((n) => n.toLowerCase() === archetypeCard.toLowerCase())
  ) {
    named.push(archetypeCard);
  }
  return { ...intent, namedCards: named };
}

export async function classifyIntent(
  client: Anthropic,
  model: string,
  req: { prompt: string; format?: string | null },
): Promise<{ intent: Intent | null; usage: Anthropic.Usage }> {
  const text = req.format ? `Format selected: ${req.format}\n\n${req.prompt}` : req.prompt;
  const response = await client.messages.parse({
    model,
    max_tokens: 4000,
    system: SYSTEM,
    messages: [{ role: "user", content: text }],
    output_config: { format: zodOutputFormat(Intent) },
  });
  return { intent: response.parsed_output ?? null, usage: response.usage };
}
