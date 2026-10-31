import type { Direction } from "./power-profile";

/**
 * A test's results in order. Ties share a place, and the next athlete skips
 * the places they used — standard competition ranking. No points: a rank says
 * who was quicker on the day, not how good anyone is.
 */

export interface Ranked<T> {
  entry: T;
  rank: number;
}

export function rankEntries<T>(entries: readonly T[], value: (entry: T) => number, direction: Direction): Ranked<T>[] {
  const sorted = [...entries].sort((a, b) => direction === "higher" ? value(b) - value(a) : value(a) - value(b));
  let rank = 0;
  return sorted.map((entry, index) => {
    if (index === 0 || value(entry) !== value(sorted[index - 1])) rank = index + 1;
    return { entry, rank };
  });
}
