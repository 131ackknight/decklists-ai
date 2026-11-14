import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import type { CardIndex } from "@/cards/card-index";
import type { BrewResult } from "@/harness/run";
import { TOOLS } from "@/harness/tools";
import { FAKE_STEPS, brewStream, makeFakeBrewer, makeRealBrewer, type RealBrewerParts } from "./brewer";
import { BREW_FIZZLED, type BrewEvent } from "./events";
import fakeDeck from "./fixtures/fake-deck.json";
import { FLAVOR_LINES } from "./phrases";
import { NAMING_PHRASE, PROGRESS, WARMUP_PHRASE } from "./progress";

async function readAll(stream: ReadableStream<Uint8Array>): Promise<string> {
  return new Response(stream).text();
}

function parseEvents(raw: string): BrewEvent[] {
  return raw
    .split("\n\n")
    .filter((f) => f.startsWith("data: "))
    .map((f) => JSON.parse(f.slice(6)) as BrewEvent);
}

/** No tool name (with or without underscores) appears anywhere in the stream. */
function expectNoToolNames(raw: string) {
  for (const t of TOOLS) {
    expect(raw, t.name).not.toMatch(new RegExp(`\\b${t.name}\\b`, "i"));
    expect(raw, t.name).not.toMatch(new RegExp(`\\b${t.name.replace(/_/g, " ")}\\b`, "i"));
  }
}

const req = { prompt: "Mono white stax in Premodern", format: null };

describe("fake brew stream", () => {
  it("sends status events, then exactly one deck event, with nothing from the brewer's tools", async () => {
    const raw = await readAll(brewStream(makeFakeBrewer(0), req));
    const events = parseEvents(raw);
    expect(events.length).toBeGreaterThan(3);
    const last = events[events.length - 1];
    expect(events.slice(0, -1).every((e) => e.type === "status")).toBe(true);
    expect(events.filter((e) => e.type !== "status")).toHaveLength(1);
    expect(last).toEqual({ type: "deck", deck: fakeDeck, cached: false });
    // Back-to-back repeats are dropped.
    events.slice(1).forEach((e, i) => expect(e).not.toEqual(events[i]));
    expectNoToolNames(raw);
  });

  it("pings every 15 s while a step is slow", async () => {
    vi.useFakeTimers();
    try {
      const text = readAll(brewStream(makeFakeBrewer(20_000), req));
      let done = false;
      text.then(() => (done = true));
      for (let i = 0; i < 400 && !done; i++) await vi.advanceTimersByTimeAsync(1000);
      const raw = await text;
      // One delay per step, plus one before the naming line.
      expect(raw.match(/^: ping$/gm)?.length).toBe(Math.ceil((20_000 * (FAKE_STEPS.length + 1)) / 15_000) - 1); // a ping due as the stream ends is not sent
      expect(parseEvents(raw).at(-1)?.type).toBe("deck");
    } finally {
      vi.useRealTimers();
    }
  });

  it("progress only goes up, stays below 1, and ends on the naming line", async () => {
    const events = parseEvents(await readAll(brewStream(makeFakeBrewer(0), req)));
    const statuses = events.filter((e): e is Extract<typeof e, { type: "status" }> => e.type === "status");
    const pcts = statuses.map((e) => e.progress);
    expect(pcts[0]).toBe(PROGRESS.warmup);
    expect(pcts.every((p, i) => p > 0 && p < 1 && (i === 0 || p >= pcts[i - 1]))).toBe(true);
    expect(statuses.at(-1)).toEqual({ type: "status", phrase: NAMING_PHRASE, progress: PROGRESS.naming });
  });

  it("the fixture is a full deck with every card grouped", () => {
    const count = (xs: { qty: number }[]) => xs.reduce((n, l) => n + l.qty, 0);
    expect(count(fakeDeck.main)).toBe(60);
    expect(count(fakeDeck.side)).toBeLessThanOrEqual(15);
    expect([...fakeDeck.main, ...fakeDeck.side].every((l) => l.type !== "Other")).toBe(true);
    expect(fakeDeck.name && fakeDeck.blurb && fakeDeck.format).toBeTruthy();
  });
});

