import { BUILTIN_EXERCISES } from "./exercise-library";
import { BUILTIN_BATTERIES, TESTS, type TestKey } from "./power-profile";
import type { Period, Season, WeekNote } from "./season";
import { sectionPresets, type ExerciseSlot, type SectionKind, type SessionContent, type SetGroup, type SlotVariant } from "./training";
import { EMPTY_VALUES as EMPTY_OVR_VALUES, rowChecksum, type OvrRow } from "./ovr-import";
import type { Athlete, HandballPosition, Match, Measurement, Profile, Sex, Team, TestDay, TestResult, TrainingSession } from "./types";

/**
 * Preview data for when Supabase is not configured. Results are generated from
 * a per-athlete ability inside invented, plausible ranges rather than typed
 * out. Nothing here is real, and nothing is persisted.
 */

export const demoUser: Profile = { id: "user-demo", email: "coach@club.example", fullName: "Demo Coach", initials: "DC", color: "#67467e", isGlobalAdmin: true };

export const demoTeams: Team[] = [
  {
    id: "team-j15", name: "Girls U15 · 2011", shortName: "Girls U15", population: "youth", batteryId: "builtin:youth-8", logoUrl: null, role: "admin",
    members: [{ ...demoUser, teamRole: "admin" }, { id: "user-lise", email: "lise@club.example", fullName: "Lise Hansen", initials: "LH", color: "#e9ddf7", teamRole: "coach" }],
  },
  {
    id: "team-senior", name: "Men's senior", shortName: "Men's senior", population: "adult", batteryId: "builtin:spenst-7", logoUrl: null, role: "admin",
    members: [{ ...demoUser, teamRole: "coach" }, { id: "user-tor", email: "tor@club.example", fullName: "Tor Aas", initials: "TA", color: "#e9ddf7", teamRole: "admin" }],
  },
];

type Seed = { id: string; name: string; born: string; sex: Sex; position: HandballPosition | null; team: string; ability: number; asymmetry: number; consent: boolean; heightCm?: number; sittingCm?: number; massKg?: number };

const seeds: Seed[] = [
  { id: "a-ida", name: "Ida K.", born: "2011-02", sex: "F", position: "back", team: "team-j15", ability: 0.82, asymmetry: 0.02, consent: true, heightCm: 168, sittingCm: 88, massKg: 58 },
  { id: "a-nora", name: "Nora B.", born: "2011-05", sex: "F", position: "wing", team: "team-j15", ability: 0.64, asymmetry: 0.05, consent: true, heightCm: 163, sittingCm: 86, massKg: 54 },
  { id: "a-emma", name: "Emma S.", born: "2011-01", sex: "F", position: "pivot", team: "team-j15", ability: 0.48, asymmetry: 0.12, consent: true, heightCm: 172, sittingCm: 90, massKg: 63 },
  { id: "a-sofie", name: "Sofie L.", born: "2011-09", sex: "F", position: "centre", team: "team-j15", ability: 0.7, asymmetry: 0.01, consent: true, heightCm: 160, sittingCm: 84, massKg: 51 },
  { id: "a-thea", name: "Thea H.", born: "2011-07", sex: "F", position: "keeper", team: "team-j15", ability: 0.3, asymmetry: 0.04, consent: true, heightCm: 165, sittingCm: 86, massKg: 57 },
  { id: "a-maja", name: "Maja R.", born: "2011-11", sex: "F", position: "wing", team: "team-j15", ability: 0.55, asymmetry: 0.02, consent: true, heightCm: 158, sittingCm: 83, massKg: 49 },
  { id: "a-ingrid", name: "Ingrid A.", born: "2011-03", sex: "F", position: "back", team: "team-j15", ability: 0.42, asymmetry: 0.03, consent: false },
  { id: "a-selma", name: "Selma J.", born: "2011-06", sex: "F", position: null, team: "team-j15", ability: 0.15, asymmetry: 0.06, consent: false },
  { id: "a-martin", name: "Martin E.", born: "1998-04", sex: "M", position: "back", team: "team-senior", ability: 0.88, asymmetry: 0.02, consent: true, heightCm: 192, sittingCm: 98, massKg: 96 },
  { id: "a-sander", name: "Sander V.", born: "2001-08", sex: "M", position: "wing", team: "team-senior", ability: 0.74, asymmetry: 0.04, consent: true, heightCm: 181, sittingCm: 93, massKg: 80 },
  { id: "a-elias", name: "Elias N.", born: "1996-12", sex: "M", position: "pivot", team: "team-senior", ability: 0.6, asymmetry: 0.11, consent: true, heightCm: 194, sittingCm: 100, massKg: 104 },
  { id: "a-henrik", name: "Henrik T.", born: "2000-02", sex: "M", position: "centre", team: "team-senior", ability: 0.52, asymmetry: 0.01, consent: true, heightCm: 184, sittingCm: 95, massKg: 86 },
  { id: "a-kristian", name: "Kristian D.", born: "1994-06", sex: "M", position: "keeper", team: "team-senior", ability: 0.35, asymmetry: 0.03, consent: true, heightCm: 190, sittingCm: 97, massKg: 95 },
  { id: "a-ole", name: "Ole M.", born: "2003-10", sex: "M", position: "back", team: "team-senior", ability: 0.68, asymmetry: 0.06, consent: true, heightCm: 188, sittingCm: 96, massKg: 91 },
  { id: "a-andreas", name: "Andreas F.", born: "1999-01", sex: "M", position: "wing", team: "team-senior", ability: 0.2, asymmetry: 0.02, consent: true, heightCm: 179, sittingCm: 92, massKg: 78 },
  // Turns 17 this year and trains with the seniors: profiled on the youth
  // battery by age class, though he ran the senior one with his team.
  { id: "a-jonas", name: "Jonas H.", born: "2009-03", sex: "M", position: "wing", team: "team-senior", ability: 0.6, asymmetry: 0.03, consent: true, heightCm: 180, sittingCm: 91, massKg: 72 },
];

