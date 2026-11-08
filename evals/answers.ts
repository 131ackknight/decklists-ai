/**
 * The owner's saved answers from every judging page, joined with each page's
 * answer key (2026-11-07). The pages live on claude.ai; their answers are exported
 * to evals/answers/<slug>/ (see pages.json), so scripts read verdicts from the
 * repo instead of hand-copied lists.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

export interface Page {
  slug: string;
  title: string;
  url: string;
  collection: "ratings" | "pairs" | "decks";
  key: string | null;
  kind: "ratings" | "pairs" | "play";
  what: string;
  logDate: string;
  exported: string;
  answers: number;
}

const DIR = "evals/answers";
export const pages = (): Page[] => (JSON.parse(readFileSync(path.join(DIR, "pages.json"), "utf8")) as { pages: Page[] }).pages;
export const page = (slug: string) => {
  const p = pages().find((x) => x.slug === slug);
  if (!p) throw new Error(`Unknown judging page ${slug}`);
  return p;
};

/** The raw saved answers, one per document the page stored. */
export function rawAnswers(p: Page): Record<string, unknown>[] {
  const dir = path.join(DIR, p.slug, p.collection);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => JSON.parse(readFileSync(path.join(dir, f), "utf8")) as Record<string, unknown>);
}

const keyOf = <T>(p: Page) => (p.key ? (JSON.parse(readFileSync(p.key, "utf8")) as Record<string, T>) : {});

/** "Would you play it" pages: one verdict per deck, unblinded. */
export function playVerdicts(slug: string) {
  const p = page(slug);
  const key = keyOf<{ item: string; harness: string; model: string }>(p);
  return rawAnswers(p).map((a) => {
    const k = key[a.deck as string];
    return { id: a.deck as string, item: k?.item, harness: k?.harness, model: k?.model, play: a.play as string, why: (a.why as string) ?? "" };
  });
}

/** Pairwise and quick-pick pages: A is the key's left label, B its right. */
export function pairVerdicts(slug: string) {
  const p = page(slug);
  const key = keyOf<{ prompt: string; left: string; right: string }>(p);
  return rawAnswers(p).map((a) => {
    const k = key[a.pair as string];
    return { id: a.pair as string, prompt: k?.prompt, left: k?.left, right: k?.right, winner: a.winner as string, notes: (a.notes as string) ?? "" };
  });
}

const DIMS = ["plan", "legal", "mana", "shell"] as const;
/** 1-5 scorecards, as scripts/analyze-ratings.ts reads them: complete ratings only, excluded answers left out unless asked for. */
export function ratingRows(slug: string, opts: { includeExcluded?: boolean } = {}) {
  const p = page(slug);
  const key = keyOf<{ label: string; pass: string; prompt: string; excluded?: string }>(p);
  return rawAnswers(p)
    .filter((r) => DIMS.every((d) => typeof r[d] === "number"))
    .filter((r) => opts.includeExcluded || !key[r.aid as string]?.excluded)
    .map((r) => ({
      id: r.aid as string,
      label: key[r.aid as string]?.label,
      prompt: r.prompt as string,
      mean: DIMS.reduce((n, d) => n + (r[d] as number), 0) / DIMS.length,
      ai: ((r.by as string) ?? "owner") !== "owner",
    }));
}
