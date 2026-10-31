import { ageClass } from "./maturity";
import type { Athlete, Population, Side, TestDay, TestResult } from "./types";

/**
 * The test battery, after David Ballou's power profile, rebuilt for the gear a
 * club actually has: power tests off OVR Velocity (peak power per rep), sprint
 * and change of direction off OVR Sprint (time, not power — the gates cannot
 * measure force, and the battery does not need every test to be power).
 * Results are kept as measured. Without norms there is no 0–10 score and no
 * tier; see "Values, not scores" below.
 */

export type Direction = "higher" | "lower";
export type Unit = "s" | "W" | "cm" | "m";
export type Device = "ovr-sprint" | "ovr-velocity" | "ovr-jump" | "myjump" | "tape";
export type Quality = "acceleration" | "cod" | "vertical" | "single-leg" | "horizontal" | "upper" | "triple-extension";

/**
 * Five colour families, so a test keeps one accent everywhere it is drawn —
 * radar, picker, charts, leaderboard. Colours are on :root as `--q-<family>`,
 * validated for colour-blind separation in radar order; every coloured mark
 * also carries its label, so colour reinforces and never identifies alone.
 */
export type Family = "speed" | "vertical" | "single-leg" | "horizontal" | "upper";

export const QUALITY_FAMILY: Record<Quality, Family> = {
  acceleration: "speed",
  cod: "speed",
  vertical: "vertical",
  "single-leg": "single-leg",
  horizontal: "horizontal",
  upper: "upper",
  "triple-extension": "upper",
};

export const FAMILY_ORDER: readonly Family[] = ["speed", "vertical", "single-leg", "horizontal", "upper"];

export const familyLabels: Record<Family, string> = {
  speed: "Speed",
  vertical: "Vertical",
  "single-leg": "Single leg",
  horizontal: "Horizontal",
  upper: "Upper & total body",
};

export const familyOf = (test: Pick<TestDefinition, "quality">): Family => QUALITY_FAMILY[test.quality];

export interface TestDefinition {
  key: string;
  name: string;
  /** The radar axis label: short enough to sit outside a 320px chart. */
  shortName: string;
  unit: Unit;
  direction: Direction;
  device: Device;
  quality: Quality;
  /** Left and right are recorded separately and also feed the asymmetry check. */
  sided?: boolean;
  /** Bar-load power that has to be corrected for the moving body mass; see `lib/ovr.ts`. */
  bodyMassCorrected?: boolean;
  /** How it is run, where that changes the number: "1 m run-in". */
  protocol?: string;
}

const TEST_CATALOG = {
  sprint_5m: { key: "sprint_5m", name: "5 m sprint", shortName: "5 m", unit: "s", direction: "lower", device: "ovr-sprint", quality: "acceleration", protocol: "1 m run-in" },
  sprint_10m: { key: "sprint_10m", name: "10 m sprint", shortName: "10 m", unit: "s", direction: "lower", device: "ovr-sprint", quality: "acceleration" },
  cod_505: { key: "cod_505", name: "505 change of direction", shortName: "505", unit: "s", direction: "lower", device: "ovr-sprint", quality: "cod" },
  cmj: { key: "cmj", name: "Countermovement jump", shortName: "CMJ", unit: "cm", direction: "higher", device: "ovr-jump", quality: "vertical" },
  speed_squat: { key: "speed_squat", name: "Speed squat", shortName: "Squat", unit: "W", direction: "higher", device: "ovr-velocity", quality: "vertical" },
  trap_bar_jump: { key: "trap_bar_jump", name: "Trap bar jump", shortName: "Trap bar", unit: "W", direction: "higher", device: "ovr-velocity", quality: "vertical" },
  squat_jump: { key: "squat_jump", name: "Squat jump", shortName: "Squat jump", unit: "W", direction: "higher", device: "ovr-velocity", quality: "vertical", bodyMassCorrected: true },
  split_squat_jump: { key: "split_squat_jump", name: "Split squat jump", shortName: "Split jump", unit: "W", direction: "higher", device: "ovr-velocity", quality: "single-leg", sided: true, bodyMassCorrected: true },
  broad_jump: { key: "broad_jump", name: "Standing broad jump", shortName: "Broad jump", unit: "cm", direction: "higher", device: "tape", quality: "horizontal" },
  hang_clean: { key: "hang_clean", name: "Hang power clean", shortName: "Clean", unit: "W", direction: "higher", device: "ovr-velocity", quality: "triple-extension" },
  power_clean: { key: "power_clean", name: "Power clean", shortName: "P. clean", unit: "W", direction: "higher", device: "ovr-velocity", quality: "triple-extension" },
  push_press: { key: "push_press", name: "Push press", shortName: "Push press", unit: "W", direction: "higher", device: "ovr-velocity", quality: "upper" },
  // Key kept from when it was called a speed bench: results point at it.
  bench_throw: { key: "bench_throw", name: "Bench press", shortName: "Bench", unit: "W", direction: "higher", device: "ovr-velocity", quality: "upper", protocol: "for speed" },
  med_ball_throw: { key: "med_ball_throw", name: "Med ball throw, 2 kg", shortName: "Throw", unit: "m", direction: "higher", device: "tape", quality: "upper" },
} as const satisfies Record<string, TestDefinition>;