const SECRET = "Three directions I considered: SECRET-OPTION";
const brewResult = (over: Partial<BrewResult> = {}): BrewResult =>
  ({
    text: `I built this as a **brew**.\n\n**Orb Lock**\n\n${SECRET}`,
    deck: { format: "premodern", main: [{ qty: 4, name: "Winter Orb" }], side: [], commander: [], label: "brew", donor: null, warnings: [], winLine: [{ card: "Winter Orb", does: "SECRET-ROLE" }] },
    toolCalls: [],
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    costUsd: 0,
    steps: 3,
    stopReason: "end_turn",
    error: null,
    ms: 1,
    ...over,
  }) as BrewResult;

function stubParts(over: Partial<RealBrewerParts> = {}, haiku: () => unknown = () => Promise.reject(new Error("no network in tests"))) {
  const index = { getCard: () => ({ typeLine: "Artifact" }) } as unknown as CardIndex;
  const client = { messages: { parse: vi.fn(haiku) } } as unknown as Anthropic;
  const parts: RealBrewerParts = {
    client: () => client,
    deps: async () => ({ index, data: {} as never }),
    brew: vi.fn(async (_c, _req, _deps, onStep) => {
      onStep(1, "meta, archetype");
      onStep(2, "search_cards");
      onStep(3, "submit_deck");
      return brewResult();
    }),
    readFormat: vi.fn(async () => null),
    ...over,
  };
  return parts;
}

describe("real brewer (stubbed: no model call)", () => {
  it("streams phrases from the steps and a deck, with no tool names or notes", async () => {
    const parts = stubParts();
    const raw = await readAll(brewStream(makeRealBrewer(parts), req));
    const events = parseEvents(raw);
    expect(events.map((e) => e.type)).toEqual(["status", "status", "status", "status", "status", "deck"]);
    expect(events[0]).toEqual({ type: "status", phrase: WARMUP_PHRASE, progress: PROGRESS.warmup });
    expect(events[1]).toEqual({ type: "status", phrase: "Scouting the metagame", progress: expect.any(Number) });
    expect(events[4]).toEqual({ type: "status", phrase: NAMING_PHRASE, progress: PROGRESS.naming });
    expect(events[5]).toEqual({
      type: "deck",
      cached: false,
      deck: { name: "Orb Lock", blurb: "It wins with Winter Orb.", format: "premodern", main: [{ qty: 4, name: "Winter Orb", type: "Artifact" }], side: [] },
    });
    expectNoToolNames(raw);
    expect(raw).not.toContain("SECRET");
  });

  it("resolves the format: given, else read from the prompt, else modern", async () => {
    const formatOf = async (parts: RealBrewerParts, format: string | null) => {
      await makeRealBrewer(parts)({ prompt: "p", format }, () => {});
      return (parts.brew as ReturnType<typeof vi.fn>).mock.calls[0][1].format;
    };
    expect(await formatOf(stubParts(), "Pauper")).toBe("pauper");
    expect(await formatOf(stubParts({ readFormat: async () => "Legacy" }), null)).toBe("legacy");
    expect(await formatOf(stubParts(), null)).toBe("modern");
    expect(await formatOf(stubParts({ readFormat: async () => Promise.reject(new Error("down")) }), null)).toBe("modern");
  });

  it("maps a brew with no deck, or a thrown error, to the one friendly error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    for (const brew of [async () => brewResult({ deck: null, error: "API 529: overloaded" }), async () => Promise.reject(new Error("API 500 SECRET"))]) {
      const raw = await readAll(brewStream(makeRealBrewer(stubParts({ brew })), req));
      expect(parseEvents(raw).filter((e) => e.type !== "status")).toEqual([{ type: "error", message: BREW_FIZZLED }]);
      expect(parseEvents(raw).at(-1)).toEqual({ type: "error", message: BREW_FIZZLED });
      expect(raw).not.toContain("SECRET");
    }
  });

  it("unknown steps become flavor lines", async () => {
    const parts = stubParts({ brew: async (_c, _r, _d, onStep) => (onStep(1, "new_tool"), brewResult()) });
    const events = parseEvents(await readAll(brewStream(makeRealBrewer(parts), req)));
    expect(FLAVOR_LINES).toContain((events[1] as { phrase: string }).phrase);
  });
});
