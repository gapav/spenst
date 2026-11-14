import { TESTS, type TestKey } from "./power-profile";
import { minimizeAthleteName } from "./roster";
import { detailsForResults } from "./ovr-data";
import type { AttemptDetails, Side, TestDay, TestResult, Athlete } from "./types";
import type { SheetRows } from "./xlsx";

/**
 * Reading an OVR Connect export into Spenst.
 *
 * The export is one workbook with three sheets — Velocity (a row per rep),
 * Jump (a row per jump) and Sprint (a row per split) — and it always holds the
 * athletes' *whole* history, not just the latest session. So an import is a
 * comparison: every value is worked out from the file, then checked against
 * what Spenst already has, and only what is new goes in by default. Importing
 * the same file twice changes nothing.
 *
 * Columns are found by their header, not their position, and every cell is
 * read as text (OVR writes its numbers as text).
 */

export type OvrSheetKind = "velocity" | "jump" | "sprint";

interface OvrRowBase {
  /** As typed into OVR — often a full name. Only used to match the roster; never stored in a row. */
  athlete: string;
  groups: string;
  /** `YYYY-MM-DD`. */
  date: string;
  exercise: string;
  sport: string;
  position: string;
  note: string;
  /** Every column this reader does not know by name, header → text: nothing in the file is dropped. */
  extra: Record<string, string>;
}

export interface OvrRep extends OvrRowBase {
  set: number | null;
  rep: number | null;
  loadKg: number | null;
  meanVelocity: number | null;
  peakVelocity: number | null;
  meanPower: number | null;
  peakPower: number | null;
  durationS: number | null;
  eaIndex: number | null;
  romCm: number | null;
  /** Time to peak velocity. */
  tpvS: number | null;
  targetType: string;
  targetMin: number | null;
  targetMax: number | null;
}

export interface OvrJump extends OvrRowBase {
  set: number | null;
  rep: number | null;
  heightCm: number | null;
  contactTimeS: number | null;
  rsi: number | null;
  jumpType: string;
}

export interface OvrSplit extends OvrRowBase {
  sprint: number | null;
  split: number | null;
  /** This split's own distance. */
  distanceM: number | null;
  splitTime: number | null;
  /** From the start of the run to the end of this split. */
  totalTime: number | null;
  speedKmh: number | null;
  inBeamStart: boolean | null;
  triggerStart: boolean | null;
}

export interface OvrExport {
  velocity: OvrRep[];
  jump: OvrJump[];
  sprint: OvrSplit[];
  /** Rows without an athlete, a readable date or an exercise. */
  skippedRows: number;
}

export class OvrFormatError extends Error {}

// ---------------------------------------------------------------------------
// Cells