export const demoAthletes: Athlete[] = seeds.map((seed) => ({
  id: seed.id, displayName: seed.name, birthMonth: seed.born, sex: seed.sex, position: seed.position, teamIds: [seed.team], measurementConsent: seed.consent,
}));

export const demoMeasurements: Measurement[] = seeds.flatMap((seed) => seed.consent && seed.heightCm && seed.massKg
  ? [{ id: `m-${seed.id}`, athleteId: seed.id, measuredOn: "2026-09-01", heightCm: seed.heightCm, sittingHeightCm: seed.sittingCm ?? null, bodyMassKg: seed.massKg }]
  : []);

export const demoTestDays: TestDay[] = [
  { id: "day-j15-sep", teamId: "team-j15", heldOn: "2026-09-14", title: "Autumn test", notes: "Indoors, same shoes and warm-up for everyone. Best of three attempts." },
  { id: "day-j15-oct", teamId: "team-j15", heldOn: "2026-10-05", title: "Sprints and jumps", notes: "" },
  { id: "day-sen-jun", teamId: "team-senior", heldOn: "2026-06-10", title: "Pre-season", notes: "Before the summer block." },
  { id: "day-sen-aug", teamId: "team-senior", heldOn: "2026-08-20", title: "Season start", notes: "Full profile. Loads entered in OVR for every exercise." },
  { id: "day-sen-oct", teamId: "team-senior", heldOn: "2026-10-01", title: "Mid-season", notes: "Sprints and squat jumps only — match week." },
];

/** A stable pseudo-random wobble in [-1, 1], so the demo looks the same on every load. */
function wobble(seed: number) {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}

/**
 * Invented ranges the demo spreads its athletes over, weakest to strongest —
 * only to make plausible numbers, never to judge anyone. Per kilo where a
 * youth range would otherwise just follow body size; the device reports watts.
 */
const DEMO_RANGES: Record<string, { perKg?: boolean; ranges: Partial<Record<TestKey, [number, number]>> }[]> = {
  girls: [
    { ranges: { sprint_5m: [1.35, 1.1], sprint_10m: [2.2, 1.85], cod_505: [3.1, 2.55], cmj: [22, 38], broad_jump: [150, 215], med_ball_throw: [3.5, 6.5] } },
    { perKg: true, ranges: { squat_jump: [25, 45], split_squat_jump: [18, 34] } },
  ],
  men: [{ ranges: { sprint_5m: [1.15, 0.95], sprint_10m: [1.95, 1.65], cod_505: [2.65, 2.25], cmj: [32, 52], broad_jump: [215, 300], power_clean: [1800, 3600], speed_squat: [1300, 2600], trap_bar_jump: [2200, 4200], squat_jump: [3000, 5200], split_squat_jump: [1800, 3400], hang_clean: [1600, 3200], push_press: [900, 1900], bench_throw: [500, 1100] } }],
};

