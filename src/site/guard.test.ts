import { describe, expect, it, vi } from "vitest";
import type { SiteDeck } from "./events";
import { MESSAGES, capKey, deckKey, guard, ipKey, normalizePrompt, type GuardDeps } from "./guard";
import { memoryStore, type Store } from "./store";

const DECK: SiteDeck = { name: "Burn", blurb: "It burns.", format: "modern", main: [{ qty: 4, name: "Lightning Bolt", type: "Instant" }], side: [] };

function setup(over: Partial<GuardDeps> = {}) {
  let t = Date.parse("2026-11-13T12:00:00Z");
  const clock = { set: (iso: string) => (t = Date.parse(iso)), advance: (ms: number) => (t += ms) };
  const store = memoryStore(() => t);
  const screen = vi.fn(async (p: string) => !/poem/i.test(p));
  const deps: GuardDeps = { store, screen, now: () => new Date(t), dailyCap: 10, perIp: 2, ...over };
  return { deps, store, screen, clock };
}

const counters = async (store: Store, day: string, ip: string) => ({ cap: await store.get(capKey(day)), ip: await store.get(ipKey(day, ip)) });

describe("guard", () => {
  it("refuses a non-deck prompt as off_topic and changes no counter", async () => {
    const { deps, store } = setup();
    expect(await guard({ prompt: "write me a poem", format: null }, "1.2.3.4", deps)).toEqual({ kind: "refused", reason: "off_topic", message: MESSAGES.off_topic });
    expect(await counters(store, "2026-11-13", "1.2.3.4")).toEqual({ cap: null, ip: null });
  });

  it("refuses the 3rd brew from one IP in a day, and takes no site-wide slot for it", async () => {
    const { deps, store } = setup();
    for (const p of ["a", "b"]) expect((await guard({ prompt: `burn ${p}`, format: null }, "1.2.3.4", deps)).kind).toBe("go");
    expect(await guard({ prompt: "burn c", format: null }, "1.2.3.4", deps)).toMatchObject({ kind: "refused", reason: "ip_limit", message: MESSAGES.ip_limit });
    expect(await counters(store, "2026-11-13", "1.2.3.4")).toEqual({ cap: "2", ip: "2" });
    // Another visitor still can.
    expect((await guard({ prompt: "burn d", format: null }, "5.6.7.8", deps)).kind).toBe("go");
  });

  it("refuses the 11th brew site-wide, and gives that visitor's slot back", async () => {
    const { deps, store } = setup();
    for (let i = 0; i < 10; i++) expect((await guard({ prompt: `deck ${i}`, format: null }, `10.0.0.${i}`, deps)).kind).toBe("go");
    expect(await guard({ prompt: "deck 11", format: null }, "10.0.0.99", deps)).toMatchObject({ kind: "refused", reason: "daily_cap", message: MESSAGES.daily_cap });
    expect(await counters(store, "2026-11-13", "10.0.0.99")).toEqual({ cap: "10", ip: "0" });
  });

  it("serves the same prompt + format from cache within 24 h, counters unchanged", async () => {
    const { deps, store, clock } = setup();
    const g = await guard({ prompt: "Mono red  Burn ", format: "Modern" }, "1.2.3.4", deps);
    if (g.kind !== "go") throw new Error("expected go");
    await g.save(DECK);
    const before = await counters(store, "2026-11-13", "1.2.3.4");
    clock.advance(23 * 3600_000);
    expect(await guard({ prompt: "mono red burn", format: "modern" }, "9.9.9.9", deps)).toEqual({ kind: "cached", deck: DECK });
    expect(await counters(store, "2026-11-13", "1.2.3.4")).toEqual(before);
    expect(await counters(store, "2026-11-14", "9.9.9.9")).toEqual({ cap: null, ip: null });
    // Another format is another deck; after 24 h the entry is gone.
    expect((await guard({ prompt: "mono red burn", format: "pauper" }, "9.9.9.9", deps)).kind).toBe("go");
    clock.advance(2 * 3600_000);
    expect((await guard({ prompt: "mono red burn", format: "modern" }, "8.8.8.8", deps)).kind).toBe("go");
  });

  it("gives the slots back once when a brew fails", async () => {
    const { deps, store } = setup({ perIp: 1 });
    const g = await guard({ prompt: "burn", format: null }, "1.2.3.4", deps);
    if (g.kind !== "go") throw new Error("expected go");
    await g.release();
    await g.release();
    expect(await counters(store, "2026-11-13", "1.2.3.4")).toEqual({ cap: "0", ip: "0" });
    expect((await guard({ prompt: "burn again", format: null }, "1.2.3.4", deps)).kind).toBe("go");
  });

  it("resets at 00:00 UTC", async () => {
    const { deps, clock } = setup({ perIp: 1, dailyCap: 1 });
    clock.set("2026-11-13T23:59:00Z");
    expect((await guard({ prompt: "a", format: null }, "1.2.3.4", deps)).kind).toBe("go");
    expect((await guard({ prompt: "b", format: null }, "1.2.3.4", deps)).kind).toBe("refused");
    expect((await guard({ prompt: "c", format: null }, "5.5.5.5", deps)).kind).toBe("refused");
    clock.set("2026-11-14T00:00:01Z");
    expect((await guard({ prompt: "b", format: null }, "1.2.3.4", deps)).kind).toBe("go");
  });

  it("releases into the day the brew started, even after midnight", async () => {
    const { deps, store, clock } = setup();
    clock.set("2026-11-13T23:58:00Z");
    const g = await guard({ prompt: "late", format: null }, "1.2.3.4", deps);
    if (g.kind !== "go") throw new Error("expected go");
    clock.set("2026-11-14T00:05:00Z");
    await g.release();
    expect(await counters(store, "2026-11-13", "1.2.3.4")).toEqual({ cap: "0", ip: "0" });
    expect(await counters(store, "2026-11-14", "1.2.3.4")).toEqual({ cap: null, ip: null });
  });

  it("screens before anything else, even a cached prompt", async () => {
    const { deps, screen } = setup();
    await guard({ prompt: "poem deck", format: null }, "1.2.3.4", deps);
    expect(screen).toHaveBeenCalledWith("poem deck");
  });

  it("uses the SPEC's key shapes", () => {
    expect(normalizePrompt("  Mono   RED\tburn \n")).toBe("mono red burn");
    expect(capKey("2026-11-13")).toBe("cap:2026-11-13");
    expect(ipKey("2026-11-13", "1.2.3.4")).toMatch(/^ip:2026-11-13:[0-9a-f]{64}$/);
    expect(ipKey("2026-11-13", "1.2.3.4")).not.toContain("1.2.3.4");
    expect(deckKey("Burn", null)).toMatch(/^deck:v26:[0-9a-f]{64}$/); // brewer version in the key (D-025)
    expect(deckKey("Burn ", "Modern")).toBe(deckKey("burn", "modern"));
  });
});