/** "Avg Velocity (m/s)" → "avg velocity"; "Group(s)" → "group". */
const headerKey = (header: string) => header.toLowerCase().replace(/\(.*?\)/g, " ").replace(/[^a-z0-9#]+/g, " ").trim();

export function cellNumber(text: string | undefined): number | null {
  const trimmed = (text ?? "").replace(/\s/g, "");
  if (!trimmed) return null;
  const value = Number(trimmed.includes(",") && !trimmed.includes(".") ? trimmed.replace(",", ".") : trimmed);
  return Number.isFinite(value) ? value : null;
}

/** "Yes"/"No" as OVR writes them, and the usual spellings of true and false. */
export function cellBoolean(text: string | undefined): boolean | null {
  const value = (text ?? "").trim().toLowerCase();
  if (["yes", "true", "1", "ja", "y"].includes(value)) return true;
  if (["no", "false", "0", "nei", "n"].includes(value)) return false;
  return null;
}

/** ISO dates as OVR writes them; Excel serial dates and day-first dots just in case. */
export function cellDate(text: string | undefined): string | null {
  const trimmed = (text ?? "").trim();
  let year: number, month: number, day: number;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
  const dotted = /^(\d{1,2})\.(\d{1,2})\.(\d{4})/.exec(trimmed);
  if (iso) [year, month, day] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else if (dotted) [year, month, day] = [Number(dotted[3]), Number(dotted[2]), Number(dotted[1])];
  else if (/^\d{5}(\.\d+)?$/.test(trimmed)) {
    const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(trimmed)) * 86_400_000);
    [year, month, day] = [date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()];
  } else return null;
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Sheets

const COMMON = { athlete: ["athlete", "athlete name", "name"], groups: ["group", "groups"], date: ["date"], exercise: ["exercise"], sport: ["sport"], position: ["position"], note: ["set note", "note", "notes"] };
const COLUMNS = {
  velocity: { ...COMMON, set: ["set #", "set"], rep: ["rep #", "rep"], load: ["load"], meanVelocity: ["avg velocity", "mean velocity", "average velocity"], peakVelocity: ["peak velocity"], meanPower: ["avg power", "mean power", "average power"], peakPower: ["peak power"], duration: ["duration"], eaIndex: ["ea index"], rom: ["rom", "range of motion"], tpv: ["tpv", "time to peak velocity"], targetType: ["target type"], targetMin: ["target min"], targetMax: ["target max"] },
  jump: { ...COMMON, set: ["set #", "set"], rep: ["rep #", "rep"], height: ["jump height", "height"], contactTime: ["gct", "ground contact time", "contact time"], rsi: ["rsi"], jumpType: ["jump type"] },
  sprint: { ...COMMON, sprint: ["sprint #", "sprint"], split: ["split #", "split"], distance: ["distance"], splitTime: ["split time"], totalTime: ["total time"], speed: ["speed"], inBeam: ["in beam start"], trigger: ["trigger start"] },
} as const;

function sheetKind(sheet: SheetRows): OvrSheetKind | null {
  const headers = new Set((sheet.rows[0] ?? []).map(headerKey));
  if (headers.has("split time") || headers.has("total time")) return "sprint";
  if (headers.has("jump height")) return "jump";
  if (headers.has("avg velocity") || headers.has("peak velocity") || headers.has("mean velocity")) return "velocity";
  const name = sheet.name.trim().toLowerCase();
  return name === "velocity" || name === "jump" || name === "sprint" ? name : null;
}

function columnsOf<K extends OvrSheetKind>(kind: K, sheet: SheetRows) {
  const headers = (sheet.rows[0] ?? []).map(headerKey);
  const spec = COLUMNS[kind] as Record<string, readonly string[]>;
  const found = Object.fromEntries(Object.entries(spec).map(([field, names]) => [field, headers.findIndex((header) => names.includes(header))])) as Record<keyof (typeof COLUMNS)[K], number>;
  for (const field of ["athlete", "date", "exercise"] as const) {
    if ((found as Record<string, number>)[field] < 0) throw new OvrFormatError(`The ${sheet.name || kind} sheet has no ${field[0].toUpperCase()}${field.slice(1)} column — is this an OVR export?`);
  }
  return found;
}

export function parseOvrExport(sheets: readonly SheetRows[]): OvrExport {
  const result: OvrExport = { velocity: [], jump: [], sprint: [], skippedRows: 0 };
  let recognised = 0;
  for (const sheet of sheets) {
    const kind = sheetKind(sheet);
    if (!kind || !sheet.rows.length) continue;
    recognised += 1;
    const columns = columnsOf(kind, sheet) as Record<string, number>;
    const headers = sheet.rows[0] ?? [];
    const known = new Set(Object.values(columns).filter((index) => index >= 0));
    const unknown = headers.map((header, index) => ({ header: header.trim(), index })).filter(({ header, index }) => header && !known.has(index));
    const at = (row: string[], field: string) => columns[field] >= 0 ? row[columns[field]] ?? "" : "";
    const number = (row: string[], field: string) => cellNumber(at(row, field));
    const text = (row: string[], field: string) => at(row, field).trim();
    for (const row of sheet.rows.slice(1)) {
      if (!row.some((cell) => cell.trim())) continue;
      const base = { athlete: at(row, "athlete").trim().replace(/\s+/g, " "), groups: text(row, "groups"), date: cellDate(at(row, "date")), exercise: text(row, "exercise") };
      if (!base.athlete || !base.date || !base.exercise) { result.skippedRows += 1; continue; }
      const extra = Object.fromEntries(unknown.map(({ header, index }) => [header, (row[index] ?? "").trim()]).filter(([, value]) => value));
      const common = { ...base, date: base.date, sport: text(row, "sport"), position: text(row, "position"), note: text(row, "note"), extra };
      if (kind === "velocity") result.velocity.push({ ...common, set: number(row, "set"), rep: number(row, "rep"), loadKg: number(row, "load"), meanVelocity: number(row, "meanVelocity"), peakVelocity: number(row, "peakVelocity"), meanPower: number(row, "meanPower"), peakPower: number(row, "peakPower"), durationS: number(row, "duration"), eaIndex: number(row, "eaIndex"), romCm: number(row, "rom"), tpvS: number(row, "tpv"), targetType: text(row, "targetType"), targetMin: number(row, "targetMin"), targetMax: number(row, "targetMax") });
      else if (kind === "jump") result.jump.push({ ...common, set: number(row, "set"), rep: number(row, "rep"), heightCm: number(row, "height"), contactTimeS: number(row, "contactTime"), rsi: number(row, "rsi"), jumpType: text(row, "jumpType") });
      else result.sprint.push({ ...common, sprint: number(row, "sprint"), split: number(row, "split"), distanceM: number(row, "distance"), splitTime: number(row, "splitTime"), totalTime: number(row, "totalTime"), speedKmh: number(row, "speed"), inBeamStart: cellBoolean(at(row, "inBeam")), triggerStart: cellBoolean(at(row, "trigger")) });
    }
  }
  if (!recognised) throw new OvrFormatError("No Velocity, Jump or Sprint sheet in this file — is it an OVR export?");
  return result;
}

/** "exported_athlete_data_2026-10-07_18-28-37.xlsx" → when OVR wrote it. */
export function exportedAt(fileName: string): { date: string; time: string } | null {
  const match = /(\d{4}-\d{2}-\d{2})[_ T](\d{2})[-:](\d{2})/.exec(fileName);
  return match ? { date: match[1], time: `${match[2]}:${match[3]}` } : null;
}

// ---------------------------------------------------------------------------
// Sprints: splits → times at distances

export interface SprintTime extends OvrRowBase {
  /** Distance from the start the time was taken at; null for a run without distances (505, pro agility). */
  distanceM: number | null;
  time: number;
}

/**
 * One time per split, at the distance covered so far. OVR's Distance is each
 * split's own length — Speed is Distance over Split Time — so the distance at
 * a gate is the sum of the splits before it, and the time is Total Time.
 */
export function sprintTimes(splits: readonly OvrSplit[]): SprintTime[] {
  const runs = new Map<string, OvrSplit[]>();
  splits.forEach((split, index) => {
    const key = [split.athlete, split.date, split.exercise, split.sprint ?? `row-${index}`].join("|");
    runs.set(key, [...(runs.get(key) ?? []), split]);
  });
  return [...runs.values()].flatMap((run): SprintTime[] => {
    const ordered = [...run].sort((a, b) => (a.split ?? 0) - (b.split ?? 0));
    const { athlete, groups, date, exercise, sport, position, note, extra } = ordered[0];
    const base = { athlete, groups, date, exercise, sport, position, note, extra };
    let elapsed = 0;
    const times = ordered.map((split) => {
      elapsed += split.splitTime ?? 0;
      return { split, time: split.totalTime ?? (elapsed || null) };
    });
    if (!ordered.some((split) => split.distanceM !== null)) {
      const last = times.at(-1)?.time;
      return last ? [{ ...base, distanceM: null, time: last }] : [];
    }
    let covered = 0;
    return times.flatMap(({ split, time }) => {
      covered += split.distanceM ?? 0;
      return time ? [{ ...base, distanceM: Math.round(covered * 100) / 100, time }] : [];
    });
  });
}

// ---------------------------------------------------------------------------
// What each exercise in the file is

/** One thing the file measures, mapped by the coach once and remembered. */
export interface OvrMeasure {
  key: string;
  kind: OvrSheetKind;
  exercise: string;
  distanceM: number | null;
  rows: number;
  athletes: number;
  latest: string;
}

export interface OvrMapping {
  key: string;
  /** The power-profile test the best value goes to. */
  testKey: TestKey | null;
  /** A one-leg test recorded as its own exercise per leg ("… - L"). */
  side: Side | null;
  /**
   * A one-leg test done with alternating legs in one set: reps 1, 3, 5, 7 are
   * this leg, 2, 4, 6, 8 the other. Left means the left foot forward.
   */
  firstLeg?: Side | null;
}

/** An alternating one-leg set: four reps a leg. */
export const ALTERNATING_SET_REPS = 8;

export const measureKey = (kind: OvrSheetKind, exercise: string, distanceM: number | null = null) => `${kind}|${exercise.trim().toLowerCase()}${distanceM === null ? "" : `|${distanceM}`}`;

export function ovrMeasures(data: OvrExport): OvrMeasure[] {
  const measures = new Map<string, OvrMeasure & { names: Set<string> }>();
  const add = (kind: OvrSheetKind, row: OvrRowBase, distanceM: number | null = null) => {
    const key = measureKey(kind, row.exercise, distanceM);
    const measure = measures.get(key) ?? { key, kind, exercise: row.exercise, distanceM, rows: 0, athletes: 0, latest: row.date, names: new Set<string>() };
    measure.rows += 1;
    measure.names.add(row.athlete);
    if (row.date > measure.latest) measure.latest = row.date;
    measures.set(key, measure);
  };
  data.velocity.forEach((row) => add("velocity", row));
  data.jump.forEach((row) => add("jump", row));
  sprintTimes(data.sprint).forEach((time) => add("sprint", time, time.distanceM));
  return [...measures.values()]
    .map(({ names, ...measure }) => ({ ...measure, athletes: names.size }))
    .sort((a, b) => a.kind.localeCompare(b.kind) || a.exercise.localeCompare(b.exercise) || (a.distanceM ?? 0) - (b.distanceM ?? 0));
}

const plain = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/ø/g, "o").replace(/æ/g, "ae").replace(/[^a-z0-9]+/g, " ").trim();