export type TestKey = keyof typeof TEST_CATALOG;
export const TESTS: Record<TestKey, TestDefinition> = TEST_CATALOG;

export function testDefinition(key: string): TestDefinition | null {
  return (TESTS as Record<string, TestDefinition>)[key] ?? null;
}

// ---------------------------------------------------------------------------
// Batteries: which tests make up a team's profile

/**
 * A team tests on one battery, chosen as a team setting. Its order is the
 * radar's: acceleration first, then vertical, single-leg and horizontal, then
 * upper body. Built-ins live here; a team's own are stored in the database.
 */
export interface TestBattery {
  /** `builtin:…` for the built-ins, a uuid for a team's own. */
  id: string;
  /** null for a built-in. */
  teamId: string | null;
  name: string;
  description: string;
  tests: readonly TestKey[];
}

export const DEFAULT_BATTERY_ID = "builtin:spenst-7";

export const BUILTIN_BATTERIES: readonly TestBattery[] = [
  {
    id: DEFAULT_BATTERY_ID, teamId: null, name: "Spenst 7",
    description: "Seven tests for everyone 14 and up, after Ballou: acceleration, jumping unloaded and loaded, one leg at a time, horizontal, and two upper-body presses.",
    tests: ["sprint_5m", "cmj", "trap_bar_jump", "split_squat_jump", "broad_jump", "push_press", "bench_throw"],
  },
  {
    id: "builtin:senior-10", teamId: null, name: "Senior 10",
    description: "The longer senior profile: sprints and change of direction, the barbell power lifts and the jumps.",
    tests: ["sprint_5m", "sprint_10m", "cod_505", "speed_squat", "trap_bar_jump", "squat_jump", "split_squat_jump", "hang_clean", "push_press", "bench_throw"],
  },
  {
    id: "builtin:youth-8", teamId: null, name: "Youth 8",
    description: "No barbell lifts: sprints, jumps and a throw, for squads without the training age for loaded power tests.",
    tests: ["sprint_5m", "sprint_10m", "cod_505", "cmj", "squat_jump", "split_squat_jump", "broad_jump", "med_ball_throw"],
  },
];

/** The battery a team tests on; one that cannot be found falls back to the default. */
export function batteryFor(team: { batteryId: string } | null | undefined, custom: readonly TestBattery[] = []): TestBattery {
  const id = team?.batteryId ?? DEFAULT_BATTERY_ID;
  return custom.find((battery) => battery.id === id) ?? BUILTIN_BATTERIES.find((battery) => battery.id === id) ?? BUILTIN_BATTERIES[0];
}

/** Only known tests, each once, in the order given. */
export function cleanBatteryTests(keys: readonly string[]): TestKey[] {
  return [...new Set(keys)].filter((key): key is TestKey => key in TESTS);
}

/** Senior from the year the athlete turns 18. */
export const ADULT_FROM_AGE_CLASS = 18;

export function populationFor(athlete: Pick<Athlete, "birthMonth">, asOf: Date): Population {
  return ageClass(athlete.birthMonth, asOf) >= ADULT_FROM_AGE_CLASS ? "adult" : "youth";
}

// ---------------------------------------------------------------------------
// Values, not scores
//
// There are no norms for these tests on this equipment, and one club's squads
// are far too few results to make any. So Spenst does not score athletes 0–10
// or sort them into tiers: every number is a measurement, compared only with
// the athlete's own earlier tests and with the squad they train with.

export interface DatedResult extends TestResult { heldOn: string }

/** Attaches each result's test date. Results whose test day is not loaded are dropped. */
export function dateResults(results: readonly TestResult[], testDays: readonly TestDay[]): DatedResult[] {
  const heldOn = new Map(testDays.map((day) => [day.id, day.heldOn]));
  return results.flatMap((result) => {
    const date = heldOn.get(result.testDayId);
    return date ? [{ ...result, heldOn: date }] : [];
  });
}

