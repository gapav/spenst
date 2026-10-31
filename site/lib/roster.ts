import { ageClass } from "./maturity";

/**
 * Spenst is for athletes from the year they turn 14 — the same rule as the
 * `enforce_minimum_age` trigger. By age class rather than birthday, so a whole
 * J14 squad can be added in January.
 */
export const MIN_AGE_CLASS = 14;

export function meetsMinimumAge(birthMonth: string, asOf: Date): boolean {
  return ageClass(birthMonth, asOf) >= MIN_AGE_CLASS;
}

/**
 * “Firstname L.” — the same minimization Grep applies to its rosters, and the
 * same rule the `minimize_athlete_name` trigger enforces in the database.
 */
export function minimizeAthleteName(value: string) {
  const parts = value.trim().replace(/\s+/g, " ").split(" ").filter(Boolean);
  if (parts.length < 2) return parts[0] ?? "";
  return `${parts[0]} ${parts.at(-1)?.charAt(0).toLocaleUpperCase("en-GB")}.`;
}