const SIDE_WORDS: Record<string, Side> = { left: "left", l: "left", venstre: "left", v: "left", right: "right", r: "right", hoyre: "right", h: "right" };

/** "Split Squat Jump - L" → { name: "split squat jump", side: "left" }. */
export function splitSide(exercise: string): { name: string; side: Side | null } {
  const words = plain(exercise).split(" ").filter(Boolean);
  const last = words.at(-1) ?? "";
  if (words.length > 1 && SIDE_WORDS[last]) return { name: words.slice(0, -1).join(" "), side: SIDE_WORDS[last] };
  return { name: words.join(" "), side: null };
}

const TEST_NAMES: Partial<Record<TestKey, string[]>> = {
  hang_clean: ["hang power clean", "hang clean"],
  power_clean: ["power clean"],
  push_press: ["push press"],
  bench_throw: ["bench press", "bench throw", "speed bench", "bench press throw"],
  speed_squat: ["speed squat"],
  trap_bar_jump: ["trap bar jump", "hex bar jump"],
  squat_jump: ["squat jump", "jump squat", "barbell squat jump", "barbell jump squat"],
  split_squat_jump: ["split squat jump", "split jump"],
  cmj: ["cmj", "countermovement jump", "counter movement jump"],
  cod_505: ["505", "505 cod", "505 test"],
};