function valueFor(seed: Seed, key: TestKey, groupId: string, salt: number, shift = 0): number | null {
  const set = DEMO_RANGES[groupId]?.find((candidate) => candidate.ranges[key]);
  const range = set?.ranges[key];
  if (!set || !range) return null;
  const ability = Math.min(0.98, Math.max(0.02, seed.ability + shift + 0.08 * wobble(salt)));
  const onBasis = range[0] + (range[1] - range[0]) * ability;
  const raw = set.perKg ? onBasis * (seed.massKg ?? 55) : onBasis;
  const digits = TESTS[key].unit === "s" ? 100 : TESTS[key].unit === "m" ? 10 : 1;
  return Math.round(raw * digits) / digits;
}

function resultsFor(dayId: string, tests: readonly TestKey[], teamId: string, groupFor: (seed: Seed) => string, salt: number, shift = 0): TestResult[] {
  return seeds.filter((seed) => seed.team === teamId).flatMap((seed, athleteIndex) => tests.flatMap((key, testIndex): TestResult[] => {
    const base = valueFor(seed, key, groupFor(seed), salt + athleteIndex * 31 + testIndex * 7, shift);
    if (base === null) return [];
    const id = `${dayId}-${seed.id}-${key}`;
    if (!TESTS[key].sided) return [{ id, testDayId: dayId, athleteId: seed.id, testKey: key, side: null, value: base }];
    // Spread the legs around the mean so the right one trails by `asymmetry`
    // for odd athletes and the left for even ones.
    const strong = Math.round(base * (1 + seed.asymmetry / 2));
    const weak = Math.round(base * (1 - seed.asymmetry / 2));
    const [left, right] = athleteIndex % 2 ? [strong, weak] : [weak, strong];
    return [
      { id: `${id}-left`, testDayId: dayId, athleteId: seed.id, testKey: key, side: "left", value: left },
      { id: `${id}-right`, testDayId: dayId, athleteId: seed.id, testKey: key, side: "right", value: right },
    ];
  }));
}

// Values come from the ranges of the squad that tested them.
const groupOf = (seed: Seed) => seed.sex === "F" ? "girls" : "men";

const battery = (id: string) => BUILTIN_BATTERIES.find((entry) => entry.id === id)?.tests ?? [];

// The girls test on Youth 8. The seniors are on Spenst 7, but their August day
// ran the longer Senior 10 as well, so either battery has numbers to show.
export const demoResults: TestResult[] = [
  ...resultsFor("day-j15-sep", battery("builtin:youth-8"), "team-j15", groupOf, 1),
  ...resultsFor("day-j15-oct", ["sprint_5m", "sprint_10m", "cmj"], "team-j15", groupOf, 2),
  // Before the summer: a little behind where they are in August.
  ...resultsFor("day-sen-jun", battery("builtin:spenst-7"), "team-senior", groupOf, 5, -0.1),
  ...resultsFor("day-sen-aug", [...new Set([...battery("builtin:spenst-7"), ...battery("builtin:senior-10")])], "team-senior", groupOf, 3),
  ...resultsFor("day-sen-oct", ["sprint_5m", "sprint_10m", "cmj", "squat_jump"], "team-senior", groupOf, 4),
];

// ---------------------------------------------------------------------------
// The year plan and its sessions. Ids are fixed so the demo looks the same on
// every load.

export const demoSeasons: Season[] = [
  { id: "season-senior-2627", teamId: "team-senior", title: "Season 2026/27", startsOn: "2026-08-03", weeks: 48, throughline: "Speed-strength in every phase — at least one session a week above 0.9 m/s." },
  { id: "season-j15-2627", teamId: "team-j15", title: "Season 2026/27", startsOn: "2026-08-10", weeks: 46, throughline: "Single-leg strength and landings every week." },
];

const phase = (id: string, seasonId: string, title: string, kind: Period["kind"], startsOn: string, weeks: number, focus: string, notes = ""): Period =>
  ({ id, seasonId, level: "phase", kind, title, startsOn, weeks, emphasis: null, focus, notes });
const block = (id: string, seasonId: string, title: string, emphasis: Period["emphasis"], startsOn: string, weeks: number, focus = "", notes = ""): Period =>
  ({ id, seasonId, level: "block", kind: "training", title, startsOn, weeks, emphasis, focus, notes });

const S = "season-senior-2627";
const J = "season-j15-2627";

