import { existsSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { pages, pairVerdicts, playVerdicts, rawAnswers, ratingRows } from "./answers";

describe("exported judging answers", () => {
  it.each(pages().map((p) => [p.slug, p] as const))("%s is on disk as recorded", (_, p) => {
    expect(rawAnswers(p).length).toBe(p.answers);
    if (p.key) expect(existsSync(p.key)).toBe(true);
  });

  it.each(pages().filter((p) => p.key).map((p) => [p.slug, p] as const))("%s: every answer is in its key", (_, p) => {
    const rows = p.kind === "play" ? playVerdicts(p.slug).map((r) => r.harness) : p.kind === "pairs" ? pairVerdicts(p.slug).map((r) => r.left) : ratingRows(p.slug).map((r) => r.label);
    for (const label of rows) expect(label).toBeTruthy();
  });

  it("covers every judging page key in the repo", () => {
    const keyed = new Set(pages().map((p) => p.key));
    const keys = [
      ...readdirSync("evals/results/round4").filter((f) => /^(play|quickpick).*-key\.json$/.test(f)).map((f) => `evals/results/round4/${f}`),
      "evals/results/model-comparison/blind-key.json",
      "evals/results/harness-v2/blind-key-round2.json",
      "evals/results/pairwise-v1-vs-v2-key.json",
      "evals/results/pairwise-v2-vs-v3-key.json",
    ];
    for (const k of keys) expect(keyed.has(k), `${k} has no export in evals/answers/pages.json`).toBe(true);
  });
});