/** The tests a measure can feed: power tests from Velocity, heights from Jump, times from Sprint. */
export function testsFor(kind: OvrSheetKind): TestKey[] {
  return (Object.keys(TESTS) as TestKey[]).filter((key) => {
    const test = TESTS[key];
    if (kind === "velocity") return test.device === "ovr-velocity";
    if (kind === "jump") return test.unit === "cm" && test.quality === "vertical";
    return test.unit === "s";
  });
}

export function suggestMapping(measure: OvrMeasure, saved?: OvrMapping | null): OvrMapping {
  if (saved) return saved;
  const { name, side } = splitSide(measure.exercise);
  const allowed = testsFor(measure.kind);
  let testKey = allowed.find((key) => TEST_NAMES[key]?.includes(name)) ?? null;
  if (!testKey && measure.kind === "sprint" && measure.distanceM !== null && !TEST_NAMES.cod_505?.includes(name)) {
    const byDistance = `sprint_${measure.distanceM}m`;
    testKey = allowed.find((key) => key === byDistance) ?? null;
  }
  const sided = Boolean(testKey && TESTS[testKey].sided);
  // No leg in the name: one exercise, legs alternating, left foot first.
  return { key: measure.key, testKey, side: sided ? side : null, firstLeg: sided && !side ? "left" : null };
}

const other = (side: Side): Side => side === "left" ? "right" : "left";
const setKey = (rep: OvrRep) => [rep.athlete, rep.date, rep.exercise.trim().toLowerCase(), rep.set ?? ""].join("|");

/**
 * The leg of every rep of a one-leg test: from the exercise's own leg, or by
 * alternation within each set — the first rep the starting leg, then the
 * other, and so on. Reps are ordered by rep number, then file order.
 */
export function legsOf(reps: readonly OvrRep[], mappings: ReadonlyMap<string, OvrMapping>): Map<OvrRep, Side> {
  const legs = new Map<OvrRep, Side>();
  const sets = new Map<string, OvrRep[]>();
  for (const rep of reps) {
    const mapping = mappings.get(measureKey("velocity", rep.exercise));
    if (!mapping?.testKey || !TESTS[mapping.testKey].sided) continue;
    if (mapping.side) { legs.set(rep, mapping.side); continue; }
    if (mapping.firstLeg) sets.set(setKey(rep), [...(sets.get(setKey(rep)) ?? []), rep]);
  }
  for (const set of sets.values()) {
    const first = mappings.get(measureKey("velocity", set[0].exercise))?.firstLeg as Side;
    set.map((rep, index) => ({ rep, index })).sort((a, b) => (a.rep.rep ?? a.index) - (b.rep.rep ?? b.index) || a.index - b.index)
      .forEach(({ rep }, order) => legs.set(rep, order % 2 === 0 ? first : other(first)));
  }
  return legs;
}

