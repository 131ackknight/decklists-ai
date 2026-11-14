import { describe, expect, it } from "vitest";
import { PROGRESS, stepProgress } from "./progress";

describe("stepProgress (D-024)", () => {
  it("rises with every step and never reaches the steps' ceiling", () => {
    const ps = Array.from({ length: 40 }, (_, i) => stepProgress(i + 1, "search_cards"));
    expect(ps[0]).toBeGreaterThan(PROGRESS.stepsStart);
    expect(ps.every((p, i) => i === 0 || p > ps[i - 1])).toBe(true);
    expect(ps.at(-1)!).toBeLessThan(PROGRESS.stepsEnd);
  });

  it("puts an 8-step brew at about 70%", () => {
    expect(stepProgress(8, "check_deck")).toBeCloseTo(0.70, 2);
  });

  it("jumps to at least 'submitted' on a submit_deck step, and only on that tool", () => {
    expect(stepProgress(2, "submit_deck")).toBe(PROGRESS.submitted);
    expect(stepProgress(3, "check_deck, submit_deck")).toBe(PROGRESS.submitted);
    expect(stepProgress(2, "submit_brew")).toBeLessThan(PROGRESS.submitted);
  });

  it("keeps the phases in order", () => {
    expect(PROGRESS.warmup).toBeLessThan(PROGRESS.stepsStart);
    expect(PROGRESS.stepsEnd).toBeLessThan(PROGRESS.submitted);
    expect(PROGRESS.submitted).toBeLessThan(PROGRESS.naming);
    expect(PROGRESS.naming).toBeLessThan(1);
  });
});
