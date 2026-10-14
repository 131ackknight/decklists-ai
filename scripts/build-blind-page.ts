/**
 * Build the Blind Brew Scorecard from eval result files.
 *
 *   pnpm exec tsx scripts/build-blind-page.ts [--out page.html] [--key key.json] files...
 *
 * Files under evals/results/harness-v2/ get a "v2-" label prefix so they
 * stay apart from v1 runs of the same model. Defaults: round 1 page and key.
 *
 * Every answer gets a random id and, per prompt, a shuffled letter. The
 * page shows only the reply and the deck: no model names, tokens or
 * timings, which would give models away. The id -> model/pass key is
 * written to evals/results/model-comparison/blind-key.json. An existing
 * key is reused, so rebuilding after adding passes keeps earlier ids (and
 * the ratings saved against them).
 */
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { RUBRIC_DIMENSIONS, RUBRIC_PROMPTS } from "../evals/rubric/prompts";

const argv = process.argv.slice(2);
const flag = (name: string, fallback: string) => {
  const i = argv.indexOf(`--${name}`);
  if (i < 0) return fallback;
  const value = argv[i + 1];
  argv.splice(i, 2);
  return value;
};
const KEY_PATH = flag("key", "evals/results/model-comparison/blind-key.json");
const OUT = flag("out", "evals/rating/blind-scorecard.html");
const SHORT: Record<string, string> = { plan: "Plan", legal: "Legal", mana: "Mana", shell: "Shell" };

interface Line {
  qty: number;
  name: string;
}
interface RunFile {
  results: {
    id: string;
    sentFormat: string | null;
    unsupported?: boolean;
    text?: string;
    errors?: string[];
    requestError?: string;
    deck?: { main: Line[]; side: Line[]; commander?: Line[] } | null;
  }[];
}
interface KeyEntry {
  label: string;
  pass: string;
  prompt: string;
}

const key: Record<string, KeyEntry> = existsSync(KEY_PATH) ? JSON.parse(readFileSync(KEY_PATH, "utf8")) : {};
const byOrigin = new Map(Object.entries(key).map(([aid, k]) => [`${k.label}|${k.pass}|${k.prompt}`, aid]));

const answersByPrompt = new Map<string, { aid: string; text: string; error: boolean; deck: unknown }[]>();
for (const file of argv) {
  const m = path.basename(file, ".json").match(/^(.*)-p(\d+)$/);
  if (!m) continue;
  const [, base, pass] = m;
  const label = file.includes("harness-v2") ? `v2-${base}` : base;
  const run = JSON.parse(readFileSync(file, "utf8")) as RunFile;
  for (const r of run.results) {
    if (r.unsupported || !r.sentFormat) continue;
    const origin = `${label}|${pass}|${r.id}`;
    let aid = byOrigin.get(origin);
    if (!aid) {
      aid = randomBytes(6).toString("hex");
      key[aid] = { label, pass, prompt: r.id };
      byOrigin.set(origin, aid);
    }
    const sum = (xs: Line[]) => xs.reduce((n, c) => n + c.qty, 0);
    const list = answersByPrompt.get(r.id) ?? [];
    list.push({
      aid,
      text: r.text ?? "",
      error: Boolean(r.requestError || (r.errors && r.errors.length)),
      deck: r.deck
        ? {
            main: r.deck.main.map((c) => ({ qty: c.qty, name: c.name })),
            side: (r.deck.side ?? []).map((c) => ({ qty: c.qty, name: c.name })),
            commander: (r.deck.commander ?? []).map((c) => ({ qty: c.qty, name: c.name })),
            mainCount: sum(r.deck.main),
            sideCount: sum(r.deck.side ?? []),
          }
        : null,
    });
    answersByPrompt.set(r.id, list);
  }
}

/** Deterministic shuffle per prompt from the answer ids, so letters stay stable across rebuilds. */
function shuffled<T extends { aid: string }>(xs: T[]): T[] {
  return [...xs].sort((a, b) => a.aid.localeCompare(b.aid));
}
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

const prompts = RUBRIC_PROMPTS.filter((p) => answersByPrompt.has(p.id)).map((p) => {
  const answers = shuffled(answersByPrompt.get(p.id)!).map((a, i) => ({
    ...a,
    letter: i < 26 ? LETTERS[i] : `A${LETTERS[i - 26]}`,
  }));
  const title = p.prompt.split("\n")[0].replace(/\s+/g, " ").slice(0, 60);
  return { id: p.id, format: p.format, prompt: p.prompt, lookFor: p.lookFor, title, answers };
});

// Prompts carry pasted lists; take them from the eval prompt file actually sent.
const sent = JSON.parse(readFileSync("evals/rubric/v1-prompts.json", "utf8")) as { id: string; prompt: string }[];
for (const p of prompts) p.prompt = sent.find((s) => s.id === p.id)?.prompt ?? p.prompt;

const data = {
  dimensions: RUBRIC_DIMENSIONS.map((d) => ({ key: d.key, label: d.label, short: SHORT[d.key] ?? d.key })),
  prompts,
};
const json = JSON.stringify(data).replace(/</g, "\\u003c");
writeFileSync(OUT, readFileSync("evals/rating/blind-template.html", "utf8").replace("/*DATA*/", () => json));
writeFileSync(KEY_PATH, JSON.stringify(key, null, 1) + "\n");
const total = prompts.reduce((n, p) => n + p.answers.length, 0);
console.log(`wrote ${OUT}: ${prompts.length} prompts, ${total} answers; key has ${Object.keys(key).length} entries`);