export interface AlternatingIssue {
  athlete: string;
  date: string;
  exercise: string;
  set: number | null;
  reps: number;
}

/**
 * Alternating sets without exactly eight reps. A missed or extra rep shifts
 * every rep after it onto the wrong leg, and the data cannot show it.
 */
export function alternatingIssues(reps: readonly OvrRep[], mappings: ReadonlyMap<string, OvrMapping>): AlternatingIssue[] {
  const sets = new Map<string, OvrRep[]>();
  for (const rep of reps) {
    const mapping = mappings.get(measureKey("velocity", rep.exercise));
    if (mapping?.testKey && TESTS[mapping.testKey].sided && mapping.firstLeg && !mapping.side) sets.set(setKey(rep), [...(sets.get(setKey(rep)) ?? []), rep]);
  }
  return [...sets.values()].filter((set) => set.length !== ALTERNATING_SET_REPS)
    .map((set) => ({ athlete: set[0].athlete, date: set[0].date, exercise: set[0].exercise, set: set[0].set, reps: set.length }));
}

// ---------------------------------------------------------------------------
// Who is who

export interface AthleteMatch {
  /** The name as written in OVR. */
  name: string;
  groups: string;
  rows: number;
  athleteId: string | null;
  how: "name" | "remembered" | null;
  /** Roster athletes with the same first name, for the coach to choose from. */
  candidates: string[];
}

/**
 * The roster keeps "Firstname L.", so a full name from OVR is minimised the
 * same way and compared. A match the coach made before is remembered.
 */
