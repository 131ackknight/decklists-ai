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

describe("the idea-named items", () => {
  const byId = new Map(items.map((it) => [it.id, it]));
  const idea = items.filter((it) => it.track === "idea");

  it("exist for every holdout-v2 and future-v2 deck", () => {
    for (const test of ["holdout-v2", "future-v2"]) for (const id of TESTS.find((t) => t.id === test)!.items) expect(byId.has(`idea-${id}`), id).toBe(true);
  });

  it("keep their deck's date, target and first names, and name every key card once", () => {
    for (const it of idea) {
      const from = byId.get(it.id.replace(/^idea-/, ""))!;
      expect(from, it.id).toBeDefined();
      expect(it.before).toBe(from.before);
      expect(it.format).toBe(from.format);
      expect(it.target).toEqual(from.target);
      expect(it.keyCards!.slice(0, from.keyCards!.length)).toEqual(from.keyCards);
      expect(new Set(it.keyCards).size).toBe(it.keyCards!.length);
      for (const card of it.keyCards!) expect(it.prompt, it.id).toContain(card);
    }
  });

  it("change nothing for a deck with no unnamed signature card", () => {
    const same = idea.filter((it) => it.keyCards!.length === byId.get(it.id.replace(/^idea-/, ""))!.keyCards!.length);
    expect(same.length).toBeGreaterThan(0);
    for (const it of same) expect(it.prompt).toBe(byId.get(it.id.replace(/^idea-/, ""))!.prompt);
  });
});
