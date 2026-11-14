import type { TestKey } from "../power-profile";
import type { Period } from "../season";
import type { ExerciseSlot, Section, SectionKind, SessionContent, SetGroup, SlotVariant, Target } from "../training";
import type { HandballPosition } from "../types";
import type { AutoregulationRule, ZoneId } from "../vbt";
import { handball2ndDivision202627 } from "./handball-2nd-division-2026-27.ts";

/**
 * Senior Test Div 2: a second test team with a whole year in it — 14 senior
 * men, three test days of results, measurements, and a full season of blocks
 * and sessions. It plays Test Team’s fixture list and keeps Test Team’s phases,
 * week notes and throughline, which the data script copies from the live
 * season (so the phases are as the maintainer has edited them, not as
 * `handball-2nd-division-2026-27.ts` once wrote them).
 *
 * The programme follows the S&C wiki:
 *   - Team-sport annual plan: linear-like off-/preseason, undulating in-season
 *     maintenance at heavy loads twice a week, summated microcycles tuned to the
 *     fixture list (Gamble 2006; Mujika 2018).
 *   - Match-day anchoring: the hard strength day at MD-4 or earlier, power at
 *     MD-3, a micro-dose primer at MD-2/MD-1, and at least one session in every
 *     week as the minimum dose (Beato 2021).
 *   - Velocity zones for the main lift of each block, with Ballou’s set-to-set
 *     bump rule (SummerStrong 19 — David Ballou), and loads never in % 1RM.
 *   - The throughline: sprint, jump and lift heavy every week; Nordics and
 *     Copenhagens every week (phase notes).
 *
 * `scripts/team-seed-sql.mts` turns this into
 * `supabase/data/2026-27-senior-test-div-2.sql` (decision 23). Everything is
 * deterministic — ids and values come from a seeded generator — so the SQL
 * only changes when this file does.
 *
 * Runtime imports carry `.ts` and the rest are type-only, so Node can run the
 * script directly.
 */

export type TemplateBlock = Omit<Period, "id" | "seasonId">;

export interface SeedAthlete {
  id: string;
  /** Already “Firstname L.”; the database trigger would make it so anyway. */
  displayName: string;
  /** `YYYY-MM`. */
  birthMonth: string;
  position: HandballPosition;
  measurementConsent: boolean;
}

export interface SeedMeasurement {
  athleteId: string;
  measuredOn: string;
  heightCm: number;
  sittingHeightCm: number;
  bodyMassKg: number;
}

export interface SeedResult {
  athleteId: string;
  testKey: TestKey;
  side: "both" | "left" | "right";
  value: number;
}

export interface SeedTestDay {
  id: string;
  heldOn: string;
  title: string;
  notes: string;
  results: SeedResult[];
}

/** What a session is for; used by the tests and the title, never stored. */
export type SessionKind =
  | "lower" | "upper" | "single-leg" | "primer" | "minimum"
  | "home" | "transition" | "off-lower" | "off-upper" | "off-power" | "run-strength" | "run-speed";

export interface SeedSession {
  id: string;
  kind: SessionKind;
  scheduledOn: string;
  title: string;
  status: "draft" | "published";
  content: SessionContent;
}

export interface TeamSeed {
  teamId: string;
  teamName: string;
  population: "adult";
  batteryKey: string;
  /** Phases, week notes, matches and throughline are copied from this team’s season. */
  source: { teamName: string; seasonTitle: string };
  season: { id: string; title: string; startsOn: string; weeks: number };
  athletes: SeedAthlete[];
  measurements: SeedMeasurement[];
  testDays: SeedTestDay[];
  blocks: TemplateBlock[];
  sessions: SeedSession[];
}

// ---------------------------------------------------------------------------
// Deterministic randomness and ids

