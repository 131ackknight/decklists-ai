import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { MODELS } from "@/harness/models";
import type { SubmittedDeck } from "@/harness/tools";

/**
 * D-009: the deck's name and a 2-3 sentence "how it wins" blurb, from one small Haiku call over the
 * brewer's notes and win line. Everything else in the notes stays on the server. A long blurb is trimmed to
 * its last full sentence, and a long name falls back to the notes' name. An API error, timeout, refusal or
 * empty reply falls back to text taken from the notes, and every fallback logs why (server only).
 */
export const NAME_MODEL = MODELS["claude-haiku-5-5"].id;

const NameBlurb = z.object({
  name: z.string().describe("The deck's name, 2-5 words, like a name a player would give it (e.g. 'Mono-White Stax')."),
  blurb: z.string().describe("2-3 plain sentences on how the deck wins. No card-by-card roles, no options considered, no tool or process talk."),
});

const SYSTEM = `You name a Magic: The Gathering deck and say in 2-3 plain sentences how it wins, for the top of a decklist page. You get the deck builder's notes and the deck's line to the win. Use only what they say. Don't mention the builder, its process, tools, data, checks or other options it considered.`;

type WinLine = SubmittedDeck["winLine"];

/** Longest name and blurb the page shows. */
export const NAME_MAX = 60;
export const BLURB_MAX = 600;

/** A blurb cut to its last full sentence within `max` characters, or at a word with "…" when no sentence fits. */
export function trimBlurb(blurb: string, max = BLURB_MAX): string {
  const t = blurb.trim().replace(/\s+/g, " ");
  if (t.length <= max) return t;
  const head = t.slice(0, max);
  const end = Math.max(head.lastIndexOf(". "), head.lastIndexOf("! "), head.lastIndexOf("? "));
  if (end > 0) return head.slice(0, end + 1);
  return `${head.slice(0, head.lastIndexOf(" ") > 0 ? head.lastIndexOf(" ") : max - 1).trimEnd()}…`;
}

export async function nameAndBlurb(client: Anthropic, text: string, winLine?: WinLine): Promise<{ name: string; blurb: string }> {
  const fallback = fallbackNameBlurb(text, winLine);
  // Server log only (never the page): why a deck got the fallback, so the cause can be read in Vercel's logs.
  const warn = (why: string) => console.warn(`name-blurb fallback: ${why}`);
  try {
    const line = winLine?.length ? `\n\nLine to the win:\n${winLine.map((w) => `- ${w.card}: ${w.does}`).join("\n")}` : "";
    const response = await client.messages.parse(
      {
        model: NAME_MODEL,
        max_tokens: 800,
        system: SYSTEM,
        messages: [{ role: "user", content: `Builder's notes:\n${text.slice(0, 12_000)}${line}` }],
        output_config: { format: zodOutputFormat(NameBlurb) },
      },
      { timeout: 30_000, maxRetries: 1 },
    );
    const out = response.parsed_output;
    if (!out) {
      warn(`no parsed reply (stop_reason ${response.stop_reason ?? "unknown"})`);
      return fallback;
    }
    const rawName = out.name.trim();
    const rawBlurb = out.blurb.trim();
    if (rawName.length > NAME_MAX) warn(`name too long (${rawName.length} chars); used the notes' name`);
    if (rawBlurb.length > BLURB_MAX) warn(`blurb too long (${rawBlurb.length} chars); trimmed`);
    const name = rawName && rawName.length <= NAME_MAX ? rawName : fallback.name;
    const blurb = rawBlurb ? trimBlurb(rawBlurb) : "";
    if (!blurb) {
      warn("empty blurb");
      return { name, blurb: fallback.blurb };
    }
    return { name, blurb };
  } catch (err) {
    warn(err instanceof Error ? err.message.slice(0, 200) : "unknown error");
    return fallback;
  }
}

/** The deck's label words and section headings are bold in the notes too; they are not names. */
const NOT_NAMES = new Set(["stock", "tuned", "brew"]);

/**
 * D-009's fallback: the first bolded phrase in the notes that reads as a name (not a label word, not a
 * "Heading:"), and the win line as one sentence.
 */
export function fallbackNameBlurb(text: string, winLine?: WinLine): { name: string; blurb: string } {
  const bolded = [...text.matchAll(/\*\*([^*\n]{2,60})\*\*/g)].map((m) => m[1].trim());
  const name = bolded.find((b) => !NOT_NAMES.has(b.toLowerCase()) && !/[:.]$/.test(b)) ?? "Your brew";
  const cards = [...new Set((winLine ?? []).map((w) => w.card))];
  const blurb = cards.length
    ? `It wins with ${cards.length === 1 ? cards[0] : `${cards.slice(0, -1).join(", ")} and ${cards[cards.length - 1]}`}.`
    : "Built from real tournament lists.";
  return { name, blurb };
}
