/**
 * The run register (2026-11-07): every script that spends money on model calls
 * appends a line to evals/runs.jsonl when it starts and when it finishes, so no
 * run happens without a record of what it was, what code ran it, what it cost
 * and where its results are. A "started" line with no "finished" line is a run
 * that crashed or was stopped. Lines are only ever appended.
 */
import { execSync } from "node:child_process";
import { appendFileSync, existsSync, readFileSync } from "node:fs";

export const REGISTER = "evals/runs.jsonl";

export interface RunRecord {
  event: "started" | "finished";
  at: string;
  /** The script that ran, e.g. "run-round4". */
  script: string;
  /** The result file the run writes. */
  file: string;
  /** Frozen tests (evals/tests.ts) the run's results can be scored on. */
  tests: string[];
  harness?: string;
  model?: string;
  tracks?: string[];
  tag?: string;
  /** Items planned (started) or written (finished). */
  items: number;
  decks?: number;
  costUsd?: number;
  /** Finished with every planned item. */
  complete?: boolean;
  /** git HEAD when the run started, and whether code had uncommitted changes. "unknown" for backfilled runs. */
  commit: string;
  dirty: boolean | "unknown";
  /** Recorded after the fact from an existing result file. */
  backfilled?: boolean;
  /** For backfilled runs: the commit that first added the result file. */
  commitAdded?: string;
  note?: string;
}

/** The current commit and whether code (not results or data) has uncommitted changes. */
export function gitState(): { commit: string; dirty: boolean | "unknown" } {
  try {
    const commit = execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
    const changes = execSync("git status --porcelain -- src scripts evals/round4 evals/score.ts evals/tests.ts evals/register.ts", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
    return { commit, dirty: changes.length > 0 };
  } catch {
    return { commit: "unknown", dirty: "unknown" };
  }
}

/** Appends one line to the register. Started and finished lines share the git state taken at the start. */
export function recordRun(r: Omit<RunRecord, "at" | "commit" | "dirty"> & Partial<Pick<RunRecord, "at" | "commit" | "dirty">>, register = REGISTER): RunRecord {
  const git = r.commit ? { commit: r.commit, dirty: r.dirty ?? "unknown" } : gitState();
  const line: RunRecord = { ...r, at: r.at ?? new Date().toISOString(), commit: git.commit, dirty: git.dirty };
  appendFileSync(register, JSON.stringify(line) + "\n");
  return line;
}

export function readRegister(register = REGISTER): RunRecord[] {
  if (!existsSync(register)) return [];
  return readFileSync(register, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as RunRecord);
}

/** The latest finished record for each result file, plus files whose last record is a start (crashed or stopped). */
export function latestRuns(register = REGISTER) {
  const byFile = new Map<string, RunRecord>();
  for (const r of readRegister(register)) byFile.set(r.file, r);
  const all = [...byFile.values()];
  return { finished: all.filter((r) => r.event === "finished"), unfinished: all.filter((r) => r.event === "started") };
}
