import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import { BLURB_MAX, NAME_MODEL, fallbackNameBlurb, nameAndBlurb, trimBlurb } from "./name-blurb";

const stub = (parse: (...a: unknown[]) => unknown) => ({ messages: { parse: vi.fn(parse) } }) as unknown as Anthropic & { messages: { parse: ReturnType<typeof vi.fn> } };

const NOTES = "I built this as a **brew**.\n\n**The plan:** attack early.\n\n**Mono-White Stax** locks the board.";
const WIN = [
  { card: "Silver Knight", does: "attacks" },
  { card: "Armageddon", does: "resets lands" },
  { card: "Winter Orb", does: "keeps them down" },
];

describe("nameAndBlurb", () => {
  it("returns Haiku's name and blurb", async () => {
    const client = stub(async () => ({ parsed_output: { name: " Orb Lock ", blurb: "It locks the mana. Then it attacks." } }));
    expect(await nameAndBlurb(client, NOTES, WIN)).toEqual({ name: "Orb Lock", blurb: "It locks the mana. Then it attacks." });
    const [params] = client.messages.parse.mock.calls[0] as [{ model: string; messages: { content: string }[] }];
    expect(params.model).toBe(NAME_MODEL);
    expect(NAME_MODEL).toBe("claude-haiku-5-5");
    expect(params.messages[0].content).toContain("Winter Orb: keeps them down");
  });

  it("falls back on an API error, and logs why", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const client = stub(async () => {
      throw new Error("overloaded");
    });
    expect(await nameAndBlurb(client, NOTES, WIN)).toEqual({ name: "Mono-White Stax", blurb: "It wins with Silver Knight, Armageddon and Winter Orb." });
    expect(warn).toHaveBeenCalledWith("name-blurb fallback: overloaded");
    warn.mockRestore();
  });

  it("falls back on an empty reply, logging the stop reason", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect((await nameAndBlurb(stub(async () => ({ parsed_output: null, stop_reason: "max_tokens" })), NOTES, WIN)).name).toBe("Mono-White Stax");
    expect(warn).toHaveBeenCalledWith("name-blurb fallback: no parsed reply (stop_reason max_tokens)");
    warn.mockRestore();
  });

  it("keeps a good blurb when only the name is too long", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await nameAndBlurb(stub(async () => ({ parsed_output: { name: "x".repeat(80), blurb: "It locks the mana." } })), NOTES)).toEqual({ name: "Mono-White Stax", blurb: "It locks the mana." });
    warn.mockRestore();
  });

  it("trims a long blurb to its last full sentence instead of throwing it away", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const long = "Lock the mana early. ".repeat(40);
    const out = await nameAndBlurb(stub(async () => ({ parsed_output: { name: "Orb Lock", blurb: long } })), NOTES, WIN);
    expect(out.name).toBe("Orb Lock");
    expect(out.blurb.length).toBeLessThanOrEqual(BLURB_MAX);
    expect(out.blurb.endsWith("early.")).toBe(true);
    warn.mockRestore();
  });
});

describe("trimBlurb", () => {
  it("leaves short blurbs alone and cuts at a word when no sentence fits", () => {
    expect(trimBlurb("It wins.  Fast.")).toBe("It wins. Fast.");
    const cut = trimBlurb("word ".repeat(200), 30);
    expect(cut.endsWith("…")).toBe(true);
    expect(cut.length).toBeLessThanOrEqual(31);
  });
});

describe("fallbackNameBlurb", () => {
  it("skips label words and headings, and has defaults", () => {
    expect(fallbackNameBlurb("**brew** **Plan:** nothing else")).toEqual({ name: "Your brew", blurb: "Built from real tournament lists." });
    expect(fallbackNameBlurb("**Goblin Pile**", [{ card: "Goblin Ringleader", does: "x" }]).blurb).toBe("It wins with Goblin Ringleader.");
  });
});
