import type { Issue } from "./check";
import { COLORS, type Color, type ManaReport } from "./mana";

/** Mean and spread of a number across real lists of one archetype. */
export interface Spread {
  mean: number;
  sd: number;
}

export interface ArchetypeManaProfile {
  format: string;
  strategy: string;
  lists: number;
  lands: Spread;
  sources: Partial<Record<Color, Spread>>;
}

/**
 * Compare a deck's mana with the real archetype it is built on. Real
 * lists of one archetype agree closely on land count (spread about 0.6 to
 * 1.3 lands), far more than any format-wide formula, so this is the
 * precise check. Bands never go below 1.5 lands or 2 sources.
 */
export function compareToArchetype(mana: ManaReport, profile: ArchetypeManaProfile): Issue[] {
  const issues: Issue[] = [];
  const landBand = Math.max(1.5, 2 * profile.lands.sd);
  const diff = mana.lands - profile.lands.mean;
  if (Math.abs(diff) > landBand) {
    issues.push({
      code: "land-count",
      message: `${mana.lands} lands; ${profile.strategy} lists run ${profile.lands.mean.toFixed(1)} (from ${profile.lists} real lists). ${diff < 0 ? "Add" : "Cut"} about ${Math.round(Math.abs(diff))}.`,
    });
  }
  for (const color of COLORS) {
    const real = profile.sources[color];
    if (!real || real.mean < 1) continue;
    const band = Math.max(2, 2 * real.sd);
    const have = mana.sources[color];
    if (have < real.mean - band) {
      issues.push({
        code: "colored-sources",
        message: `${have} ${color} sources; ${profile.strategy} lists run about ${real.mean.toFixed(1)}.`,
      });
    }
  }
  return issues;
}

/** Build a profile from mana reports of real lists. */
export function buildProfile(format: string, strategy: string, reports: ManaReport[]): ArchetypeManaProfile {
  const spread = (xs: number[]): Spread => {
    const mean = xs.reduce((s, v) => s + v, 0) / xs.length;
    const sd = Math.sqrt(xs.reduce((s, v) => s + (v - mean) ** 2, 0) / xs.length);
    return { mean: +mean.toFixed(2), sd: +sd.toFixed(2) };
  };
  const sources: Partial<Record<Color, Spread>> = {};
  for (const color of COLORS) {
    const xs = reports.map((r) => r.sources[color]);
    if (xs.some((x) => x > 0)) sources[color] = spread(xs);
  }
  return { format, strategy, lists: reports.length, lands: spread(reports.map((r) => r.lands)), sources };
}
