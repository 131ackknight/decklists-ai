import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { latestRuns, readRegister, recordRun } from "./register";

const temp = () => path.join(mkdtempSync(path.join(tmpdir(), "register-")), "runs.jsonl");
const run = { script: "test", tests: [], items: 2 };

describe("run register", () => {
  it("appends a line per event, with the git state of the start", () => {
    const file = temp();
    const started = recordRun({ event: "started", file: "a.json", ...run }, file);
    recordRun({ event: "finished", file: "a.json", ...run, costUsd: 1.5, complete: true, commit: started.commit, dirty: started.dirty }, file);
    const lines = readRegister(file);
    expect(lines.map((l) => l.event)).toEqual(["started", "finished"]);
    expect(lines[1].commit).toBe(started.commit);
    expect(started.commit.length).toBeGreaterThan(0);
  });

  it("reports a run that started and never finished", () => {
    const file = temp();
    recordRun({ event: "started", file: "done.json", ...run }, file);
    recordRun({ event: "finished", file: "done.json", ...run, complete: true }, file);
    recordRun({ event: "started", file: "crashed.json", ...run }, file);
    const { finished, unfinished } = latestRuns(file);
    expect(finished.map((r) => r.file)).toEqual(["done.json"]);
    expect(unfinished.map((r) => r.file)).toEqual(["crashed.json"]);
  });
});
