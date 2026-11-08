import { describe, expect, it } from "vitest";
import { loadCardIndex } from "@/cards/load";
import { round4Items } from "./round4/items";
import { TESTS, fingerprint } from "./tests";

const items = round4Items(loadCardIndex());

describe("frozen tests", () => {
  it("have unique, versioned ids", () => {
    const ids = TESTS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/-v\d+$/);
  });

  it("only name items that exist", () => {
    const known = new Set(items.map((it) => it.id));
    for (const t of TESTS) for (const key of t.items) expect(known.has(key.split("|")[0]), `${t.id}: ${key}`).toBe(true);
  });

  // If this fails, a test's items, parameters, prompts or cards changed. Don't update the
  // fingerprint in place: add a new version of the test, so old scores stay comparable.
  it.each(TESTS.map((t) => [t.id, t] as const))("%s has not changed", (_, t) => {
    expect(fingerprint(t, items)).toBe(t.frozen);
  });
});