export const demoPeriods: Period[] = [
  phase("ph-s-prep", S, "Pre-season", "training", "2026-08-03", 6, "Build capacity and strength before the league",
    "Acceleration and change-of-direction technique\nWork capacity\nInjury prevention every session\nGoals and accountability in the group"),
  phase("ph-s-autumn", S, "League, autumn", "competition", "2026-09-14", 13, "Keep the strength, sharpen speed for matches",
    "Two strength sessions in normal weeks, one in match weeks\nRecovery and mobility\nInjury prevention"),
  phase("ph-s-xmas", S, "Christmas break", "break", "2026-12-14", 3, "Off — active rest"),
  phase("ph-s-spring", S, "League, spring", "competition", "2027-01-04", 13, "Same rhythm as the autumn",
    "Absolute strength early in the phase\nSpeed and power towards the play-offs"),
  phase("ph-s-playoff", S, "Play-offs", "competition", "2027-04-05", 4, "Fresh legs", "Low volume, high intensity"),
  phase("ph-s-off", S, "Off-season", "break", "2027-05-03", 9, "Recover, then rebuild", "Individual training to plan\nTesting in June"),
  block("bl-s-acc", S, "Accelerative strength", "accelerative-strength", "2026-08-03", 3),
  block("bl-s-max", S, "Absolute strength", "absolute-strength", "2026-08-24", 3, "Heavy lifting before the league"),
  block("bl-s-acc2", S, "Accelerative strength", "accelerative-strength", "2026-09-14", 3),
  block("bl-s-speed", S, "Speed-strength", "speed-strength", "2026-10-05", 4, "Bar speed", "Speed squat 0.90–1.05 m/s\nThree greens to move up"),
  block("bl-s-ss", S, "Strength-speed, light", "strength-speed", "2026-11-02", 6, "Hold the level through the match weeks"),
  block("bl-s-max2", S, "Absolute strength", "absolute-strength", "2027-01-04", 4),
  block("bl-s-ss2", S, "Strength-speed", "strength-speed", "2027-02-01", 5),
  block("bl-s-speed2", S, "Speed-strength", "speed-strength", "2027-03-08", 4),
  phase("ph-j-base", J, "Foundation", "training", "2026-08-10", 15, "Technique and single-leg strength", "Squat and hinge patterns\nLandings and turns\nLoad set by RPE"),
  phase("ph-j-xmas", J, "Christmas break", "break", "2026-12-21", 2, "Off"),
  phase("ph-j-build", J, "Build", "training", "2027-01-04", 16, "More load where the technique holds"),
  block("bl-j-base", J, "Foundation 1", null, "2026-10-12", 6, "One new lift at a time"),
];

export const demoWeekNotes: WeekNote[] = [
  { seasonId: S, weekStart: "2026-09-14", label: "League starts" },
  { seasonId: S, weekStart: "2026-10-19", label: "Match week ×2" },
  { seasonId: S, weekStart: "2026-11-30", label: "Deload" },
  { seasonId: J, weekStart: "2026-10-05", label: "Autumn break" },
];

/** The senior league: Saturdays at 16:00, and a Wednesday match in the “Match week ×2”. */
const fixture = (playedOn: string, opponent: string, home: boolean, extra: Partial<Match> = {}): Match =>
  ({ id: `match-${playedOn}`, teamId: "team-senior", playedOn, kickOff: "16:00", opponent, home, kind: "league", priority: false, note: "", ...extra });

export const demoMatches: Match[] = [
  fixture("2026-09-19", "Fjellby", true),
  fixture("2026-09-26", "Nordvik", false),
  fixture("2026-10-03", "Elvdal", true),
  fixture("2026-10-10", "Sjøholm", false),
  fixture("2026-10-17", "Bergli", true),
  fixture("2026-10-21", "Vestby", false, { kickOff: "19:30", kind: "cup", note: "Cup, round 3" }),
  fixture("2026-10-24", "Fjellby", false),
  fixture("2026-10-31", "Nordvik", true),
  fixture("2026-11-07", "Elvdal", false),
  fixture("2026-11-14", "Sjøholm", true),
  fixture("2026-11-21", "Bergli", false, { priority: true, note: "Top of the table" }),
  fixture("2026-11-28", "Vestby", true),
  fixture("2026-12-05", "Strandvik", false),
];

let demoId = 0;
const nextId = (prefix: string) => `${prefix}-${(demoId += 1)}`;
const range = (min: number, max = min) => ({ min, max });

function builtin(key: string) {
  const exerciseId = `builtin:${key}`;
  if (!BUILTIN_EXERCISES.some((exercise) => exercise.id === exerciseId)) throw new Error(`Demo uses unknown exercise ${key}`);
  return exerciseId;
}

