import type { HandballPosition, Sex } from "./types";
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

export interface NewAthleteInput {
  name: string;
  /** `YYYY-MM`, as `<input type="month">` gives it. */
  birthMonth: string;
  sex: Sex | null;
  position: HandballPosition | null;
  measurementConsent: boolean;
}

export type CleanNewAthlete = Omit<NewAthleteInput, "sex"> & { sex: Sex };

/**
 * A new athlete as the database will accept it — the name minimized, a whole
 * birth month at or past the minimum age, a sex — or the first reason it
 * can't be added.
 */
export function cleanNewAthlete(input: NewAthleteInput, asOf: Date): CleanNewAthlete | { problem: string } {
  const name = minimizeAthleteName(input.name);
  if (!name) return { problem: "Write the athlete’s name." };
  if (name.length > 80) return { problem: "That name is too long." };
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.birthMonth)) return { problem: "Choose the birth month." };
  if (!meetsMinimumAge(input.birthMonth, asOf)) return { problem: `Röskr is for athletes from the year they turn ${MIN_AGE_CLASS}.` };
  if (!input.sex) return { problem: "Choose the athlete’s sex." };
  return { ...input, name, sex: input.sex };
}

/** The latest birth month `cleanNewAthlete` accepts, for the month picker’s `max`. */
export function latestBirthMonth(asOf: Date): string {
  return `${asOf.getFullYear() - MIN_AGE_CLASS}-12`;
}
