import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { costUsd, usageOf, type ModelConfig } from "./models";
import { emptyUsage, type BrewRequest, type BrewResult } from "./run";
import type { SubmittedDeck } from "./tools";

/**
 * Harness v0 (2026-11-10). Owner: "we should compare against just oneshot normal ai no harness as a start".
 *
 * No harness: one call to the same model with the same settings the harness uses (max_tokens 32000,
 * effort high), with no system prompt, no tools, no data and no checks. The message is the request as
 * the harness gets it, plus the date the deck is brewed on: the harness learns the date from its data,
 * which is cut there; with no data, the date is all v0 has. The answer format only makes the deck
 * readable. The deck is kept exactly as given: names aren't looked up, counts aren't checked.
 */
const Line = z.object({ qty: z.number().int().min(1), name: z.string() });
export const OneShotDeck = z.object({
  main: z.array(Line).describe("The main deck: each card's copies and exact English name."),
  side: z.array(Line).describe("The sideboard; empty if there is none."),
});

/** The one message v0 sends. */
export function oneShotText(req: BrewRequest, date?: string | null): string {
  return `${date ? `It is ${date}.\n` : ""}${req.format ? `Format: ${req.format}\n\n` : ""}${req.prompt}\n\nGive the main deck and sideboard.`;
}

export async function brewV0(client: Anthropic, model: ModelConfig, req: BrewRequest, date?: string | null): Promise<BrewResult> {
  const started = Date.now();
  let text = "";
  let deck: SubmittedDeck | null = null;
  let usage = emptyUsage();
  let stopReason: string | null = null;
  let error: string | null = null;
  try {
    const message = await client.messages
      .stream({
        model: model.id,
        max_tokens: 32000,
        messages: [{ role: "user", content: oneShotText(req, date) }],
        output_config: { ...(model.effort ? { effort: "high" as const } : {}), format: zodOutputFormat(OneShotDeck) },
      })
      .finalMessage();
    usage = usageOf(model, message.usage);
    stopReason = message.stop_reason;
    text = message.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    if (message.stop_reason === "refusal") error = "The model declined this request.";
    else if (message.stop_reason === "max_tokens") error = "The answer was cut off at max_tokens.";
    else {
      const d = OneShotDeck.parse(JSON.parse(text));
      deck = { format: req.format ?? "", main: d.main, side: d.side, commander: [], label: "brew", donor: null, warnings: [] };
    }
  } catch (err) {
    error = err instanceof Anthropic.APIError ? `API ${err.status}: ${err.message}` : (err as Error).message;
  }
  return { text, deck, toolCalls: [], usage, costUsd: Math.round(costUsd(model, usage) * 10000) / 10000, steps: 1, stopReason, error, ms: Date.now() - started };
}