function slot(key: string, groups: Omit<SetGroup, "id">[], extra: Partial<Pick<ExerciseSlot, "pairedWithPrevious" | "autoregulation" | "note">> & { easier?: string; harder?: string } = {}): ExerciseSlot {
  const { easier, harder, ...rest } = extra;
  const variants: SlotVariant[] = [
    ...(easier ? [{ id: nextId("variant"), level: -1 as const, exerciseId: builtin(easier), setGroups: [], note: "" }] : []),
    ...(harder ? [{ id: nextId("variant"), level: 1 as const, exerciseId: builtin(harder), setGroups: [], note: "" }] : []),
  ];
  return { id: nextId("slot"), exerciseId: builtin(key), pairedWithPrevious: false, autoregulation: null, note: "", variants, setGroups: groups.map((group) => ({ ...group, id: nextId("group") })), ...rest };
}

function content(...sections: [SectionKind, ExerciseSlot[]][]): SessionContent {
  return { sections: sections.map(([kind, slots]) => ({ id: nextId("section"), kind, title: kind === "custom" ? "Section" : sectionPresets[kind], slots })) };
}

export const demoSessions: TrainingSession[] = [
  {
    id: "session-senior-strength-a", teamId: "team-senior", scheduledOn: "2026-10-06", slot: null, title: "Strength A", status: "published",
    content: content(
      ["prep", [slot("skadefri_warmup", [{ count: 1, time: range(600) }])]],
      ["speed", [
        slot("box_jump", [{ count: 3, contacts: range(5), height: range(50), restSeconds: 60 }], { harder: "drop_jump" }),
        slot("trap_bar_jump", [{ count: 4, reps: range(3), load: { ...range(40), basis: "kg" }, restSeconds: 120 }]),
      ]],
      ["main", [
        slot("back_squat", [{ count: 6, reps: range(3), load: { ...range(100), basis: "kg" }, velocity: range(0.9, 1.05), restSeconds: 150 }], {
          autoregulation: { target: 0.9, bumpAbove: 1.05, bumpKg: 10 },
          note: "Speed squat: hamstrings to parallel, up as fast as you can.",
        }),
        slot("ssb_split_squat", [{ count: 3, reps: range(6), rpe: range(8), perSide: true, restSeconds: 90 }], { easier: "rfe_split_squat" }),
        slot("pull_up", [{ count: 3, reps: range(6, 8), rpe: range(8), restSeconds: 90 }], { pairedWithPrevious: true, easier: "band_pull_up" }),
      ]],
      ["accessory", [
        slot("nordic_curl", [{ count: 3, reps: range(5), restSeconds: 90 }], { easier: "band_nordic" }),
        slot("copenhagen_plank", [{ count: 3, time: range(20), perSide: true, restSeconds: 45 }], { pairedWithPrevious: true, easier: "copenhagen_short" }),
      ]],
    ),
  },
  {
    id: "session-senior-speed", teamId: "team-senior", scheduledOn: "2026-10-08", slot: null, title: "Speed and power", status: "published",
    content: content(
      ["prep", [slot("activation", [{ count: 1, time: range(300) }])]],
      ["speed", [
        slot("acceleration_10", [{ count: 6, distance: range(10), restSeconds: 120 }], { note: "OVR Sprint gates at 0 and 10 m." }),
        slot("drop_jump", [{ count: 3, contacts: range(5), height: range(30), restSeconds: 90 }], { easier: "box_jump" }),
        slot("mb_rotational_throw", [{ count: 3, reps: range(6), load: { ...range(3), basis: "kg" }, perSide: true, restSeconds: 60 }]),
      ]],
      ["main", [
        slot("hang_power_clean", [{ count: 5, reps: range(2), load: { ...range(60), basis: "kg" }, restSeconds: 150 }], { easier: "hang_high_pull", harder: "power_clean" }),
        slot("push_press", [{ count: 4, reps: range(3), load: { ...range(60), basis: "kg" }, velocity: range(0.9, 1.3), restSeconds: 120 }]),
      ]],
    ),
  },
  {
    id: "session-senior-strength-a2", teamId: "team-senior", scheduledOn: "2026-10-13", slot: null, title: "Strength A", status: "published",
    content: content(
      ["main", [
        slot("back_squat", [{ count: 5, reps: range(3), load: { ...range(105), basis: "kg" }, velocity: range(0.9, 1.05), restSeconds: 150 }]),
        slot("trap_bar_deadlift", [{ count: 4, reps: range(3), load: { ...range(120), basis: "kg" }, velocity: range(0.75, 0.9), restSeconds: 150 }]),
        slot("ssb_split_squat", [{ count: 3, reps: range(6), rpe: range(8), perSide: true, restSeconds: 90 }], { easier: "rfe_split_squat" }),
      ]],
    ),
  },
  {
    id: "session-senior-strength-b", teamId: "team-senior", scheduledOn: "2026-10-15", slot: null, title: "Speed and power", status: "draft",
    content: content(["speed", [slot("hurdle_hop", [{ count: 3, contacts: range(6), height: range(40), restSeconds: 60 }], { easier: "pogo_jump" })]]),
  },
  // The two-match week (Wednesday and Saturday): the main lift moves on, and
  // Thursday has two sessions.
  {
    id: "session-senior-strength-a3", teamId: "team-senior", scheduledOn: "2026-10-19", slot: null, title: "Strength A", status: "draft",
    content: content(
      ["main", [
        slot("back_squat", [{ count: 4, reps: range(3), load: { ...range(110), basis: "kg" }, velocity: range(0.9, 1.05), restSeconds: 150 }]),
        slot("trap_bar_deadlift", [{ count: 3, reps: range(3), load: { ...range(120), basis: "kg" }, velocity: range(0.75, 0.9), restSeconds: 150 }]),
      ]],
    ),
  },
  {
    id: "session-senior-recovery", teamId: "team-senior", scheduledOn: "2026-10-22", slot: "am", title: "Recovery", status: "draft",
    content: content(["prep", [slot("activation", [{ count: 1, time: range(900) }])]]),
  },
  {
    id: "session-senior-primer", teamId: "team-senior", scheduledOn: "2026-10-22", slot: "pm", title: "Speed primer", status: "draft",
    content: content(["speed", [
      slot("acceleration_10", [{ count: 4, distance: range(10), restSeconds: 120 }]),
      slot("pogo_jump", [{ count: 2, contacts: range(10), restSeconds: 60 }]),
    ]]),
  },
  {
    id: "session-j15-base", teamId: "team-j15", scheduledOn: "2026-10-13", slot: null, title: "Strength and jumps", status: "draft",
    content: content(
      ["prep", [slot("skadefri_warmup", [{ count: 1, time: range(900) }])]],
      ["speed", [
        slot("pogo_jump", [{ count: 2, contacts: range(10), restSeconds: 60 }], { harder: "hurdle_hop" }),
        slot("box_jump", [{ count: 3, contacts: range(4), height: range(30), restSeconds: 60 }]),
      ]],
      ["main", [
        slot("goblet_squat", [{ count: 3, reps: range(8), rpe: range(6), restSeconds: 90 }], { harder: "back_squat", note: "Light weight — technique decides." }),
        slot("bw_split_squat", [{ count: 3, reps: range(8), rpe: range(6), perSide: true, restSeconds: 60 }], { harder: "rfe_split_squat" }),
        slot("db_row", [{ count: 3, reps: range(10), perSide: true, restSeconds: 60 }], { pairedWithPrevious: true }),
      ]],
      ["accessory", [slot("copenhagen_short", [{ count: 2, time: range(15), perSide: true, restSeconds: 45 }], { harder: "copenhagen_plank" })]],
    ),
  },
];

