/**
 * Draw odds with no mulligans or card selection. Exact hypergeometric
 * math, so "how often do I have X by turn N" is a calculation, not a
 * guess.
 */

const logFactCache: number[] = [0];

function logFact(n: number): number {
  for (let i = logFactCache.length; i <= n; i++) {
    logFactCache[i] = logFactCache[i - 1] + Math.log(i);
  }
  return logFactCache[n];
}

function logChoose(n: number, k: number): number {
  if (k < 0 || k > n) return -Infinity;
  return logFact(n) - logFact(k) - logFact(n - k);
}

/** Cards seen by the start of `turn` (draw step included). */
export function cardsSeen(turn: number, onPlay = true): number {
  return 7 + turn - (onPlay ? 1 : 0);
}

/** P(exactly k hits) drawing n from a deck of N with K hits. */
export function hypergeom(N: number, K: number, n: number, k: number): number {
  return Math.exp(logChoose(K, k) + logChoose(N - K, n - k) - logChoose(N, n));
}

/** P(at least k hits) drawing n from a deck of N with K hits. */
export function probAtLeast(N: number, K: number, n: number, k: number): number {
  if (k <= 0) return 1;
  let p = 0;
  for (let i = k; i <= Math.min(K, n); i++) p += hypergeom(N, K, n, i);
  return Math.min(1, p);
}

/**
 * P(at least one card from each group) for disjoint groups, by
 * inclusion-exclusion over which groups come up empty.
 */
export function probEachGroup(N: number, groupSizes: number[], n: number): number {
  const g = groupSizes.length;
  let p = 0;
  for (let mask = 0; mask < 1 << g; mask++) {
    let missing = 0;
    let bits = 0;
    for (let i = 0; i < g; i++) {
      if (mask & (1 << i)) {
        missing += groupSizes[i];
        bits++;
      }
    }
    const allMissing = Math.exp(logChoose(N - missing, n) - logChoose(N, n));
    p += (bits % 2 === 0 ? 1 : -1) * allMissing;
  }
  return Math.max(0, Math.min(1, p));
}