export interface LatestValue {
  /** For a sided test, the mean of both legs. */
  value: number;
  sides: Partial<Record<Side, number>>;
  heldOn: string;
  testDayId: string;
}

/**
 * Every test day's value per test, newest first. A sided test needs both legs
 * from the same day to count — half a split squat jump is neither a result nor
 * an asymmetry.
 */
export function valueHistory(results: readonly DatedResult[]): Map<string, LatestValue[]> {
  const byTestAndDay = new Map<string, DatedResult[]>();
  for (const result of results) {
    const key = `${result.testKey}|${result.testDayId}`;
    byTestAndDay.set(key, [...(byTestAndDay.get(key) ?? []), result]);
  }
  const history = new Map<string, LatestValue[]>();
  for (const group of byTestAndDay.values()) {
    const { testKey, heldOn, testDayId } = group[0];
    const test = testDefinition(testKey);
    let candidate: LatestValue | null = null;
    if (test?.sided) {
      const left = group.find((result) => result.side === "left")?.value;
      const right = group.find((result) => result.side === "right")?.value;
      if (left !== undefined && right !== undefined) candidate = { value: (left + right) / 2, sides: { left, right }, heldOn, testDayId };
    } else {
      const single = group.find((result) => result.side === null);
      if (single) candidate = { value: single.value, sides: {}, heldOn, testDayId };
    }
    if (candidate) history.set(testKey, [...(history.get(testKey) ?? []), candidate]);
  }
  for (const values of history.values()) values.sort((a, b) => b.heldOn.localeCompare(a.heldOn));
  return history;
}

/** The latest test day each test was run on. */
export function latestValues(results: readonly DatedResult[]): Map<string, LatestValue> {
  return new Map([...valueHistory(results)].map(([key, values]) => [key, values[0]]));
}

export const isBetter = (direction: Direction, a: number, b: number) => direction === "higher" ? a > b : a < b;

export interface ProfileTest {
  test: TestDefinition;
  latest: LatestValue | null;
  /** The test day before the latest one. */
  previous: LatestValue | null;
  /** latest − previous, in the test's unit. */
  change: number | null;
  /** Whether that change is better, given which way the test runs. */
  improved: boolean | null;
  /** The latest value as a share of the squad's best on the test: 1 is the best. */
  ofSquadBest: number | null;
  /** The squad's median, as the same share. */
  squadMedianOfBest: number | null;
  /** Where the value sits between the squad's weakest (0) and best (1) result on the test. */
  inSquadRange: number | null;
  /** The squad median on the same 0–1 range. */
  squadMedianInRange: number | null;
  /** The squad's weakest and best latest result on the test: the radar spoke's ends. */
  squadRange: { worst: number; best: number } | null;
  /** 1 is the best in the squad; ties share a place. */
  rank: number | null;
  /** Athletes in the squad with a value on the test. */
  ranked: number;
}

export interface PowerProfile {
  population: Population;
  tests: ProfileTest[];
}

/** Each test's latest value per athlete: the squad a result is compared with. */
export type SquadValues = ReadonlyMap<string, ReadonlyMap<string, number>>;

export function squadValues(results: readonly DatedResult[]): SquadValues {
  const byAthlete = new Map<string, DatedResult[]>();
  for (const result of results) byAthlete.set(result.athleteId, [...(byAthlete.get(result.athleteId) ?? []), result]);
  const squad = new Map<string, Map<string, number>>();
  for (const [athleteId, own] of byAthlete) {
    for (const [testKey, latest] of latestValues(own)) {
      const values = squad.get(testKey) ?? new Map<string, number>();
      values.set(athleteId, latest.value);
      squad.set(testKey, values);
    }
  }
  return squad;
}

/** A value as a share of the best: the slower the time, the smaller the share. */
export function shareOfBest(value: number, best: number, direction: Direction): number {
  return direction === "higher" ? value / best : best / value;
}