// ---------------------------------------------------------------------------
// How each senior's back squat behaves: a load–velocity line from body mass
// and ability, so the OVR history below has believable reps in it.

const liftShapes: Record<string, { v0: number; vAtMax: number; factor: number }> = {
  "builtin:back_squat": { v0: 1.55, vAtMax: 0.3, factor: 1 },
  "builtin:trap_bar_deadlift": { v0: 1.45, vAtMax: 0.3, factor: 1.2 },
  "builtin:bench_press": { v0: 1.7, vAtMax: 0.17, factor: 0.68 },
};

const maxLoadOf = (seed: Seed, exerciseId: string, growth: number) => (seed.massKg ?? 80) * (1.25 + 0.8 * seed.ability) * liftShapes[exerciseId].factor * growth;
const septemberGrowth = (seed: Seed) => 1.03 + 0.02 * seed.ability;
const seniorSeeds = seeds.filter((seed) => seed.team === "team-senior");

// ---------------------------------------------------------------------------
// OVR history: what an export would have filled in for the senior squad.
// Weekly back squats that get faster within a block and heavier after the
// re-profile, test-day hang cleans whose best rep is the recorded result, and
// 0–5–10 m sprints whose splits are the 5 m and 10 m results.

type OvrValues = Partial<OvrRow> & Pick<OvrRow, "sheet" | "performedOn" | "exercise">;

function demoOvrRow(seed: Seed, values: OvrValues, at: [number, number]): OvrRow {
  const full = { ...EMPTY_OVR_VALUES, groups: "Men's senior", sport: "Handball", position: seed.position ?? "", note: "", extra: {}, ...values };
  return {
    ...full,
    id: `ovr-${seed.id}-${values.sheet}-${values.performedOn}-${at.join("-")}`,
    athleteId: seed.id,
    rowKey: `${values.sheet}|${values.performedOn}|${values.exercise.toLowerCase()}|${at[0]}|${at[1]}#0`,
    checksum: rowChecksum(JSON.stringify(full)),
    importId: null,
  };
}

