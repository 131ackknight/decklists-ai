/**
 * The progress bar's positions (site SPEC D-024), sent as `progress` (0 to 1) on status events. They move
 * only on real events. The brewer decides how many steps a deck takes (8 to 40), so each step closes part
 * of the remaining gap to STEPS_END instead of a fixed share: the bar never reaches the end early.
 */
export const PROGRESS = {
  /** The brew has started: loading the card pool and lists, reading the format. */
  warmup: 0.06,
  /** Where the first step starts from. */
  stepsStart: 0.12,
  /** The ceiling steps approach and never reach. */
  stepsEnd: 0.85,
  /** A step that submits the deck (the brewer then writes its notes). */
  submitted: 0.87,
  /** The deck is built: naming it and writing the blurb. */
  naming: 0.93,
} as const;

/** Each step closes this share of the gap left to STEPS_END (8 steps: about 70%, 15 steps: about 81%). */
const STEP_SHARE = 0.18;

export const WARMUP_PHRASE = "Warming up the forge";
export const NAMING_PHRASE = "Naming your deck";

/** Progress after the brewer's `step`-th step (1-based), whose note lists the tools it used. */
export function stepProgress(step: number, note: string): number {
  const p = PROGRESS.stepsStart + (PROGRESS.stepsEnd - PROGRESS.stepsStart) * (1 - (1 - STEP_SHARE) ** Math.max(0, step));
  return /(^|,\s*)submit_deck(\s*,|$)/.test(note) ? Math.max(p, PROGRESS.submitted) : p;
}