const median = (values: readonly number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

export function profileFor(input: { athlete: Pick<Athlete, "id" | "birthMonth">; asOf: Date; results: readonly DatedResult[]; squad: SquadValues; battery: readonly TestKey[] }): PowerProfile {
  const population = populationFor(input.athlete, input.asOf);
  const history = valueHistory(input.results);
  const tests = input.battery.map((key): ProfileTest => {
    const test = TESTS[key];
    const [latest = null, previous = null] = history.get(key) ?? [];
    const change = latest && previous ? latest.value - previous.value : null;
    const others = [...(input.squad.get(key)?.values() ?? [])];
    const best = others.length ? (test.direction === "higher" ? Math.max(...others) : Math.min(...others)) : null;
    const worst = others.length ? (test.direction === "higher" ? Math.min(...others) : Math.max(...others)) : null;
    const inRange = (value: number) => best === null || worst === null || best === worst ? 1 : (value - worst) / (best - worst);
    return {
      test, latest, previous, change,
      improved: change === null || change === 0 ? null : isBetter(test.direction, latest!.value, previous!.value),
      ofSquadBest: latest && best ? shareOfBest(latest.value, best, test.direction) : null,
      squadMedianOfBest: best && others.length ? shareOfBest(median(others), best, test.direction) : null,
      inSquadRange: latest && others.length ? inRange(latest.value) : null,
      squadMedianInRange: others.length > 1 ? inRange(median(others)) : null,
      squadRange: best !== null && worst !== null ? { worst, best } : null,
      rank: latest ? 1 + others.filter((value) => isBetter(test.direction, value, latest.value)).length : null,
      ranked: others.length,
    };
  });
  return { population, tests };
}

// ---------------------------------------------------------------------------
// Presentation

const unitDigits: Record<Unit, number> = { s: 2, W: 0, cm: 0, m: 1 };
const unitLabels: Record<Unit, string> = { s: "s", W: "W", cm: "cm", m: "m" };

export function formatValue(value: number, unit: Unit): string {
  const digits = unitDigits[unit];
  return `${new Intl.NumberFormat("en-GB", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value)} ${unitLabels[unit]}`;
}

/** "+0.04 s", "−120 W": a change with its sign. */
export function formatChange(change: number, unit: Unit): string {
  const text = formatValue(Math.abs(change), unit);
  return `${change > 0 ? "+" : change < 0 ? "−" : "±"}${text}`;
}

/** "1st", "2nd", "3rd", "11th". */
export function ordinal(n: number): string {
  const tens = n % 100;
  const suffix = tens >= 11 && tens <= 13 ? "th" : n % 10 === 1 ? "st" : n % 10 === 2 ? "nd" : n % 10 === 3 ? "rd" : "th";
  return `${n}${suffix}`;
}

export const deviceLabels: Record<Device, string> = {
  "ovr-sprint": "OVR Sprint",
  "ovr-velocity": "OVR Velocity",
  "ovr-jump": "OVR Jump",
  myjump: "My Jump",
  tape: "Tape measure",
};

/** Where a value sits on a squad range: 0 the weakest, 1 the best (clamped). */
export function positionInRange(range: { worst: number; best: number } | null, value: number): number | null {
  if (!range) return null;
  if (range.best === range.worst) return 1;
  return Math.min(1, Math.max(0, (value - range.worst) / (range.best - range.worst)));
}

// ---------------------------------------------------------------------------
// Comparison groups: the squad, or the athlete's position

export interface ComparisonPoint {
  date: string;
  average: number;
  low: number;
  high: number;
  athletes: number;
}

/**
 * A group's results on one test, test day by test day: the average, and the
 * range from weakest to best. A sided test counts each athlete's mean of the legs.
 */
export function groupHistory(results: readonly DatedResult[], athleteIds: ReadonlySet<string>, testKey: string): ComparisonPoint[] {
  const byDate = new Map<string, number[]>();
  const byAthlete = new Map<string, DatedResult[]>();
  for (const result of results) if (athleteIds.has(result.athleteId) && result.testKey === testKey) byAthlete.set(result.athleteId, [...(byAthlete.get(result.athleteId) ?? []), result]);
  for (const own of byAthlete.values()) {
    for (const value of valueHistory(own).get(testKey) ?? []) byDate.set(value.heldOn, [...(byDate.get(value.heldOn) ?? []), value.value]);
  }
  return [...byDate].map(([date, values]) => ({ date, average: values.reduce((sum, value) => sum + value, 0) / values.length, low: Math.min(...values), high: Math.max(...values), athletes: values.length }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** The group's average of each member's latest result on a test. */
export function groupLatestAverage(results: readonly DatedResult[], athleteIds: ReadonlySet<string>, testKey: string): number | null {
  const latest: number[] = [];
  const byAthlete = new Map<string, DatedResult[]>();
  for (const result of results) if (athleteIds.has(result.athleteId) && result.testKey === testKey) byAthlete.set(result.athleteId, [...(byAthlete.get(result.athleteId) ?? []), result]);
  for (const own of byAthlete.values()) { const value = latestValues(own).get(testKey); if (value) latest.push(value.value); }
  return latest.length ? latest.reduce((sum, value) => sum + value, 0) / latest.length : null;
}
