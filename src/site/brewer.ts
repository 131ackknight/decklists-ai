import Anthropic from "@anthropic-ai/sdk";
import type { CardIndex } from "@/cards/card-index";
import { loadCardIndex } from "@/cards/load";
import { FileDataSource, type DataSource } from "@/data/source";
import { MODELS } from "@/harness/models";
import { brewV24, type BrewRequest, type BrewResult } from "@/harness/run";
import { classifyIntent } from "@/pipeline/intent";
import { BREW_FIZZLED, SSE_PING, sse, type BrewEvent, type SiteDeck } from "./events";
import fakeDeck from "./fixtures/fake-deck.json";
import { nameAndBlurb } from "./name-blurb";
import { phraseForStep } from "./phrases";
import { NAMING_PHRASE, PROGRESS, WARMUP_PHRASE, stepProgress } from "./progress";
import { toSiteDeck } from "./shape";

/**
 * One brew for the site: friendly phrases while it works, each with how far along it is (0 to 1, D-024),
 * then the deck. Throws on any failure.
 */
export type SiteBrewer = (req: { prompt: string; format: string | null }, onPhrase: (p: string, progress: number) => void) => Promise<SiteDeck>;

export const BREW_MODEL = MODELS["claude-opus-5-5"];
/** The format when neither the chips nor the prompt name one (D-006). */
export const DEFAULT_FORMAT = "modern";

type Deps = { index: CardIndex; data: DataSource };

/** Today's card pool and lists (brewDeps' case for an item with no date), loaded once per warm instance. */
let depsOnce: Promise<Deps> | null = null;
function loadDeps(): Promise<Deps> {
  depsOnce ??= (async () => {
    const index = loadCardIndex();
    const data = await FileDataSource.load("data/reference-lists.jsonl", index);
    return { index, data };
  })().catch((err) => {
    depsOnce = null;
    throw err;
  });
  return depsOnce;
}

/** The pieces the real brewer uses, swappable so tests run it with stubs and no model call. */
export interface RealBrewerParts {
  client: () => Anthropic;
  deps: () => Promise<Deps>;
  brew: (client: Anthropic, req: BrewRequest, deps: Deps, onStep: (step: number, note: string) => void) => Promise<BrewResult>;
  readFormat: (client: Anthropic, prompt: string) => Promise<string | null>;
}

let client: Anthropic | null = null;

const realParts: RealBrewerParts = {
  client: () => (client ??= new Anthropic()),
  deps: loadDeps,
  brew: (c, req, deps, onStep) => brewV24(c, BREW_MODEL, req, deps, onStep),
  readFormat: async (c, prompt) => (await classifyIntent(c, MODELS["claude-haiku-5-5"].id, { prompt })).intent?.format ?? null,
};

export function makeRealBrewer(parts: RealBrewerParts = realParts): SiteBrewer {
  return async (req, onPhrase) => {
    onPhrase(WARMUP_PHRASE, PROGRESS.warmup);
    const c = parts.client();
    const depsP = parts.deps();
    let format = req.format?.trim() || null;
    if (!format) format = await parts.readFormat(c, req.prompt).catch(() => null);
    const deps = await depsP;
    format = (format || DEFAULT_FORMAT).toLowerCase();
    const r = await parts.brew(c, { prompt: req.prompt, format }, deps, (step, note) => onPhrase(phraseForStep(note), stepProgress(step, note)));
    // Server log only (Vercel runtime logs), never sent to the page: what each real brew cost.
    console.info(`brew done: ${JSON.stringify({ format, costUsd: r.costUsd, ms: r.ms, steps: r.steps, stopReason: r.stopReason })}`);
    if (!r.deck) throw new Error(r.error ?? "The brew submitted no deck.");
    onPhrase(NAMING_PHRASE, PROGRESS.naming);
    const nb = await nameAndBlurb(c, r.text, r.deck.winLine);
    return toSiteDeck(r, deps.index, nb);
  };
}

/** brewV24 on Opus 5.5. Costs real money: never run in tests or local checks (D-016). */
export const realBrewer: SiteBrewer = makeRealBrewer();

/** Steps as brewV24 reports them, for the fake run; they go through the same phrase map. */
export const FAKE_STEPS = ["meta, archetype", "reference_list", "search_cards, card_info", "played_with", "", "draw_odds", "check_deck", "submit_deck"];

/** A replay at no cost (BREW_FAKE=1): scripted steps `delayMs` apart, then the saved deck. */
export function makeFakeBrewer(delayMs = 1500): SiteBrewer {
  return async (_req, onPhrase) => {
    onPhrase(WARMUP_PHRASE, PROGRESS.warmup);
    for (const [i, note] of FAKE_STEPS.entries()) {
      await new Promise((r) => setTimeout(r, delayMs));
      onPhrase(phraseForStep(note), stepProgress(i + 1, note));
    }
    await new Promise((r) => setTimeout(r, delayMs));
    onPhrase(NAMING_PHRASE, PROGRESS.naming);
    return structuredClone(fakeDeck as SiteDeck);
  };
}

export const fakeBrewer: SiteBrewer = makeFakeBrewer();

export const PING_MS = 15_000;

/**
 * The SSE body for one brew: status events (sent when the phrase or the progress changes; progress never
 * goes back), a ping comment
 * every 15 s, then exactly one terminal event. A failure of any kind becomes the one friendly error;
 * the real reason goes to the server log only. When the client goes away the stream stops writing (the
 * brew itself runs on: brewV24 takes no abort signal).
 */
export function brewStream(brewer: SiteBrewer, req: { prompt: string; format: string | null }): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  let closed = false;
  let ping: ReturnType<typeof setInterval> | undefined;
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const write = (s: string) => {
        if (closed) return;
        try {
          controller.enqueue(enc.encode(s));
        } catch {
          closed = true;
        }
      };
      const send = (e: BrewEvent) => write(sse(e));
      ping = setInterval(() => write(SSE_PING), PING_MS);
      let last = "";
      let pct = 0;
      try {
        const deck = await brewer(req, (phrase, progress) => {
          const next = Math.round(Math.min(1, Math.max(pct, progress)) * 1000) / 1000;
          if (phrase === last && next === pct) return;
          last = phrase;
          pct = next;
          send({ type: "status", phrase, progress: pct });
        });
        send({ type: "deck", deck, cached: false });
      } catch (err) {
        console.error("brew failed:", err);
        send({ type: "error", message: BREW_FIZZLED });
      } finally {
        clearInterval(ping);
        if (!closed) {
          closed = true;
          controller.close();
        }
      }
    },
    cancel() {
      closed = true;
      clearInterval(ping);
    },
  });
}