function generator(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function uuidFactory(seed: number): () => string {
  const random = generator(seed);
  return () => {
    const bytes = Array.from({ length: 16 }, () => Math.floor(random() * 256));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = bytes.map((byte) => byte.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  };
}

const entityId = uuidFactory(0x5e2026);
const contentId = uuidFactory(0xc0de27);
const noise = generator(0xbeef14);
/** Uniform in [-1, 1). */
const jitter = () => noise() * 2 - 1;

// ---------------------------------------------------------------------------
// Dates (UTC date keys, as in lib/season.ts; repeated so this file has no runtime imports from the app)

const DAY = 86_400_000;
const dayNumber = (date: string) => Math.round(Date.parse(`${date}T00:00:00Z`) / DAY);
const dateOf = (day: number) => new Date(day * DAY).toISOString().slice(0, 10);
const addDays = (date: string, days: number) => dateOf(dayNumber(date) + days);
const round = (value: number, places: number) => Math.round(value * 10 ** places) / 10 ** places;

// ---------------------------------------------------------------------------
// The team and the season

const SEASON_START = "2026-08-03";
const SEASON_WEEKS = 52;
/** Sessions on or before this date are published; the rest are drafts the coach publishes as the year goes. */
const PUBLISHED_UNTIL = "2026-12-20";

const teamId = entityId();
const seasonId = entityId();

// ---------------------------------------------------------------------------
// Athletes: a 2. divisjon senior squad. Fictional; names already minimized.

interface Profile {
  name: string;
  born: string;
  position: HandballPosition;
  heightCm: number;
  massKg: number;
  /** −1…1: how good this athlete is for the squad, on top of position and size. */
  level: number;
  /** Split squat jump: how much weaker the weak leg is, as a share. */
  asymmetry: number;
  weakSide: "left" | "right";
  /** Joined in the summer: no results from last season. */
  newSigning?: boolean;
  /** Missed the autumn retest (ankle). */
  missedAutumnTest?: boolean;
}

const PROFILES: Profile[] = [
  { name: "Henrik S.", born: "1996-03", position: "keeper", heightCm: 194, massKg: 96, level: 0.1, asymmetry: 0.04, weakSide: "left" },
  { name: "Magnus B.", born: "2003-11", position: "keeper", heightCm: 191, massKg: 90, level: -0.3, asymmetry: 0.06, weakSide: "right" },
  { name: "Jonas H.", born: "1999-06", position: "wing", heightCm: 180, massKg: 79, level: 0.6, asymmetry: 0.02, weakSide: "left" },
  { name: "Sindre L.", born: "2002-02", position: "wing", heightCm: 178, massKg: 77, level: 0.3, asymmetry: 0.05, weakSide: "left" },
  { name: "Even K.", born: "2005-09", position: "wing", heightCm: 182, massKg: 76, level: -0.2, asymmetry: 0.03, weakSide: "right" },
  { name: "Ola T.", born: "1997-12", position: "wing", heightCm: 181, massKg: 81, level: 0.2, asymmetry: 0.11, weakSide: "right" },
  { name: "Kristian A.", born: "1998-04", position: "back", heightCm: 196, massKg: 98, level: 0.7, asymmetry: 0.03, weakSide: "left", missedAutumnTest: true },
  { name: "Martin R.", born: "2001-08", position: "back", heightCm: 193, massKg: 95, level: 0.4, asymmetry: 0.12, weakSide: "right" },
  { name: "Eirik N.", born: "2004-01", position: "back", heightCm: 192, massKg: 89, level: -0.1, asymmetry: 0.04, weakSide: "left" },
  { name: "Andreas M.", born: "1995-10", position: "back", heightCm: 190, massKg: 94, level: 0, asymmetry: 0.07, weakSide: "left" },
  { name: "Tobias F.", born: "2000-05", position: "centre", heightCm: 185, massKg: 86, level: 0.5, asymmetry: 0.02, weakSide: "right" },
  { name: "Sander J.", born: "2006-03", position: "centre", heightCm: 183, massKg: 80, level: -0.4, asymmetry: 0.05, weakSide: "left", newSigning: true },
  { name: "Håkon V.", born: "1997-07", position: "pivot", heightCm: 192, massKg: 104, level: 0.2, asymmetry: 0.04, weakSide: "right" },
  { name: "Vegard E.", born: "2002-10", position: "pivot", heightCm: 189, massKg: 100, level: -0.2, asymmetry: 0.08, weakSide: "left" },
];

const athletes: SeedAthlete[] = PROFILES.map((profile) => ({
  id: entityId(),
  displayName: profile.name,
  birthMonth: profile.born,
  position: profile.position,
  measurementConsent: true,
}));

// ---------------------------------------------------------------------------
// Test days: last season’s end, the preseason baseline and the autumn-gap retest.
// The team tests on Senior 10. Values are as OVR would give them: sprint times
// in seconds (5 m with a 1 m run-in), power as peak watts of the bar.

const BATTERY_KEY = "builtin:senior-10";

interface Occasion {
  heldOn: string;
  title: string;
  notes: string;
  /** Multipliers on last season’s end: power up, times down after a good off-season. */
  power: number;
  time: number;
  /** Body mass change in kg. */
  mass: number;
}

const OCCASIONS: Occasion[] = [
  { heldOn: "2026-04-15", title: "End of season 2025/26", notes: "After the last match of last season. Sets the off-season priorities.", power: 1, time: 1, mass: 0 },
  { heldOn: "2026-08-04", title: "Preseason baseline", notes: "Week 1 of the preseason, before the team load rises. The season baseline.", power: 1.05, time: 0.99, mass: 1.2 },
  { heldOn: "2026-10-06", title: "Autumn gap retest", notes: "In the Pause between Fyllingen (26 Sep) and Ros (17 Oct): has the autumn cost anything?", power: 1.075, time: 0.985, mass: 0.6 },
];

/** Position effects: wings are fast and light, backs throw hard, pivots are strong but slower. */
const POSITION = {
  keeper: { sprint: 0.04, cod: 0.06, lower: 1.0, upper: 1.0 },
  wing: { sprint: -0.06, cod: -0.08, lower: 1.04, upper: 0.92 },
  back: { sprint: 0.0, cod: 0.0, lower: 1.02, upper: 1.1 },
  centre: { sprint: -0.03, cod: -0.05, lower: 1.0, upper: 1.0 },
  pivot: { sprint: 0.07, cod: 0.12, lower: 0.97, upper: 1.04 },
} satisfies Record<HandballPosition, { sprint: number; cod: number; lower: number; upper: number }>;

/** Watts per kg of body mass for each power test, a squad-typical senior man. */
const WATTS_PER_KG = { speed_squat: 22, trap_bar_jump: 42, squat_jump: 30, split_squat_jump: 20, hang_clean: 28, push_press: 19, bench_throw: 9.5 } as const;
const UPPER: ReadonlySet<TestKey> = new Set(["push_press", "bench_throw"]);

function resultsFor(athlete: SeedAthlete, profile: Profile, occasion: Occasion, growth: number): SeedResult[] {
  const position = POSITION[profile.position];
  const mass = profile.massKg + occasion.mass;
  const time = (base: number) => round(base * occasion.time * (1 + 0.006 * jitter()), 3);
  const sprint5 = time(1.05 + position.sprint - 0.04 * profile.level);
  const results: SeedResult[] = [
    { athleteId: athlete.id, testKey: "sprint_5m", side: "both", value: sprint5 },
    { athleteId: athlete.id, testKey: "sprint_10m", side: "both", value: round(sprint5 + time(0.71 + position.sprint * 0.5 - 0.02 * profile.level), 3) },
    { athleteId: athlete.id, testKey: "cod_505", side: "both", value: time(2.45 + position.cod - 0.06 * profile.level) },
  ];
  for (const [key, perKg] of Object.entries(WATTS_PER_KG) as [keyof typeof WATTS_PER_KG, number][]) {
    const factor = (UPPER.has(key) ? position.upper : position.lower) * (1 + 0.12 * profile.level) * occasion.power * growth * (1 + 0.02 * jitter());
    const watts = mass * perKg * factor;
    if (key === "split_squat_jump") {
      const strong = Math.round(watts * (1 + profile.asymmetry / 2));
      const weak = Math.round(strong * (1 - profile.asymmetry));
      results.push(
        { athleteId: athlete.id, testKey: key, side: "left", value: profile.weakSide === "left" ? weak : strong },
        { athleteId: athlete.id, testKey: key, side: "right", value: profile.weakSide === "right" ? weak : strong },
      );
    } else {
      results.push({ athleteId: athlete.id, testKey: key, side: "both", value: Math.round(watts) });
    }
  }
  return results;
}

/** Some athletes respond more than others: younger ones gain more over the off-season. */
const growthOf = (profile: Profile, index: number) => (index === 0 ? 1 : 1 + Math.max(0, Number(profile.born.slice(0, 4)) - 2000) * 0.004);

const testDays: SeedTestDay[] = OCCASIONS.map((occasion, index) => ({
  id: entityId(),
  heldOn: occasion.heldOn,
  title: occasion.title,
  notes: occasion.notes,
  results: athletes.flatMap((athlete, athleteIndex) => {
    const profile = PROFILES[athleteIndex];
    if (index === 0 && profile.newSigning) return [];
    if (index === 2 && profile.missedAutumnTest) return [];
    return resultsFor(athlete, profile, occasion, growthOf(profile, index));
  }),
}));

const measurements: SeedMeasurement[] = OCCASIONS.flatMap((occasion, index) =>
  athletes.flatMap((athlete, athleteIndex): SeedMeasurement[] => {
    const profile = PROFILES[athleteIndex];
    if (index === 0 && profile.newSigning) return [];
    if (index === 2 && profile.missedAutumnTest) return [];
    return [{
      athleteId: athlete.id,
      measuredOn: occasion.heldOn,
      heightCm: profile.heightCm,
      sittingHeightCm: round(profile.heightCm * 0.52, 1),
      bodyMassKg: round(profile.massKg + occasion.mass + 0.6 * jitter(), 1),
    }];
  }));

// ---------------------------------------------------------------------------
// Blocks: the mesocycles inside Test Team’s phases, week-aligned and back to back.

const block = (kind: Period["kind"], title: string, startsOn: string, weeks: number, emphasis: ZoneId | null, focus: string, notes: string[]): TemplateBlock =>
  ({ level: "block", kind, title, startsOn, weeks, emphasis, focus, notes: notes.join("\n") });

const blocks: TemplateBlock[] = [
  block("training", "Preseason: strength-speed", "2026-08-03", 3, "strength-speed",
    "Turn the off-season’s strength into speed while the handball load doubles.",
    ["3 sessions a week in weeks 1–2, then a taper week: 2 sessions, volume down, intensity kept.",
      "Main lift in the strength-speed zone (0.75–0.90 m/s); one heavy trap bar set every week keeps the strength.",
      "Sprints at ≥ 90 % speed with full rest, Nordics and Copenhagens every week."]),
  block("competition", "Autumn I: hold and load", "2026-08-24", 5, "accelerative-strength",
    "Hold the preseason level through three matches, and load harder in the two match-free weeks.",
    ["Match weeks: the lower-body strength day at MD-4 or earlier, upper body and power at MD-3, a primer at MD-2 when the week is short.",
      "w36–37 have no match: 3 sessions, one more set on the main lifts.",
      "Trap bar deadlift in the accelerative-strength zone (0.50–0.75 m/s)."]),
  block("training", "Autumn gap: maximal strength", "2026-09-28", 2, "absolute-strength",
    "Two weeks without a match: a short block of heavy strength and maximal-velocity sprints.",
    ["Week 1 loads (3 sessions, 4 sets); week 2 unloads into Ros on 17 Oct.",
      "Back squat in the absolute-strength zone (0.35–0.50 m/s), never below 0.30.",
      "Retest on Tue 6 Oct."]),
  block("competition", "Autumn II: accelerative strength", "2026-10-12", 5, "accelerative-strength",
    "Keep strength and speed through the away weekend, and load in w45–46.",
    ["w44 (away weekend): one minimum-dose session on Monday.",
      "w45: Mon–Tue are for recovery after the travel; loading from Wednesday.",
      "w45–46 are the heaviest weeks of the phase."]),
  block("competition", "Autumn II: heavy and short", "2026-11-16", 5, "absolute-strength",
    "A match every weekend until Christmas: heavy but short strength work, and no new exercises.",
    ["w47: Wednesday match, so only a primer before it; the strength day moves to Friday.",
      "2–3 work sets on the main lift, in the absolute-strength zone.",
      "Cut to the minimum dose if the squad reports high fatigue."]),
  block("break", "Christmas home programme", "2026-12-21", 2, null,
    "Keep detraining small without team practice.",
    ["2 home sessions a week, 20–30 min: jumps, single-leg strength, Nordics, short sprints where possible.",
      "Nothing new, nothing that leaves players sore."]),
  block("training", "Reload", "2027-01-04", 1, "accelerative-strength",
    "Back to full sprint speed and heavy strength in one week.",
    ["Moderate volume at normal intensity; sprints build to ≥ 90 % by Thursday.",
      "Retest the battery at the first practice."]),
  block("competition", "Winter I: accelerative strength", "2027-01-11", 4, "accelerative-strength",
    "Keep strength through the restart; w03 is the loading week.",
    ["Same structure as the autumn: strength early in the week, power at MD-3.",
      "w03 has no match: 3 sessions."]),
  block("competition", "Winter II: strength-speed", "2027-02-08", 4, "strength-speed",
    "Move the main lift towards speed through the away weekend and the two-match week.",
    ["w06 (away weekend) and w09 (two matches): one minimum-dose session.",
      "w08 has no match: the loading week of the block.",
      "Speed squat in the strength-speed zone; one heavy trap bar set each week."]),
  block("competition", "Run-in: speed-strength", "2027-03-08", 5, "speed-strength",
    "Fresh and sharp for the last three rounds: high quality, low volume.",
    ["w10 is the last loading week of the season; w12 (Easter) is light.",
      "Speed squat at 0.90–1.30 m/s; a bar faster than 1.05 m/s gets 5 kg more (Ballou).",
      "Strength stays heavy with fewer sets."]),
  block("competition", "Taper and peak (if group winner)", "2027-04-12", 3, "speed-strength",
    "Only if the team wins the group: cut volume, keep intensity and frequency into qualification.",
    ["The sessions are drafts: publish them only if the team qualifies.",
      "Between the two qualification matches: recovery and a primer, nothing more.",
      "Not qualified: delete them and start the transition a week early."]),
  block("break", "Transition: minimum dose", "2027-05-03", 3, null,
    "Recover after a 9-month season, with a minimum dose so detraining stays small.",
    ["2 short sessions a week, unsupervised; other sports count.",
      "Treat the season’s niggles now."]),
  block("training", "Off-season I: hypertrophy and capacity", "2027-05-24", 3, null,
    "Build muscle and tissue capacity: moderate loads, more sets and reps.",
    ["3 sessions a week: lower, upper, power + speed.",
      "8–10 reps on the main lifts at RPE 7–8; week 2 adds a set, week 3 unloads.",
      "Some sprints and jumps every week at low volume (the throughline)."]),
  block("training", "Off-season II: maximal strength", "2027-06-14", 3, "absolute-strength",
    "Turn the new muscle into maximal strength before the summer break.",
    ["3–5 reps in the absolute-strength zone (0.35–0.50 m/s).",
      "Week 2 adds a set, week 3 unloads before the holiday."]),
  block("break", "Summer programme", "2027-07-05", 3, null,
    "Holiday: a short programme players do alone keeps strength and fitness from falling far.",
    ["2 sessions a week, 30 min, no equipment needed.",
      "Jumps, single-leg strength, sprints and intervals."]),
  block("training", "Return to running", "2027-07-26", 1, null,
    "Running and sprint volume back up before team practice starts on 2 Aug.",
    ["Progressive intervals and sprint build-ups to ≥ 90 % speed.",
      "Strength twice, at moderate load."]),
];

// ---------------------------------------------------------------------------
// Session content

const range = (min: number, max = min): Target => ({ min, max });
const kg = (min: number, max = min) => ({ min, max, basis: "kg" as const });

function sets(count: number, fields: Omit<SetGroup, "id" | "count"> = {}): SetGroup {
  return { id: contentId(), count, ...fields };
}

interface SlotOptions {
  paired?: boolean;
  note?: string;
  easier?: string;
  harder?: string;
  auto?: AutoregulationRule;
}

function slot(exercise: string, groups: SetGroup[], options: SlotOptions = {}): ExerciseSlot {
  const variant = (level: -1 | 1, key: string): SlotVariant => ({ id: contentId(), level, exerciseId: `builtin:${key}`, setGroups: [], note: "" });
  return {
    id: contentId(),
    exerciseId: `builtin:${exercise}`,
    pairedWithPrevious: options.paired ?? false,
    setGroups: groups,
    autoregulation: options.auto ?? null,
    note: options.note ?? "",
    variants: [...(options.easier ? [variant(-1, options.easier)] : []), ...(options.harder ? [variant(1, options.harder)] : [])],
  };
}

const TITLES: Record<Exclude<SectionKind, "custom">, string> = {
  prep: "Warm-up",
  speed: "Speed focus",
  main: "Main lifts",
  accessory: "Accessories",
  conditioning: "Conditioning",
};

function section(kind: Exclude<SectionKind, "custom">, slots: ExerciseSlot[]): Section {
  return { id: contentId(), kind, title: TITLES[kind], slots };
}

const content = (...sections: Section[]): SessionContent => ({ sections: sections.filter((candidate) => candidate.slots.length) });

const warmUp = () => section("prep", [slot("skadefri_warmup", [sets(1, { time: range(600) })], { note: "With the shoulder part (OSTRC) on upper-body days." })]);

/** The main lift of a block, by its velocity zone (Ballou’s zones, mean velocity). */
const ZONE_LIFT: Record<ZoneId, { exercise: string; reps: Target; velocity: Target; rest: number; auto: AutoregulationRule; rpe: boolean }> = {
  "absolute-strength": { exercise: "back_squat", reps: range(3, 5), velocity: range(0.35, 0.5), rest: 180, auto: { target: 0.35, bumpAbove: 0.5, bumpKg: 2.5 }, rpe: true },
  "accelerative-strength": { exercise: "trap_bar_deadlift", reps: range(3, 4), velocity: range(0.5, 0.75), rest: 180, auto: { target: 0.5, bumpAbove: 0.75, bumpKg: 5 }, rpe: true },
  "strength-speed": { exercise: "speed_squat", reps: range(3), velocity: range(0.75, 0.9), rest: 150, auto: { target: 0.75, bumpAbove: 0.9, bumpKg: 5 }, rpe: false },
  "speed-strength": { exercise: "speed_squat", reps: range(3), velocity: range(0.9, 1.3), rest: 150, auto: { target: 0.9, bumpAbove: 1.05, bumpKg: 5 }, rpe: false },
};

const BENCH: Record<ZoneId, { exercise: string; reps: Target; velocity: Target; rpe: boolean }> = {
  "absolute-strength": { exercise: "bench_press", reps: range(3, 5), velocity: range(0.3, 0.5), rpe: true },
  "accelerative-strength": { exercise: "bench_press", reps: range(3, 5), velocity: range(0.5, 0.75), rpe: true },
  "strength-speed": { exercise: "bench_press", reps: range(3), velocity: range(0.75, 0.9), rpe: true },
  "speed-strength": { exercise: "speed_bench", reps: range(3), velocity: range(0.9, 1.3), rpe: false },
};

/** How hard a week is: loading weeks add a set, unloading weeks take one off. */
export type Dose = "load" | "normal" | "unload";
const mainSets = (dose: Dose) => (dose === "load" ? 4 : dose === "normal" ? 3 : 2);

function zoneLift(zone: ZoneId, dose: Dose): ExerciseSlot {
  const lift = ZONE_LIFT[zone];
  return slot(lift.exercise, [sets(mainSets(dose), { reps: lift.reps, velocity: lift.velocity, ...(lift.rpe ? { rpe: range(7, 8) } : {}), restSeconds: lift.rest })], {
    auto: lift.auto,
    note: lift.rpe ? "Load to the velocity: every rep inside the zone. Never below 0.30 m/s." : "Maximum intent on every rep. Light enough to stay in the zone.",
  });
}

/** One heavy exposure every week, whatever the block (the throughline). */
const heavyTrapBar = (count: number) => slot("trap_bar_deadlift", [sets(count, { reps: range(3), velocity: range(0.5, 0.7), rpe: range(8), restSeconds: 180 })], { note: "Heavy and short: the week’s heavy exposure." });

const nordics = (count: number) => slot("nordic_curl", [sets(count, { reps: range(3, 5), rpe: range(7, 8), restSeconds: 90 })], { easier: "band_nordic" });
const copenhagen = (count: number) => slot("copenhagen_plank", [sets(count, { time: range(20, 30), perSide: true, restSeconds: 45 })], { easier: "copenhagen_short" });
const accelerations = (count: number, min = 10, max = 20) => slot("acceleration_10", [sets(count, { distance: range(min, max), restSeconds: 120 })], { note: "≥ 90 % speed. Full rest: stop when the times slow." });

function lowerDay(zone: ZoneId, dose: Dose): SessionContent {
  const power = zone === "strength-speed" || zone === "speed-strength";
  return content(
    warmUp(),
    section("speed", [
      accelerations(dose === "load" ? 6 : dose === "normal" ? 5 : 4),
      slot("box_jump", [sets(dose === "unload" ? 2 : 3, { contacts: range(4), restSeconds: 60 })], { harder: "drop_jump", note: "Step down, every jump at full height." }),
    ]),
    section("main", [
      zoneLift(zone, dose),
      ...(power ? [heavyTrapBar(dose === "unload" ? 1 : 2)] : []),
      slot("pull_up", [sets(dose === "unload" ? 2 : 3, { reps: range(4, 6), rpe: range(8), restSeconds: 90 })], { paired: true, easier: "band_pull_up" }),
      slot("rfe_split_squat", [sets(dose === "unload" ? 2 : 3, { reps: range(5), rpe: range(8), perSide: true, restSeconds: 90 })], { easier: "bw_split_squat", harder: "ssb_split_squat" }),
    ]),
    section("accessory", [nordics(dose === "unload" ? 2 : 3), copenhagen(2)]),
  );
}

function upperDay(zone: ZoneId, dose: Dose): SessionContent {
  const bench = BENCH[zone];
  const power = zone === "strength-speed" || zone === "speed-strength";
  return content(
    warmUp(),
    section("speed", [
      ...(dose === "load" ? [slot("flying_10", [sets(3, { distance: range(10), restSeconds: 180 })], { note: "20 m run-up; maximal velocity. Full rest." })] : []),
      slot("mb_overhead_throw", [sets(3, { reps: range(5), load: kg(3), restSeconds: 60 })]),
      slot("mb_rotational_throw", [sets(3, { reps: range(5), load: kg(3), perSide: true, restSeconds: 60 })], { note: "Hips first, like the throw in handball." }),
    ]),
    section("main", [
      slot("hang_power_clean", [sets(mainSets(dose), { reps: range(3), restSeconds: 150 })], { easier: "hang_high_pull", harder: "power_clean", note: "Fast bar; stop the set if the catch gets slow." }),
      slot(bench.exercise, [sets(mainSets(dose), { reps: bench.reps, velocity: bench.velocity, ...(bench.rpe ? { rpe: range(7, 8) } : {}), restSeconds: 150 })]),
      slot("db_row", [sets(3, { reps: range(6, 8), rpe: range(8), perSide: true, restSeconds: 60 })], { paired: true }),
      power
        ? slot("push_press", [sets(3, { reps: range(3), restSeconds: 120 })], { note: "Short dip, drive the bar up fast." })
        : slot("landmine_press", [sets(3, { reps: range(6), rpe: range(7, 8), perSide: true, restSeconds: 60 })]),
    ]),
    section("accessory", [slot("hip_thrust", [sets(dose === "unload" ? 2 : 3, { reps: range(6, 8), rpe: range(7), restSeconds: 60 })])]),
  );
}

function singleLegDay(dose: Dose): SessionContent {
  return content(
    warmUp(),
    section("speed", [
      accelerations(4, 20),
      slot("cod_505", [sets(4, { distance: range(10), restSeconds: 120 })], { note: "Both turning legs: 2 reps each." }),
      slot("lateral_bound", [sets(3, { contacts: range(4), perSide: true, restSeconds: 60 })]),
      slot("single_leg_hop", [sets(2, { contacts: range(4), perSide: true, restSeconds: 60 })]),
    ]),
    section("main", [
      slot("ssb_split_squat", [sets(mainSets(dose), { reps: range(4, 5), rpe: range(8), perSide: true, restSeconds: 120 })], { easier: "rfe_split_squat", note: "Weaker leg first; the asymmetry flag is watched here." }),
      slot("romanian_deadlift", [sets(3, { reps: range(6), rpe: range(7), restSeconds: 90 })]),
      slot("step_up", [sets(2, { reps: range(6), rpe: range(7), perSide: true, restSeconds: 60 })]),
    ]),
    section("accessory", [copenhagen(2)]),
  );
}

function primer(): SessionContent {
  return content(
    section("prep", [slot("activation", [sets(1, { time: range(300) })])]),
    section("speed", [
      slot("pogo_jump", [sets(2, { contacts: range(10), restSeconds: 45 })]),
      accelerations(3, 10, 10),
    ]),
    section("main", [
      slot("trap_bar_jump", [sets(3, { reps: range(2), restSeconds: 90 })], { note: "Light bar, maximum intent. 2 reps only: a primer, not training." }),
      slot("mb_chest_pass", [sets(2, { reps: range(5), load: kg(3), restSeconds: 45 })]),
    ]),
  );
}

function minimumDose(): SessionContent {
  return content(
    warmUp(),
    section("speed", [accelerations(3, 10, 15), slot("box_jump", [sets(2, { contacts: range(3), restSeconds: 60 })])]),
    section("main", [
      heavyTrapBar(2),
      slot("bench_press", [sets(2, { reps: range(3), velocity: range(0.5, 0.7), rpe: range(8), restSeconds: 120 })]),
    ]),
    section("accessory", [nordics(2)]),
  );
}

function homeProgramme(summer: boolean): SessionContent {
  return content(
    section("prep", [slot("activation", [sets(1, { time: range(300) })])]),
    section("speed", [
      slot("pogo_jump", [sets(3, { contacts: range(15), restSeconds: 45 })]),
      accelerations(4, 15, 15),
      slot("single_leg_hop", [sets(2, { contacts: range(4), perSide: true, restSeconds: 60 })]),
    ]),
    section("main", [
      slot("bw_split_squat", [sets(3, { reps: range(8, 10), rpe: range(7, 8), perSide: true, restSeconds: 60 })], { harder: "rfe_split_squat", note: "Harder: rear foot on a sofa or bench, a backpack for load." }),
      slot("push_up", [sets(3, { reps: range(10, 15), rpe: range(8), restSeconds: 60 })]),
    ]),
    section("accessory", [
      slot("nordic_curl", [sets(3, { reps: range(3, 5), rpe: range(7, 8), restSeconds: 90 })], { easier: "band_nordic", note: "A partner, or feet under a sofa." }),
      slot("copenhagen_short", [sets(2, { time: range(20, 30), perSide: true, restSeconds: 45 })], { harder: "copenhagen_plank" }),
    ]),
    ...(summer ? [section("conditioning", [slot("run_intervals", [sets(6, { time: range(60), rpe: range(8), restSeconds: 60 })], { note: "Hard but even: 6 × 1 min on, 1 min off." })])] : []),
  );
}

function transitionSession(): SessionContent {
  return content(
    section("prep", [slot("mobility_flow", [sets(1, { time: range(600) })])]),
    section("speed", [slot("pogo_jump", [sets(2, { contacts: range(10), restSeconds: 45 })]), accelerations(3, 10, 10)]),
    section("main", [
      slot("goblet_squat", [sets(3, { reps: range(8), rpe: range(6), restSeconds: 60 })]),
      slot("push_up", [sets(3, { reps: range(10), rpe: range(6), restSeconds: 60 })], { paired: true }),
      slot("db_row", [sets(3, { reps: range(10), rpe: range(6), perSide: true, restSeconds: 60 })]),
    ]),
    section("accessory", [
      slot("band_nordic", [sets(2, { reps: range(4), rpe: range(6), restSeconds: 90 })], { harder: "nordic_curl" }),
      slot("copenhagen_short", [sets(2, { time: range(20), perSide: true, restSeconds: 45 })]),
    ]),
    section("conditioning", [slot("run_intervals", [sets(4, { time: range(240), rpe: range(6), restSeconds: 120 })], { note: "Easy. Any other sport counts instead." })]),
  );
}

/** The off-season week: hypertrophy (zone null) or maximal strength; week 2 of a block adds a set, week 3 unloads. */
function offSeasonLower(zone: ZoneId | null, dose: Dose): SessionContent {
  const count = mainSets(dose) + (zone ? 1 : 0);
  return content(
    warmUp(),
    section("speed", [accelerations(4, 10, 20), slot("box_jump", [sets(3, { contacts: range(4), restSeconds: 60 })], { harder: "drop_jump" })]),
    section("main", [
      zone
        ? slot("back_squat", [sets(count, { reps: range(3, 5), velocity: range(0.35, 0.5), rpe: range(8), restSeconds: 180 })], { auto: ZONE_LIFT["absolute-strength"].auto, harder: "front_squat" })
        : slot("back_squat", [sets(count, { reps: range(8, 10), rpe: range(7, 8), restSeconds: 120 })], { easier: "goblet_squat", harder: "front_squat" }),
      slot("rfe_split_squat", [sets(3, { reps: zone ? range(5) : range(8), rpe: range(8), perSide: true, restSeconds: 90 })], { easier: "bw_split_squat", harder: "ssb_split_squat" }),
      slot("romanian_deadlift", [sets(3, { reps: zone ? range(5) : range(8), rpe: range(7, 8), restSeconds: 90 })]),
    ]),
    section("accessory", [
      slot("hip_thrust", [sets(3, { reps: zone ? range(6) : range(10), rpe: range(8), restSeconds: 60 })]),
      nordics(dose === "unload" ? 2 : 3),
      copenhagen(dose === "unload" ? 2 : 3),
    ]),
  );
}

function offSeasonUpper(zone: ZoneId | null, dose: Dose): SessionContent {
  const count = mainSets(dose) + (zone ? 1 : 0);
  return content(
    warmUp(),
    section("speed", [slot("mb_overhead_throw", [sets(3, { reps: range(5), load: kg(3), restSeconds: 60 })])]),
    section("main", [
      zone
        ? slot("bench_press", [sets(count, { reps: range(3, 5), velocity: range(0.3, 0.5), rpe: range(8), restSeconds: 180 })])
        : slot("bench_press", [sets(count, { reps: range(8, 10), rpe: range(7, 8), restSeconds: 120 })], { easier: "db_bench_press" }),
      slot("pull_up", [sets(count, { reps: zone ? range(4, 6) : range(6, 8), rpe: range(8), restSeconds: 90 })], { paired: true, easier: "band_pull_up" }),
      slot("landmine_press", [sets(3, { reps: range(8), rpe: range(7, 8), perSide: true, restSeconds: 60 })]),
      slot("db_row", [sets(3, { reps: range(10), rpe: range(8), perSide: true, restSeconds: 60 })], { paired: true }),
    ]),
    section("accessory", [slot("push_up", [sets(2, { reps: range(12, 20), rpe: range(8), restSeconds: 60 })])]),
  );
}

function offSeasonPower(zone: ZoneId | null, dose: Dose): SessionContent {
  return content(
    warmUp(),
    section("speed", [
      slot("flying_10", [sets(dose === "unload" ? 3 : 4, { distance: range(10), restSeconds: 180 })], { note: "20 m run-up; maximal velocity. Full rest." }),
      slot("hurdle_hop", [sets(3, { contacts: range(5), restSeconds: 60 })], { easier: "pogo_jump" }),
      slot("lateral_bound", [sets(3, { contacts: range(4), perSide: true, restSeconds: 60 })]),
    ]),
    section("main", [
      slot("hang_power_clean", [sets(mainSets(dose) + 1, { reps: range(3), restSeconds: 150 })], { easier: "hang_high_pull", harder: "power_clean" }),
      slot("trap_bar_jump", [sets(3, { reps: range(3), restSeconds: 120 })], { note: "Maximum height every rep." }),
      slot("step_up", [sets(3, { reps: zone ? range(5) : range(8), rpe: range(7, 8), perSide: true, restSeconds: 60 })]),
    ]),
    section("conditioning", [slot("bike_intervals", [sets(zone ? 6 : 8, { time: range(30), rpe: range(8), restSeconds: 30 })])]),
  );
}

function runningStrength(): SessionContent {
  return content(
    warmUp(),
    section("speed", [slot("acceleration_10", [sets(4, { distance: range(20), restSeconds: 120 })], { note: "Build-ups: 80 %, 85 %, 90 %, 90 %+." })]),
    section("main", [
      slot("back_squat", [sets(3, { reps: range(5), rpe: range(6, 7), restSeconds: 120 })], { easier: "goblet_squat" }),
      slot("pull_up", [sets(3, { reps: range(6), rpe: range(7), restSeconds: 90 })], { paired: true, easier: "band_pull_up" }),
    ]),
    section("accessory", [nordics(2), copenhagen(2)]),
    section("conditioning", [slot("run_intervals", [sets(6, { time: range(180), rpe: range(7), restSeconds: 90 })])]),
  );
}

function runningSpeed(): SessionContent {
  return content(
    section("prep", [slot("activation", [sets(1, { time: range(300) })])]),
    section("speed", [
      accelerations(4, 20, 20),
      slot("flying_10", [sets(3, { distance: range(10), restSeconds: 180 })], { note: "Build to ≥ 90 % by the last rep." }),
      slot("pogo_jump", [sets(2, { contacts: range(15), restSeconds: 45 })]),
    ]),
    section("conditioning", [slot("shuttle_runs", [sets(8, { time: range(30), rpe: range(8), restSeconds: 30 })], { note: "Handball-like: short, hard, low turns." })]),
  );
}

// ---------------------------------------------------------------------------
// Scheduling: which session goes on which day

const SESSION_TITLES: Record<SessionKind, string> = {
  lower: "Lower strength + speed",
  upper: "Upper body + power",
  "single-leg": "Single-leg strength + speed",
  primer: "Match primer",
  minimum: "Minimum dose",
  home: "Home programme",
  transition: "Transition session",
  "off-lower": "Off-season: lower",
  "off-upper": "Off-season: upper",
  "off-power": "Off-season: power + speed",
  "run-strength": "Running + strength",
  "run-speed": "Sprint build-ups + intervals",
};

interface Planned {
  day: number;
  kind: SessionKind;
  dose: Dose;
}

const blockOn = (date: string) => blocks.find((candidate) => dayNumber(date) >= dayNumber(candidate.startsOn) && dayNumber(date) < dayNumber(candidate.startsOn) + candidate.weeks * 7) ?? null;

function sessionContent(kind: SessionKind, dose: Dose, date: string): SessionContent {
  const current = blockOn(date);
  const zone: ZoneId = current?.emphasis ?? "accelerative-strength";
  switch (kind) {
    case "lower": return lowerDay(zone, dose);
    case "upper": return upperDay(zone, dose);
    case "single-leg": return singleLegDay(dose);
    case "primer": return primer();
    case "minimum": return minimumDose();
    case "home": return homeProgramme(dayNumber(date) >= dayNumber("2027-07-01"));
    case "transition": return transitionSession();
    case "off-lower": return offSeasonLower(current?.emphasis ?? null, dose);
    case "off-upper": return offSeasonUpper(current?.emphasis ?? null, dose);
    case "off-power": return offSeasonPower(current?.emphasis ?? null, dose);
    case "run-strength": return runningStrength();
    case "run-speed": return runningSpeed();
  }
}

/** The fixture list both teams play. The data script copies the live matches; this is the same list (checked in the tests). */
export const fixtureDates: readonly string[] = handball2ndDivision202627.matches.map((match) => match.playedOn).sort();
const matchDays = fixtureDates.map(dayNumber);

/** Days since the last match and until the next, and whether the last weekend held two (travel: three days to recover). */
function context(day: number) {
  const before = matchDays.filter((match) => match < day);
  const last = before.at(-1);
  const next = matchDays.find((match) => match > day);
  const doubleWeekend = last !== undefined && before.includes(last - 1);
  return {
    since: last === undefined ? Infinity : day - last,
    until: next === undefined ? Infinity : next - day,
    recovered: last === undefined || day - last >= (doubleWeekend ? 3 : 2),
    isMatch: matchDays.includes(day),
  };
}

/** Hard strength no closer than MD-4, power no closer than MD-3, a primer at MD-2 or MD-1; never the day after a match. */
export const MIN_DAYS_TO_MATCH: Record<SessionKind, number> = {
  lower: 4, "single-leg": 4, upper: 3, minimum: 2, primer: 1,
  home: 1, transition: 1, "off-lower": 1, "off-upper": 1, "off-power": 1, "run-strength": 1, "run-speed": 1,
};

const fits = (day: number, kind: SessionKind) => {
  const at = context(day);
  return !at.isMatch && at.recovered && at.until >= MIN_DAYS_TO_MATCH[kind];
};

/**
 * A week the fixtures decide: three sessions without a match, two around one
 * match, one minimum dose around two. Weekdays only, two days apart.
 */
function autoWeek(monday: number): Planned[] {
  const weekdays = [0, 1, 2, 3, 4].map((offset) => monday + offset);
  const matchesThisWeek = matchDays.filter((match) => match >= monday && match < monday + 7);
  const planned: Planned[] = [];
  const free = (day: number, gap = 2) => planned.every((session) => Math.abs(session.day - day) >= gap);
  const place = (kind: SessionKind, dose: Dose, from = monday, gap = 2) => {
    const day = weekdays.find((candidate) => candidate >= from && free(candidate, gap) && fits(candidate, kind));
    if (day !== undefined) planned.push({ day, kind, dose });
    return day;
  };

  if (matchesThisWeek.length >= 2) {
    if (place("minimum", "unload") === undefined) place("primer", "unload");
  } else if (matchesThisWeek.length === 0) {
    const lower = place("lower", "load");
    const upper = lower === undefined ? undefined : place("upper", "load", lower + 2);
    if (upper !== undefined) place("single-leg", "load", upper + 2);
  } else {
    const lower = place("lower", "normal");
    if (lower !== undefined && place("upper", "normal", lower + 2) === undefined) place("primer", "normal", lower + 2);
    // A midweek match: nothing hard before it, so a primer at MD-2 and the strength day after.
    const match = matchesThisWeek[0];
    if (!planned.some((session) => session.day < match)) {
      const primerDay = weekdays.find((candidate) => candidate < match && match - candidate <= 2 && free(candidate) && fits(candidate, "primer"));
      if (primerDay !== undefined) planned.push({ day: primerDay, kind: "primer", dose: "normal" });
    }
  }
  return planned.sort((a, b) => a.day - b.day);
}

type Weekday = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
const WEEKDAY: Record<Weekday, number> = { mon: 0, tue: 1, wed: 2, thu: 3, fri: 4, sat: 5, sun: 6 };
const fixed = (...sessions: [Weekday, SessionKind, Dose?][]) => sessions.map(([day, kind, dose = "normal"]) => ({ offset: WEEKDAY[day], kind, dose }));

/** Weeks the phase notes decide rather than the fixtures. Keyed by Monday. */
const FIXED_WEEKS: Record<string, ReturnType<typeof fixed>> = {
  // Preseason: test day on Tuesday of week 1; week 3 is the taper.
  "2026-08-03": fixed(["wed", "lower", "normal"], ["fri", "upper", "normal"]),
  "2026-08-10": fixed(["mon", "lower", "load"], ["wed", "upper", "load"], ["fri", "single-leg", "load"]),
  "2026-08-17": fixed(["mon", "lower", "unload"], ["thu", "primer"]),
  // The Pause: week 2 unloads into Ros on 17 Oct; retest on Tuesday.
  "2026-10-05": fixed(["mon", "lower", "unload"], ["thu", "upper", "unload"]),
  // Christmas: home, twice a week.
  "2026-12-21": fixed(["tue", "home"], ["sat", "home"]),
  "2026-12-28": fixed(["tue", "home"], ["sat", "home"]),
  // Back before the restart: retest Monday, then load back up.
  "2027-01-04": fixed(["tue", "lower", "unload"], ["thu", "upper", "normal"]),
  // Easter: a light week.
  "2027-03-22": fixed(["mon", "lower", "unload"], ["wed", "primer"]),
  // Taper into qualification, if the team wins the group.
  "2027-04-12": fixed(["tue", "lower", "unload"], ["fri", "primer"]),
  "2027-04-19": fixed(["mon", "minimum", "unload"], ["thu", "primer"]),
  "2027-04-26": fixed(["mon", "minimum", "unload"], ["thu", "primer"]),
};

function plannedWeek(monday: string): Planned[] {
  const day = dayNumber(monday);
  const override = FIXED_WEEKS[monday];
  if (override) return override.map((session) => ({ day: day + session.offset, kind: session.kind, dose: session.dose }));
  const current = blockOn(monday);
  if (!current) return [];
  const weekInBlock = (day - dayNumber(current.startsOn)) / 7;
  // Summated microcycle in 3-week blocks: normal, load, unload.
  const cycle: Dose = (["normal", "load", "unload"] as const)[weekInBlock % 3];
  switch (current.title) {
    case "Transition: minimum dose":
      return [{ day: day + 1, kind: "transition", dose: "unload" }, { day: day + 4, kind: "transition", dose: "unload" }];
    case "Summer programme":
      return [{ day: day + 1, kind: "home", dose: "normal" }, { day: day + 4, kind: "home", dose: "normal" }];
    case "Return to running":
      return [{ day, kind: "run-strength", dose: "normal" }, { day: day + 2, kind: "run-speed", dose: "normal" }, { day: day + 4, kind: "run-strength", dose: "normal" }];
    case "Off-season I: hypertrophy and capacity":
    case "Off-season II: maximal strength":
      return [{ day, kind: "off-lower", dose: cycle }, { day: day + 2, kind: "off-upper", dose: cycle }, { day: day + 4, kind: "off-power", dose: cycle }];
    default:
      return autoWeek(day);
  }
}

function buildSessions(): SeedSession[] {
  return Array.from({ length: SEASON_WEEKS }, (_, index) => addDays(SEASON_START, index * 7)).flatMap((monday) => {
    const taper = blockOn(monday)?.title.includes("if group winner") ?? false;
    return plannedWeek(monday).map((planned): SeedSession => {
      const scheduledOn = dateOf(planned.day);
      return {
        id: entityId(),
        kind: planned.kind,
        scheduledOn,
        title: taper ? `${SESSION_TITLES[planned.kind]} (if group winner)` : SESSION_TITLES[planned.kind],
        status: !taper && dayNumber(scheduledOn) <= dayNumber(PUBLISHED_UNTIL) ? "published" : "draft",
        content: sessionContent(planned.kind, planned.dose, scheduledOn),
      };
    });
  });
}

export const seniorTestDiv2202627: TeamSeed = {
  teamId,
  teamName: "Senior Test Div 2",
  population: "adult",
  batteryKey: BATTERY_KEY,
  source: { teamName: "Test Team", seasonTitle: "Season 2026/27" },
  season: { id: seasonId, title: "Season 2026/27", startsOn: SEASON_START, weeks: SEASON_WEEKS },
  athletes,
  measurements,
  testDays,
  blocks,
  sessions: buildSessions(),
};