const round = (value: number, digits: number) => Math.round(value * 10 ** digits) / 10 ** digits;
const SQUAT_DAYS = ["2026-08-10", "2026-08-17", "2026-08-24", "2026-08-31", "2026-09-07", "2026-09-21", "2026-09-28", "2026-10-05"];

function squatHistory(seed: Seed, index: number): OvrRow[] {
  const shape = liftShapes["builtin:back_squat"];
  const finalGrowth = septemberGrowth(seed) + 0.01;
  return SQUAT_DAYS.flatMap((date, day) => {
    // Strength comes a little each week; the coach puts the bar up once, mid-September.
    const growth = 1 + (finalGrowth - 1) * (day / (SQUAT_DAYS.length - 1));
    const prescribedFrom = date < "2026-09-14" ? 1 : septemberGrowth(seed);
    const loadKg = Math.floor((maxLoadOf(seed, "builtin:back_squat", prescribedFrom) * 0.7) / 2.5) * 2.5;
    const velocity = shape.v0 + ((shape.vAtMax - shape.v0) / maxLoadOf(seed, "builtin:back_squat", growth)) * loadKg;
    const romCm = 56 + 6 * wobble(index * 7 + 1);
    return [1, 2, 3].flatMap((set) => [1, 2, 3].map((rep) => {
      const salt = index * 1000 + day * 31 + set * 7 + rep;
      const meanVelocity = round(velocity + 0.025 * wobble(salt) - 0.012 * (rep - 1) - 0.01 * (set - 1), 2);
      const meanPower = Math.round(loadKg * 9.81 * meanVelocity);
      const durationS = round(romCm / 100 / meanVelocity, 2);
      return demoOvrRow(seed, {
        sheet: "velocity", performedOn: date, exercise: "Back Squat", setNumber: set, repNumber: rep, loadKg, meanVelocity,
        peakVelocity: round(meanVelocity * (1.42 + 0.04 * wobble(salt + 3)), 2), meanPower, peakPower: Math.round(meanPower * (2.2 + 0.15 * wobble(salt + 5))),
        durationS, tpvS: round(durationS * (0.55 + 0.05 * wobble(salt + 9)), 2), romCm: round(romCm + 1.5 * wobble(salt + 11), 1), eaIndex: round(14 + 4 * wobble(salt + 13), 2), targetType: "off",
      }, [set, rep]);
    }));
  });
}

/** The OVR Velocity tests as the demo squad lifts them: exercise name in OVR, load, and a typical bar speed and range. */
const VELOCITY_TESTS: { key: TestKey; exercise: string; loadKg: number; peakVelocity: [number, number]; romCm: number }[] = [
  { key: "speed_squat", exercise: "Speed Squat", loadKg: 80, peakVelocity: [1.25, 1.6], romCm: 58 },
  { key: "trap_bar_jump", exercise: "Trap Bar Jump", loadKg: 60, peakVelocity: [2.0, 2.6], romCm: 48 },
  { key: "squat_jump", exercise: "Squat Jump", loadKg: 40, peakVelocity: [2.3, 2.9], romCm: 45 },
  { key: "split_squat_jump", exercise: "Split Squat Jump", loadKg: 20, peakVelocity: [2.0, 2.5], romCm: 40 },
  { key: "hang_clean", exercise: "Hang Power Clean", loadKg: 60, peakVelocity: [1.95, 2.3], romCm: 92 },
  { key: "push_press", exercise: "Push Press", loadKg: 50, peakVelocity: [1.6, 2.1], romCm: 46 },
  { key: "bench_throw", exercise: "Bench Press", loadKg: 50, peakVelocity: [1.1, 1.5], romCm: 38 },
];
/** The best rep is the recorded result; the others a little short of it. */
const REP_SHARES = [0.93, 1, 0.96, 0.9, 0.97, 0.94];

