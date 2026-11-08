/**
 * One-time: record every run that happened before the register existed
 * (2026-11-07), from the result files it left. Each line is marked backfilled:
 * the code version that ran it is unknown, so commit is "unknown" and
 * commitAdded is the commit that first added the result file. Costs come from
 * the files where they store one; where they don't, costUsd is left out and the
 * note says so. Merged files (combinations of other runs) are skipped so nothing
 * is counted twice. Safe to rerun: files already in the register are skipped.
 *
 *   pnpm exec tsx scripts/backfill-runs.ts [--dry]
 */
import { execSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { readRegister, recordRun, type RunRecord } from "../evals/register";
import { testsCoveredBy } from "../evals/tests";

const ROOT = "evals/results";
const dry = process.argv.includes("--dry");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith(".json") ? [p] : [];
  });
}

const skip = (f: string) => /\/merged\/|\/pairs\/|\/ratings|\/decks\/|key|summary|answers|objective|novelty|checker-calibration|scorer-card-performance/.test(f);

function commitAdded(file: string) {
  try {
    const lines = execSync(`git log --diff-filter=A --format=%h -- "${file}"`, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim().split("\n").filter(Boolean);
    return lines.at(-1) ?? "not committed";
  } catch {
    return "unknown";
  }
}

type Row = Record<string, unknown>;
const have = new Set(readRegister().map((r) => r.file));
const records: (Omit<RunRecord, "commit" | "dirty" | "event">)[] = [];

for (const file of walk(ROOT).sort()) {
  if (skip(file) || have.has(file)) continue;
  const d = JSON.parse(readFileSync(file, "utf8")) as Row | Row[];
  const base = path.basename(file);
  const rows: Row[] = Array.isArray(d) ? d : Array.isArray(d.results) ? (d.results as Row[]).filter(Boolean) : Array.isArray(d.rows) ? (d.rows as Row[]) : [];
  if (!rows.length) continue;
  const meta = (Array.isArray(d) ? {} : d) as Row;
  const costs = rows.map((r) => (typeof r.costUsd === "number" ? r.costUsd : typeof r.cost === "number" ? r.cost : null));
  const known = costs.every((c) => c !== null) && costs.some((c) => (c as number) > 0);
  const costUsd = known ? Math.round((costs as number[]).reduce((a, b) => a + b, 0) * 10000) / 10000 : undefined;
  const at = typeof meta.ranAt === "string" ? meta.ranAt : statSync(file).mtime.toISOString();
  const ids = rows.map((r) => r.id as string).filter(Boolean);

  let script = "unknown (before the register)";
  let tests: string[] = [];
  let note: string | undefined;
  if (file.startsWith(`${ROOT}/round4/`) && meta.harness && meta.tracks) {
    script = "run-round4";
    tests = base.startsWith("found-") ? ["found-squee-v1"] : testsCoveredBy(ids);
    if (file.includes("/reruns/")) note = "a rerun of single items, kept in reruns/";
  } else if (base.startsWith("gem-test")) [script, tests] = ["gem-test", ["gem-v1"]];
  else if (base.startsWith("picker-test")) [script, tests] = ["picker-test", ["picker-v1"]];
  else if (base.startsWith("taste-test")) {
    script = "taste-test";
    tests = [meta.vs === "settled" ? "taste-v1" : "taste-first-v1"];
    note = `judge ${meta.model}; real ${meta.vs ?? "first"}; request ${meta.noRequest ? "hidden" : "shown"}${meta.withEvidence ? "; card evidence" : ""}${meta.withGoldfish ? "; goldfish" : ""}`;
  } else if (base === "playtest.json") {
    [script, tests] = ["playtest", ["playtest-v1"]];
    note = "9 of 14 decks saved; the first 5 decks' grades are only in evals/results/round4/logs/playtest.log. Cost not in the file (log: $4.07 for both runs).";
  } else if (base.startsWith("brainstorm-")) [script, note] = ["brainstorm-shells", "cost not in the file"];
  else if (file.includes("/intent/")) script = "eval-intent";
  else if (file.includes("/harness-v2/") || file.includes("/harness-v3/")) script = "run-harness-eval";
  else if (file.includes("/model-comparison/") || file.includes("/v1-baseline/") || file.includes("/round2-anchors/")) note = "v1 ran in GitHub Actions; cost not in the file (the log has it)";
  if (costUsd === undefined && !note?.includes("ost")) note = [note, "cost not in the file"].filter(Boolean).join("; ");

  records.push({
    at,
    script,
    file,
    tests,
    harness: (meta.harness as string) ?? undefined,
    model: (meta.model as string) ?? undefined,
    tracks: (meta.tracks as string[]) ?? undefined,
    items: rows.length,
    decks: rows.some((r) => "deck" in r) ? rows.filter((r) => r.deck).length : undefined,
    costUsd,
    complete: base !== "playtest.json",
    backfilled: true,
    commitAdded: commitAdded(file),
    note,
  });
}

records.sort((a, b) => a.at.localeCompare(b.at));
for (const r of records) {
  if (dry) console.log(`${r.at.slice(0, 10)} ${r.script.padEnd(20)} ${String(r.costUsd ?? "?").padStart(7)} ${r.tests.join(",").padEnd(36)} ${r.file}`);
  else recordRun({ event: "finished", ...r, commit: "unknown", dirty: "unknown" });
}
const total = records.reduce((a, r) => a + (r.costUsd ?? 0), 0);
console.log(`${records.length} runs${dry ? " (dry, nothing written)" : " backfilled"}; $${total.toFixed(2)} in costs the files record; ${records.filter((r) => r.costUsd === undefined).length} runs with no cost in the file`);
