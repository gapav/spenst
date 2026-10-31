import { asymmetry, type Asymmetry } from "./asymmetry";
import { dateResults, profileFor, squadValues, type PowerProfile, type TestKey } from "./power-profile";
import type { Athlete, Measurement, TestDay, TestResult } from "./types";

/**
 * Pure selectors over the provider's arrays — what a page needs to know about
 * a squad, computed the same way everywhere.
 */

export function teamAthletes(athletes: readonly Athlete[], teamId: string | undefined): Athlete[] {
  if (!teamId) return [];
  return athletes.filter((athlete) => athlete.teamIds.includes(teamId)).sort((a, b) => a.displayName.localeCompare(b.displayName, "en-GB"));
}

/** The newest measurement on or before `asOf`. */
export function latestMeasurement(measurements: readonly Measurement[], athleteId: string, asOf?: string): Measurement | null {
  return measurements
    .filter((measurement) => measurement.athleteId === athleteId && (!asOf || measurement.measuredOn <= asOf))
    .sort((a, b) => b.measuredOn.localeCompare(a.measuredOn))[0] ?? null;
}

export interface AthleteSummary {
  athlete: Athlete;
  profile: PowerProfile;
  asymmetry: Asymmetry | null;
  measurement: Measurement | null;
}

/**
 * Every athlete's profile, each compared with the squad given: their latest
 * values, the change since their previous test, and where they sit among the
 * others. No scores and no tiers.
 */
export function summarizeSquad(input: { athletes: readonly Athlete[]; results: readonly TestResult[]; testDays: readonly TestDay[]; measurements: readonly Measurement[]; asOf: Date; battery: readonly TestKey[] }): AthleteSummary[] {
  const ids = new Set(input.athletes.map((athlete) => athlete.id));
  const dated = dateResults(input.results.filter((result) => ids.has(result.athleteId)), input.testDays);
  const squad = squadValues(dated);
  return input.athletes.map((athlete) => {
    const profile = profileFor({ athlete, asOf: input.asOf, results: dated.filter((result) => result.athleteId === athlete.id), squad, battery: input.battery });
    const sides = profile.tests.find((test) => test.test.sided)?.latest?.sides;
    return { athlete, profile, measurement: latestMeasurement(input.measurements, athlete.id), asymmetry: sides?.left !== undefined && sides.right !== undefined ? asymmetry(sides.left, sides.right) : null };
  });
}

/** Athletes whose split squat jump is tagged or worse, the biggest gap first. */
export function asymmetryFlags(summaries: readonly AthleteSummary[]): AthleteSummary[] {
  return summaries
    .filter((summary) => summary.asymmetry && summary.asymmetry.level !== "ok")
    .sort((a, b) => (b.asymmetry?.deficitPercent ?? 0) - (a.asymmetry?.deficitPercent ?? 0));
}

/** How far a test day has come: athletes with at least one result, of the squad. */
export function testDayProgress(day: TestDay, athletes: readonly Athlete[], results: readonly TestResult[]): { tested: number; squad: number } {
  const squad = athletes.filter((athlete) => athlete.teamIds.includes(day.teamId));
  const tested = new Set(results.filter((result) => result.testDayId === day.id).map((result) => result.athleteId));
  return { tested: squad.filter((athlete) => tested.has(athlete.id)).length, squad: squad.length };
}