export function matchAthletes(data: OvrExport, roster: readonly Athlete[], remembered: Readonly<Record<string, string>> = {}): AthleteMatch[] {
  const names = new Map<string, { groups: Set<string>; rows: number }>();
  for (const row of [...data.velocity, ...data.jump, ...data.sprint]) {
    const entry = names.get(row.athlete) ?? { groups: new Set<string>(), rows: 0 };
    if (row.groups) entry.groups.add(row.groups);
    entry.rows += 1;
    names.set(row.athlete, entry);
  }
  return [...names].map(([name, { groups, rows }]) => {
    const base = { name, groups: [...groups].join(", "), rows };
    const known = remembered[name];
    if (known && roster.some((athlete) => athlete.id === known)) return { ...base, athleteId: known, how: "remembered" as const, candidates: [] };
    const wanted = plain(minimizeAthleteName(name));
    const exact = roster.filter((athlete) => plain(athlete.displayName) === wanted);
    // Several with the same name and initial: offer those. None: offer the same first name.
    const first = plain(name).split(" ")[0];
    const candidates = (exact.length > 1 ? exact : roster.filter((athlete) => plain(athlete.displayName).split(" ")[0] === first)).map((athlete) => athlete.id);
    return exact.length === 1
      ? { ...base, athleteId: exact[0].id, how: "name" as const, candidates }
      : { ...base, athleteId: null, how: null, candidates };
  }).sort((a, b) => Number(Boolean(b.athleteId)) - Number(Boolean(a.athleteId)) || a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------------------
// The plan: what the file holds, against what Spenst has

export type ValueStatus = "new" | "same" | "differs";

export interface PlannedResult {
  date: string;
  athleteId: string;
  testKey: TestKey;
  side: Side | null;
  value: number;
  /** The attempt the value is: every number OVR wrote for that rep, jump or run (decision 27). */
  details: AttemptDetails | null;
  existing: number | null;
  status: ValueStatus;
}

export interface PlannedDate {
  date: string;
  testDayId: string | null;
  results: PlannedResult[];
  counts: { new: number; same: number; differs: number };
}

export interface ImportPlan {
  dates: PlannedDate[];
  /** Rows mapped to a test or lift whose athlete is not matched to this team. */
  unmatchedRows: number;
}

const resultKey = (date: string, athleteId: string, testKey: string, side: Side | null) => `${date}|${athleteId}|${testKey}|${side ?? "both"}`;
const sameValue = (a: number, b: number) => Math.abs(a - b) < 0.0005;

export function planImport(input: {
  data: OvrExport;
  mappings: ReadonlyMap<string, OvrMapping>;
  /** OVR name → roster athlete on this team. */
  matches: ReadonlyMap<string, string | null>;
  teamId: string;
  testDays: readonly TestDay[];
  results: readonly TestResult[];
}): ImportPlan {
  const { data, mappings, matches } = input;
  let unmatchedRows = 0;
  const best = new Map<string, Omit<PlannedResult, "existing" | "status" | "details">>();
  const legs = legsOf(data.velocity, mappings);
  const offer = (row: OvrRowBase, mapping: OvrMapping | undefined, value: number | null, leg: Side | null = null) => {
    if (!mapping?.testKey || value === null || !(value > 0)) return;
    const test = TESTS[mapping.testKey];
    const side = test.sided ? leg ?? mapping.side : null;
    if (test.sided && !side) return;
    const athleteId = matches.get(row.athlete);
    if (!athleteId) { unmatchedRows += 1; return; }
    const key = resultKey(row.date, athleteId, test.key, side);
    const current = best.get(key);
    const better = !current || (test.direction === "lower" ? value < current.value : value > current.value);
    if (better) best.set(key, { date: row.date, athleteId, testKey: mapping.testKey, side, value });
  };
  // Ballou ranks on the best rep, and on peak power.
  data.velocity.forEach((rep) => offer(rep, mappings.get(measureKey("velocity", rep.exercise)), rep.peakPower, legs.get(rep) ?? null));
  data.jump.forEach((jump) => offer(jump, mappings.get(measureKey("jump", jump.exercise)), jump.heightCm));
  sprintTimes(data.sprint).forEach((time) => offer(time, mappings.get(measureKey("sprint", time.exercise, time.distanceM)), time.time));
  // Each value's attempt, read from the rows as they will be stored — the same rule the test day and the backfill use.
  const chosen = [...best.values()];
  const details = detailsForResults(chosen, ovrRows(data, matches, legs), (key) => mappings.get(key) ?? null);

  const teamDays = input.testDays.filter((day) => day.teamId === input.teamId);
  const dayOn = (date: string) => teamDays.filter((day) => day.heldOn === date).sort((a, b) => a.id.localeCompare(b.id))[0] ?? null;
  const dates = new Map<string, PlannedDate>();
  const dateEntry = (date: string) => {
    const entry = dates.get(date) ?? { date, testDayId: dayOn(date)?.id ?? null, results: [], counts: { new: 0, same: 0, differs: 0 } };
    dates.set(date, entry);
    return entry;
  };

  for (const [index, found] of chosen.entries()) {
    const planned = { ...found, details: details[index] };
    const entry = dateEntry(planned.date);
    const existing = entry.testDayId
      ? input.results.find((result) => result.testDayId === entry.testDayId && result.athleteId === planned.athleteId && result.testKey === planned.testKey && result.side === planned.side)?.value ?? null
      : null;
    const status: ValueStatus = existing === null ? "new" : sameValue(existing, planned.value) ? "same" : "differs";
    entry.results.push({ ...planned, existing, status });
    entry.counts[status] += 1;
  }
  return { dates: [...dates.values()].sort((a, b) => b.date.localeCompare(a.date)), unmatchedRows };
}

// ---------------------------------------------------------------------------
// From the plan to writes

export interface ImportChoices {
  /** Dates to import; others are left alone. */
  dates: ReadonlySet<string>;
  /** Overwrite values that differ from what Spenst has. Off by default: a value typed by hand wins. */
  replaceDiffering: boolean;
}

export interface ImportWrites {
  /** Dates with results and no test day yet: one is created for each. */
  newTestDays: string[];
  results: (Omit<PlannedResult, "existing" | "status"> & { testDayId: string | null })[];
}

export function importWrites(plan: ImportPlan, choices: ImportChoices): ImportWrites {
  const writes: ImportWrites = { newTestDays: [], results: [] };
  for (const entry of plan.dates) {
    if (!choices.dates.has(entry.date)) continue;
    const results = entry.results.filter((result) => result.status === "new" || (result.status === "differs" && choices.replaceDiffering));
    if (results.length && !entry.testDayId) writes.newTestDays.push(entry.date);
    writes.results.push(...results.map((result) => ({ date: result.date, athleteId: result.athleteId, testKey: result.testKey, side: result.side, value: result.value, details: result.details, testDayId: entry.testDayId })));
  }
  return writes;
}

/** Dates worth importing by default: anything the file has that Spenst doesn't. */
export function defaultDates(plan: ImportPlan): Set<string> {
  return new Set(plan.dates.filter((entry) => entry.counts.new > 0).map((entry) => entry.date));
}

// ---------------------------------------------------------------------------
// Every row, kept

/**
 * One row of the export as stored: every column OVR wrote, for an athlete on
 * the roster. The power profile and the velocity station take the best values
 * out of these; the rows themselves are the history.
 */
export interface OvrRow {
  id?: string;
  athleteId: string;
  sheet: OvrSheetKind;
  /**
   * Where the row sits in OVR — date, exercise, set and rep (sprint and split)
   * — plus how many identical positions came before it in the file. The same
   * row in the next export gets the same key, so it is stored once.
   */
  rowKey: string;
  /** The leg of a one-leg test's rep, from the exercise name or alternation. */
  side: Side | null;
  /** Changes when OVR's values for the row change: a corrected row is updated, not duplicated. */
  checksum: string;
  performedOn: string;
  exercise: string;
  groups: string;
  sport: string;
  position: string;
  note: string;
  setNumber: number | null;
  repNumber: number | null;
  sprintNumber: number | null;
  splitNumber: number | null;
  loadKg: number | null;
  meanVelocity: number | null;
  peakVelocity: number | null;
  meanPower: number | null;
  peakPower: number | null;
  durationS: number | null;
  eaIndex: number | null;
  romCm: number | null;
  tpvS: number | null;
  targetType: string;
  targetMin: number | null;
  targetMax: number | null;
  jumpHeightCm: number | null;
  contactTimeS: number | null;
  rsi: number | null;
  jumpType: string;
  distanceM: number | null;
  splitTimeS: number | null;
  totalTimeS: number | null;
  speedKmh: number | null;
  inBeamStart: boolean | null;
  triggerStart: boolean | null;
  extra: Record<string, string>;
  importId?: string | null;
}

type RowValues = Omit<OvrRow, "id" | "athleteId" | "rowKey" | "checksum" | "importId">;

export const EMPTY_VALUES: Omit<RowValues, "sheet" | "performedOn" | "exercise" | "groups" | "sport" | "position" | "note" | "extra"> = {
  side: null, setNumber: null, repNumber: null, sprintNumber: null, splitNumber: null,
  loadKg: null, meanVelocity: null, peakVelocity: null, meanPower: null, peakPower: null, durationS: null, eaIndex: null, romCm: null, tpvS: null,
  targetType: "", targetMin: null, targetMax: null,
  jumpHeightCm: null, contactTimeS: null, rsi: null, jumpType: "",
  distanceM: null, splitTimeS: null, totalTimeS: null, speedKmh: null, inBeamStart: null, triggerStart: null,
};

/** cyrb53: a fast, well-spread 53-bit string hash. Change detection, not security. */
export function rowChecksum(text: string): string {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, "0");
}

/** A stable text form of a row's values: same values, same checksum, whatever the key order. */
function canonical(values: RowValues): string {
  const fields: unknown[] = Object.keys(values).filter((key) => key !== "extra").sort().map((key) => [key, values[key as keyof RowValues]]);
  fields.push(["extra", Object.keys(values.extra).sort().map((key) => [key, values.extra[key]])]);
  return JSON.stringify(fields);
}

/** Every row of the export for the matched athletes, keyed and fingerprinted. */
export function ovrRows(data: OvrExport, matches: ReadonlyMap<string, string | null>, legs: ReadonlyMap<OvrRep, Side> = new Map()): OvrRow[] {
  const seen = new Map<string, number>();
  const rows: OvrRow[] = [];
  const add = (row: OvrRowBase, values: RowValues, position: [number | null, number | null]) => {
    const athleteId = matches.get(row.athlete);
    if (!athleteId) return;
    const base = [values.sheet, row.date, row.exercise.trim().toLowerCase(), position[0] ?? "", position[1] ?? ""].join("|");
    const occurrence = seen.get(`${athleteId}|${base}`) ?? 0;
    seen.set(`${athleteId}|${base}`, occurrence + 1);
    rows.push({ athleteId, rowKey: `${base}#${occurrence}`, checksum: rowChecksum(canonical(values)), ...values });
  };
  const common = (row: OvrRowBase) => ({ performedOn: row.date, exercise: row.exercise, groups: row.groups, sport: row.sport, position: row.position, note: row.note, extra: row.extra });
  for (const rep of data.velocity) {
    add(rep, { ...EMPTY_VALUES, ...common(rep), sheet: "velocity", side: legs.get(rep) ?? null, setNumber: rep.set, repNumber: rep.rep, loadKg: rep.loadKg, meanVelocity: rep.meanVelocity, peakVelocity: rep.peakVelocity, meanPower: rep.meanPower, peakPower: rep.peakPower, durationS: rep.durationS, eaIndex: rep.eaIndex, romCm: rep.romCm, tpvS: rep.tpvS, targetType: rep.targetType, targetMin: rep.targetMin, targetMax: rep.targetMax }, [rep.set, rep.rep]);
  }
  for (const jump of data.jump) {
    add(jump, { ...EMPTY_VALUES, ...common(jump), sheet: "jump", setNumber: jump.set, repNumber: jump.rep, jumpHeightCm: jump.heightCm, contactTimeS: jump.contactTimeS, rsi: jump.rsi, jumpType: jump.jumpType }, [jump.set, jump.rep]);
  }
  for (const split of data.sprint) {
    add(split, { ...EMPTY_VALUES, ...common(split), sheet: "sprint", sprintNumber: split.sprint, splitNumber: split.split, distanceM: split.distanceM, splitTimeS: split.splitTime, totalTimeS: split.totalTime, speedKmh: split.speedKmh, inBeamStart: split.inBeamStart, triggerStart: split.triggerStart }, [split.sprint, split.split]);
  }
  return rows;
}

/**
 * What the database does on import, for demo mode and tests: a new key is
 * added, a known key with a new checksum is updated, an unchanged row is left
 * exactly as it was — including which import wrote it.
 */
export function mergeOvrRows(existing: readonly OvrRow[], incoming: readonly OvrRow[], importId: string, makeId: () => string): { rows: OvrRow[]; added: number; changed: number } {
  const byKey = new Map(existing.map((row) => [`${row.athleteId}|${row.rowKey}`, row]));
  let added = 0, changed = 0;
  for (const row of incoming) {
    const key = `${row.athleteId}|${row.rowKey}`;
    const current = byKey.get(key);
    if (!current) { byKey.set(key, { ...row, id: makeId(), importId }); added += 1; }
    else if (current.checksum !== row.checksum) { byKey.set(key, { ...row, id: current.id, importId }); changed += 1; }
  }
  return { rows: [...byKey.values()], added, changed };
}

// ---------------------------------------------------------------------------
// The import record

export const OVR_BUCKET = "ovr-exports";
export const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export interface ImportSummary {
  results: number;
  /** OVR rows stored: new, and updated because OVR changed them. */
  rowsAdded: number;
  rowsChanged: number;
  dates: string[];
  /** Test days the import made; undo removes those left empty. */
  createdTestDayIds: string[];
  /** OVR name → athlete, so the next import remembers. Coaches only, like the file. */
  matches: Record<string, string>;
  exportedAt: string | null;
}

export type ImportStatus = "uploaded" | "applied" | "failed" | "undone";

export interface TestImport {
  id: string;
  teamId: string;
  fileName: string;
  fileSize: number;
  fileSha256: string | null;
  filePath: string;
  status: ImportStatus;
  summary: ImportSummary;
  createdAt: string;
  /** Demo mode only: the file, kept in memory. */
  localUrl?: string;
}

export interface TeamOvrMapping extends OvrMapping {
  teamId: string;
}

const strings = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

/** The summary is JSON from the database: checked, never trusted. */
export function parseSummary(value: unknown): ImportSummary {
  const raw = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const matches = raw.matches && typeof raw.matches === "object" ? Object.fromEntries(Object.entries(raw.matches as Record<string, unknown>).filter((entry): entry is [string, string] => typeof entry[1] === "string")) : {};
  return {
    results: Number(raw.results) || 0,
    rowsAdded: Number(raw.rowsAdded) || 0,
    rowsChanged: Number(raw.rowsChanged) || 0,
    dates: strings(raw.dates),
    createdTestDayIds: strings(raw.createdTestDayIds),
    matches,
    exportedAt: typeof raw.exportedAt === "string" ? raw.exportedAt : null,
  };
}

/** Matches from the team's earlier imports, newest winning. */
export function rememberedMatches(imports: readonly TestImport[], teamId: string): Record<string, string> {
  return imports
    .filter((entry) => entry.teamId === teamId && entry.status !== "undone")
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .reduce<Record<string, string>>((all, entry) => ({ ...all, ...entry.summary.matches }), {});
}

/** The exact file imported before, if it was. */
export function sameFileImport(imports: readonly TestImport[], teamId: string, sha256: string): TestImport | null {
  return imports.find((entry) => entry.teamId === teamId && entry.fileSha256 === sha256 && entry.status === "applied") ?? null;
}

/** A storage-safe file name that still reads like the original. */
export const storageFileName = (name: string) => name.normalize("NFKD").replace(/[^\w.-]+/g, "_").replace(/_+/g, "_").slice(-120) || "export.xlsx";

export async function sha256Hex(data: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