function testDayHistory(seed: Seed, index: number, dayId: string, date: string): OvrRow[] {
  const result = (key: TestKey) => demoResults.find((entry) => entry.testDayId === dayId && entry.athleteId === seed.id && entry.testKey === key)?.value ?? null;
  const sidedResult = (key: TestKey, side: "left" | "right") => demoResults.find((entry) => entry.testDayId === dayId && entry.athleteId === seed.id && entry.testKey === key && entry.side === side)?.value ?? null;
  const rows: OvrRow[] = [];
  // Every OVR Velocity test, every column OVR writes, the best rep's peak
  // power exactly the recorded result. Two-legged tests: two sets of three.
  // The split squat jump as it is run: one exercise, two sets of eight
  // alternating reps, left foot first — reps 1, 3, 5, 7 left.
  for (const spec of VELOCITY_TESTS) {
    const sided = Boolean(TESTS[spec.key].sided);
    const reps = sided
      ? [1, 2].flatMap((set) => Array.from({ length: 8 }, (_, i) => ({ set, rep: i + 1, side: (i % 2 === 0 ? "left" : "right") as "left" | "right" })))
      : REP_SHARES.map((_, i) => ({ set: Math.floor(i / 3) + 1, rep: (i % 3) + 1, side: null }));
    reps.forEach(({ set, rep, side }, i) => {
      const value = side ? sidedResult(spec.key, side) : result(spec.key);
      if (!value) return;
      // Each leg's best rep is set 1 rep 3 or 4; the rest a little short.
      const share = sided ? (set === 1 && (rep === 3 || rep === 4) ? 1 : 0.9 + 0.08 * Math.abs(wobble(index * 31 + i))) : REP_SHARES[i];
      const salt = index * 97 + i * 11 + spec.exercise.length;
      const peakPower = Math.round(value * share);
      const peakVelocity = round((spec.peakVelocity[0] + (spec.peakVelocity[1] - spec.peakVelocity[0]) * seed.ability + 0.04 * wobble(salt)) * (0.94 + 0.06 * share), 2);
      const meanVelocity = round(peakVelocity * (0.58 + 0.03 * wobble(salt + 1)), 2);
      const romCm = round(spec.romCm + 4 * wobble(salt + 2), 1);
      const durationS = round(romCm / 100 / meanVelocity, 2);
      rows.push(demoOvrRow(seed, {
        sheet: "velocity", performedOn: date, exercise: spec.exercise, side, setNumber: set, repNumber: rep, loadKg: spec.loadKg,
        peakPower, meanPower: Math.round(peakPower * (0.44 + 0.03 * wobble(salt + 3))), peakVelocity, meanVelocity, romCm, durationS,
        tpvS: round(durationS * (0.55 + 0.05 * wobble(salt + 4)), 2), eaIndex: round(16 + 5 * wobble(salt + 5), 2), targetType: "off",
      }, [set, rep]));
    });
  }
  const cmj = result("cmj");
  if (cmj) [0.95, 1, 0.97].forEach((share, i) => {
    rows.push(demoOvrRow(seed, { sheet: "jump", performedOn: date, exercise: "Countermovement Jump", setNumber: 1, repNumber: i + 1, jumpHeightCm: round(cmj * share, 1), jumpType: "CMJ" }, [1, i + 1]));
  });
  const cod = result("cod_505");
  if (cod) [0.05, 0].forEach((slower, run) => {
    const time = round(cod + slower, 3);
    rows.push(demoOvrRow(seed, { sheet: "sprint", performedOn: date, exercise: "505", sprintNumber: run + 1, splitNumber: 1, splitTimeS: time, totalTimeS: time, inBeamStart: true, triggerStart: false }, [run + 1, 1]));
  });
  const five = result("sprint_5m");
  const ten = result("sprint_10m");
  if (five && ten) {
    // Three runs; the second is the one the results came from.
    [0.04, 0, 0.025].forEach((slower, run) => {
      const t5 = round(five + slower * 0.6, 3);
      const t10 = round(ten + slower, 3);
      const exercise = "1.09yd Lead-in + 5.47yd + 5.47yd";
      rows.push(demoOvrRow(seed, { sheet: "sprint", performedOn: date, exercise, sprintNumber: run + 1, splitNumber: 1, distanceM: 5, splitTimeS: t5, totalTimeS: t5, speedKmh: round((5 / t5) * 3.6, 2), inBeamStart: false, triggerStart: false }, [run + 1, 1]));
      rows.push(demoOvrRow(seed, { sheet: "sprint", performedOn: date, exercise, sprintNumber: run + 1, splitNumber: 2, distanceM: 5, splitTimeS: round(t10 - t5, 3), totalTimeS: t10, speedKmh: round((5 / (t10 - t5)) * 3.6, 2), inBeamStart: false, triggerStart: false }, [run + 1, 2]));
    });
  }
  return rows;
}

export const demoOvrRows: OvrRow[] = seniorSeeds.flatMap((seed, index) => [
  ...squatHistory(seed, index),
  ...testDayHistory(seed, index, "day-sen-aug", "2026-08-20"),
  ...testDayHistory(seed, index, "day-sen-oct", "2026-10-01"),
]);
