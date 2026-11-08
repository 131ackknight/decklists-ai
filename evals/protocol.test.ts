import { describe, expect, it } from "vitest";
import { PROTOCOL, PROTOCOLS, pairedGain, protocolFingerprint } from "./protocol";
import { testById } from "./tests";

describe.each(PROTOCOLS.map((p) => [p.id, p] as const))("%s", (_, p) => {
  // If this fails, a keep-or-drop rule changed. Don't update the fingerprint in place:
  // write a new protocol id, so verdicts made under the old rule stay as they were.
  it("has not changed", () => {
    expect(protocolFingerprint(p)).toBe(p.frozen);
  });

  it("names real tests, and keeps dev and test apart", () => {
    for (const id of [p.dev, ...p.test]) expect(testById(id).kind).toBe("automatic");
    expect(p.test).not.toContain(p.dev);
  });
});

it("the protocol in force is the newest", () => {
  expect(PROTOCOL).toBe(PROTOCOLS[PROTOCOLS.length - 1]);
});

describe("pairedGain", () => {
  const runs = (scores: Record<string, number>) => new Map(Object.entries(scores));

  it("averages each deck over runs before pairing", () => {
    const base = [runs({ a: 40, b: 50 }), runs({ a: 44, b: 54 })];
    const cand = [runs({ a: 43, b: 55 })];
    // per deck: a 43 - 42 = 1, b 55 - 52 = 3; mean 2, sd sqrt(2), t(1) 12.706
    const g = pairedGain(cand, base);
    expect(g.n).toBe(2);
    expect(g.gain).toBeCloseTo(2);
    expect(g.lo).toBeCloseTo(2 - 12.706);
    expect(g.hi).toBeCloseTo(2 + 12.706);
  });

  it("leaves out decks one side is missing", () => {
    expect(pairedGain([runs({ a: 50, b: 50 })], [runs({ a: 40 })]).n).toBe(1);
  });
});
