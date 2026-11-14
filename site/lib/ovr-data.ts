import { measureKey, type OvrMapping, type OvrRow, type OvrSheetKind } from "./ovr-import";
import type { AttemptDetailKey, AttemptDetails, Side } from "./types";

/**
 * Reading stored OVR rows back: which columns an exercise actually has, and
 * the best value per day for a trend. Pure, so the athlete page stays thin.
 */

export type OvrColumnKey = Exclude<keyof OvrRow, "id" | "athleteId" | "sheet" | "rowKey" | "checksum" | "performedOn" | "exercise" | "extra" | "importId">;

export interface OvrColumn {
  key: OvrColumnKey;
  label: string;
  unit?: string;
  digits?: number;
  sheets: readonly OvrSheetKind[];
}

/** In the order a coach reads a set: where in the session, then the load, then what the bar did. */
export const OVR_COLUMNS: readonly OvrColumn[] = [
  { key: "setNumber", label: "Set", sheets: ["velocity", "jump"] },
  { key: "repNumber", label: "Rep", sheets: ["velocity", "jump"] },
  { key: "sprintNumber", label: "Run", sheets: ["sprint"] },
  { key: "splitNumber", label: "Split", sheets: ["sprint"] },
  { key: "loadKg", label: "Load", unit: "kg", digits: 1, sheets: ["velocity"] },
  { key: "meanVelocity", label: "Mean velocity", unit: "m/s", digits: 2, sheets: ["velocity"] },
  { key: "peakVelocity", label: "Peak velocity", unit: "m/s", digits: 2, sheets: ["velocity"] },
  { key: "meanPower", label: "Mean power", unit: "W", digits: 0, sheets: ["velocity"] },
  { key: "peakPower", label: "Peak power", unit: "W", digits: 0, sheets: ["velocity"] },
  { key: "romCm", label: "ROM", unit: "cm", digits: 1, sheets: ["velocity"] },
  { key: "tpvS", label: "Time to peak", unit: "s", digits: 2, sheets: ["velocity"] },
  { key: "durationS", label: "Duration", unit: "s", digits: 2, sheets: ["velocity"] },
  { key: "eaIndex", label: "EA index", digits: 2, sheets: ["velocity"] },
  { key: "targetType", label: "Target", sheets: ["velocity"] },
  { key: "targetMin", label: "Target min", digits: 2, sheets: ["velocity"] },
  { key: "targetMax", label: "Target max", digits: 2, sheets: ["velocity"] },
  { key: "jumpType", label: "Type", sheets: ["jump"] },
  { key: "jumpHeightCm", label: "Height", unit: "cm", digits: 1, sheets: ["jump"] },
  { key: "contactTimeS", label: "Contact time", unit: "s", digits: 3, sheets: ["jump"] },
  { key: "rsi", label: "RSI", digits: 2, sheets: ["jump"] },
  { key: "distanceM", label: "Distance", unit: "m", digits: 2, sheets: ["sprint"] },
  { key: "splitTimeS", label: "Split time", unit: "s", digits: 3, sheets: ["sprint"] },
  { key: "totalTimeS", label: "Total time", unit: "s", digits: 3, sheets: ["sprint"] },
  { key: "speedKmh", label: "Speed", unit: "km/h", digits: 1, sheets: ["sprint"] },
  { key: "inBeamStart", label: "In-beam start", sheets: ["sprint"] },
  { key: "triggerStart", label: "Trigger start", sheets: ["sprint"] },
  { key: "groups", label: "Group", sheets: ["velocity", "jump", "sprint"] },
  { key: "sport", label: "Sport", sheets: ["velocity", "jump", "sprint"] },
  { key: "position", label: "Position", sheets: ["velocity", "jump", "sprint"] },
  { key: "note", label: "Note", sheets: ["velocity", "jump", "sprint"] },
];

const filled = (value: unknown) => value !== null && value !== undefined && value !== "";

/** The columns with at least one value in these rows — and every extra column OVR added. */
export function columnsWithData(rows: readonly OvrRow[]): { columns: OvrColumn[]; extra: string[] } {
  const sheets = new Set(rows.map((row) => row.sheet));
  const columns = OVR_COLUMNS.filter((column) => column.sheets.some((sheet) => sheets.has(sheet)) && rows.some((row) => filled(row[column.key])));
  const extra = [...new Set(rows.flatMap((row) => Object.keys(row.extra)))].sort();
  return { columns, extra };
}

export function formatCell(column: OvrColumn, value: OvrRow[OvrColumnKey]): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return column.digits === undefined ? String(value) : new Intl.NumberFormat("en-GB", { minimumFractionDigits: column.digits, maximumFractionDigits: column.digits }).format(value);
  return value;
}

export interface TrendMetric {
  key: OvrColumnKey;
  label: string;
  unit: string;
  /** Which way is better, and therefore which value of a day is its best. */
  best: "max" | "min";
}

const TREND_METRICS: Record<OvrSheetKind, TrendMetric[]> = {
  velocity: [
    { key: "peakPower", label: "Peak power", unit: "W", best: "max" },
    { key: "meanPower", label: "Mean power", unit: "W", best: "max" },
    { key: "meanVelocity", label: "Mean velocity", unit: "m/s", best: "max" },
    { key: "peakVelocity", label: "Peak velocity", unit: "m/s", best: "max" },
    { key: "loadKg", label: "Load", unit: "kg", best: "max" },
  ],
  jump: [
    { key: "jumpHeightCm", label: "Jump height", unit: "cm", best: "max" },
    { key: "rsi", label: "RSI", unit: "", best: "max" },
    { key: "contactTimeS", label: "Contact time", unit: "s", best: "min" },
  ],
  sprint: [
    { key: "totalTimeS", label: "Fastest run", unit: "s", best: "min" },
    { key: "speedKmh", label: "Top speed", unit: "km/h", best: "max" },
  ],
};

/** The trends these rows can draw: only metrics with data. */
export function trendMetrics(rows: readonly OvrRow[]): TrendMetric[] {
  const sheet = rows[0]?.sheet;
  if (!sheet) return [];
  return TREND_METRICS[sheet].filter((metric) => rows.some((row) => typeof row[metric.key] === "number"));
}

/**
 * The best value of each day, oldest first. A sprint's run time is its last
 * split's total, so a 0–5–10 m run counts as one 10 m time, not as a 5 m one.
 */
export function trendByDate(rows: readonly OvrRow[], metric: TrendMetric): { date: string; value: number }[] {
  let candidates = rows;
  if (metric.key === "totalTimeS") {
    const lastSplit = new Map<string, OvrRow>();
    for (const row of rows) {
      const run = `${row.performedOn}|${row.sprintNumber ?? row.rowKey}`;
      const current = lastSplit.get(run);
      if (!current || (row.splitNumber ?? 0) > (current.splitNumber ?? 0)) lastSplit.set(run, row);
    }
    candidates = [...lastSplit.values()];
  }
  const byDate = new Map<string, number>();
  for (const row of candidates) {
    const value = row[metric.key];
    if (typeof value !== "number" || !(value > 0)) continue;
    const current = byDate.get(row.performedOn);
    if (current === undefined || (metric.best === "max" ? value > current : value < current)) byDate.set(row.performedOn, value);
  }
  return [...byDate].map(([date, value]) => ({ date, value })).sort((a, b) => a.date.localeCompare(b.date));
}

/** Rows grouped by exercise, the most recently trained first. */
export function exercisesIn(rows: readonly OvrRow[]): { key: string; sheet: OvrSheetKind; exercise: string; rows: OvrRow[]; latest: string; days: number }[] {
  const groups = new Map<string, OvrRow[]>();
  for (const row of rows) {
    const key = `${row.sheet}|${row.exercise.trim().toLowerCase()}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups].map(([key, group]) => ({
    key,
    sheet: group[0].sheet,
    exercise: group[0].exercise,
    rows: group,
    latest: group.reduce((latest, row) => row.performedOn > latest ? row.performedOn : latest, ""),
    days: new Set(group.map((row) => row.performedOn)).size,
  })).sort((a, b) => b.latest.localeCompare(a.latest) || a.exercise.localeCompare(b.exercise));
}

/** A day's rows in the order they happened: set and rep, or run and split. */
export function sessionOrder(a: OvrRow, b: OvrRow): number {
  return (a.setNumber ?? a.sprintNumber ?? 0) - (b.setNumber ?? b.sprintNumber ?? 0)
    || (a.repNumber ?? a.splitNumber ?? 0) - (b.repNumber ?? b.splitNumber ?? 0)
    || a.rowKey.localeCompare(b.rowKey);
}

// ---------------------------------------------------------------------------
// The rows behind a test result

/**
 * The rows that fed a test on a test day: every rep of the exercise mapped to
 * it, or every split of each run whose distance is the test's. `mappingFor`
 * gives the team's mapping for a measure key (saved, or the suggestion).
 */
export function rowsForTest(rows: readonly OvrRow[], testKey: string, mappingFor: (key: string, sheet: OvrSheetKind, exercise: string, distanceM: number | null) => OvrMapping | null): OvrRow[] {
  const result: OvrRow[] = [];
  const runs = new Map<string, OvrRow[]>();
  for (const row of rows) {
    if (row.sheet === "sprint") {
      const run = `${row.athleteId}|${row.performedOn}|${row.exercise}|${row.sprintNumber ?? row.rowKey}`;
      runs.set(run, [...(runs.get(run) ?? []), row]);
    } else if (mappingFor(measureKey(row.sheet, row.exercise), row.sheet, row.exercise, null)?.testKey === testKey) {
      result.push(row);
    }
  }
  for (const run of runs.values()) {
    const ordered = [...run].sort((a, b) => (a.splitNumber ?? 0) - (b.splitNumber ?? 0));
    const exercise = ordered[0].exercise;
    let covered = 0;
    const distances = ordered.some((row) => row.distanceM !== null)
      ? ordered.map((row) => { covered += row.distanceM ?? 0; return Math.round(covered * 100) / 100; })
      : [null];
    if (distances.some((distance) => mappingFor(measureKey("sprint", exercise, distance), "sprint", exercise, distance)?.testKey === testKey)) result.push(...ordered);
  }
  return result.sort(sessionOrder);
}

export interface OvrBest {
  /** The rows of the best attempt: one rep or jump, or a whole run. */
  rows: OvrRow[];
  /** "100 kg · 12,039 W peak · …": the best attempt in a line. */
  summary: string;
  /** "best of 3 reps" */
  outOf: string;
}

const number = (value: number | null, digits: number, unit: string) => value === null ? null : `${new Intl.NumberFormat("en-GB", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value)} ${unit}`.trim();

/** The best attempt among a test's rows, the way the test is scored: peak power, height, or time. */
export function bestAttempt(rows: readonly OvrRow[]): OvrBest | null {
  if (!rows.length) return null;
  const sheet = rows[0].sheet;
  if (sheet === "velocity") {
    const best = rows.reduce((top, row) => (row.peakPower ?? -1) > (top.peakPower ?? -1) ? row : top);
    const parts = [number(best.loadKg, 1, "kg"), best.peakPower !== null ? `${number(best.peakPower, 0, "W")} peak` : null, best.meanPower !== null ? `${number(best.meanPower, 0, "W")} mean` : null,
      best.peakVelocity !== null ? `${number(best.peakVelocity, 2, "m/s")} peak` : null, best.meanVelocity !== null ? `${number(best.meanVelocity, 2, "m/s")} mean` : null, best.romCm !== null ? `ROM ${number(best.romCm, 1, "cm")}` : null];
    return { rows: [best], summary: parts.filter(Boolean).join(" · "), outOf: `best of ${rows.length} ${rows.length === 1 ? "rep" : "reps"}` };
  }
  if (sheet === "jump") {
    const best = rows.reduce((top, row) => (row.jumpHeightCm ?? -1) > (top.jumpHeightCm ?? -1) ? row : top);
    const parts = [number(best.jumpHeightCm, 1, "cm"), best.contactTimeS !== null ? `contact ${number(best.contactTimeS, 3, "s")}` : null, best.rsi !== null ? `RSI ${number(best.rsi, 2, "")}` : null];
    return { rows: [best], summary: parts.filter(Boolean).join(" · "), outOf: `best of ${rows.length} ${rows.length === 1 ? "jump" : "jumps"}` };
  }
  const runs = new Map<string, OvrRow[]>();
  for (const row of rows) runs.set(`${row.performedOn}|${row.sprintNumber ?? row.rowKey}`, [...(runs.get(`${row.performedOn}|${row.sprintNumber ?? row.rowKey}`) ?? []), row]);
  const finish = (run: OvrRow[]) => [...run].sort((a, b) => (b.splitNumber ?? 0) - (a.splitNumber ?? 0))[0].totalTimeS ?? Infinity;
  const best = [...runs.values()].reduce((top, run) => finish(run) < finish(top) ? run : top);
  let covered = 0;
  const splits = [...best].sort((a, b) => (a.splitNumber ?? 0) - (b.splitNumber ?? 0)).map((row) => {
    covered += row.distanceM ?? 0;
    return row.distanceM !== null ? `${Math.round(covered * 100) / 100} m ${number(row.totalTimeS, 3, "s")}` : number(row.totalTimeS, 3, "s");
  });
  const top = Math.max(...best.map((row) => row.speedKmh ?? 0));
  return { rows: best, summary: [...splits, top > 0 ? `top ${number(top, 1, "km/h")}` : null].filter(Boolean).join(" · "), outOf: `best of ${runs.size} ${runs.size === 1 ? "run" : "runs"}` };
}

// ---------------------------------------------------------------------------
// Attempts: what a test-day chart plots

export interface AttemptMetric {
  key: string;
  label: string;
  unit: string;
  digits: number;
  best: "max" | "min";
}

/** One go at a test: a rep, a jump, or a run timed at the test's distance. */
export interface Attempt {
  key: string;
  athleteId: string;
  /** The leg, for a one-leg test. */
  side: "left" | "right" | null;
  label: string;
  rows: OvrRow[];
  /** The row the attempt is read at: the rep or jump, or the split at the test's gate. */
  gate: number;
  values: Record<string, number | null>;
}

/**
 * First is the metric the test is scored on. A higher power, velocity, ROM or
 * EA index is better; a shorter time to peak velocity or rep duration is.
 */
export const ATTEMPT_METRICS: Record<OvrSheetKind, AttemptMetric[]> = {
  velocity: [
    { key: "peakPower", label: "Peak power", unit: "W", digits: 0, best: "max" },
    { key: "meanPower", label: "Mean power", unit: "W", digits: 0, best: "max" },
    { key: "peakVelocity", label: "Peak velocity", unit: "m/s", digits: 2, best: "max" },
    { key: "meanVelocity", label: "Mean velocity", unit: "m/s", digits: 2, best: "max" },
    { key: "romCm", label: "ROM", unit: "cm", digits: 1, best: "max" },
    { key: "tpvS", label: "Time to peak", unit: "s", digits: 2, best: "min" },
    { key: "durationS", label: "Duration", unit: "s", digits: 2, best: "min" },
    { key: "eaIndex", label: "EA index", unit: "", digits: 2, best: "max" },
  ],
  jump: [
    { key: "jumpHeightCm", label: "Height", unit: "cm", digits: 1, best: "max" },
    { key: "rsi", label: "RSI", unit: "", digits: 2, best: "max" },
    { key: "contactTimeS", label: "Contact time", unit: "s", digits: 3, best: "min" },
  ],
  sprint: [
    { key: "time", label: "Time", unit: "s", digits: 3, best: "min" },
    { key: "topSpeed", label: "Top speed", unit: "km/h", digits: 1, best: "max" },
  ],
};

/** Shown beside an attempt, never ranked: the load says what the bar weighed, not how well it moved. */
export const ATTEMPT_CONTEXT: Record<OvrSheetKind, Omit<AttemptMetric, "best">[]> = {
  velocity: [{ key: "loadKg", label: "Load", unit: "kg", digits: 1 }],
  jump: [],
  sprint: [],
};

export function testAttempts(rows: readonly OvrRow[], testKey: string, mappingFor: Parameters<typeof rowsForTest>[2]): { sheet: OvrSheetKind | null; metrics: AttemptMetric[]; attempts: Attempt[] } {
  const matched = rowsForTest(rows, testKey, mappingFor);
  if (!matched.length) return { sheet: null, metrics: [], attempts: [] };
  const sheet = matched[0].sheet;
  let attempts: Attempt[];
  if (sheet !== "sprint") {
    attempts = matched.map((row): Attempt => ({
      key: `${row.athleteId}|${row.rowKey}`,
      athleteId: row.athleteId,
      side: row.side,
      label: `${row.side ? `${row.side === "left" ? "Left" : "Right"} · ` : ""}set ${row.setNumber ?? "–"}, rep ${row.repNumber ?? "–"}`,
      rows: [row],
      gate: 0,
      values: sheet === "velocity"
        ? { peakPower: row.peakPower, meanPower: row.meanPower, peakVelocity: row.peakVelocity, meanVelocity: row.meanVelocity, romCm: row.romCm, tpvS: row.tpvS, durationS: row.durationS, eaIndex: row.eaIndex, loadKg: row.loadKg }
        : { jumpHeightCm: row.jumpHeightCm, rsi: row.rsi, contactTimeS: row.contactTimeS },
    }));
  } else {
    const runs = new Map<string, OvrRow[]>();
    for (const row of matched) {
      const run = `${row.athleteId}|${row.performedOn}|${row.exercise}|${row.sprintNumber ?? row.rowKey}`;
      runs.set(run, [...(runs.get(run) ?? []), row]);
    }
    attempts = [...runs].map(([key, run]) => {
      const ordered = [...run].sort((a, b) => (a.splitNumber ?? 0) - (b.splitNumber ?? 0));
      // The time at the gate this test is read at: 5 m from a 0–5–10 m run is the first split.
      let covered = 0, elapsed = 0, at = ordered.length - 1;
      const times = ordered.map((row, index) => {
        covered += row.distanceM ?? 0;
        elapsed += row.splitTimeS ?? 0;
        const distance = row.distanceM === null ? null : Math.round(covered * 100) / 100;
        if (distance !== null && mappingFor(measureKey("sprint", row.exercise, distance), "sprint", row.exercise, distance)?.testKey === testKey) at = index;
        return row.totalTimeS ?? (elapsed || null);
      });
      const speeds = ordered.slice(0, at + 1).map((row) => row.speedKmh ?? 0);
      return { key, athleteId: ordered[0].athleteId, side: null, label: `Run ${ordered[0].sprintNumber ?? "–"}`, rows: ordered, gate: at, values: { time: times[at], topSpeed: Math.max(...speeds) || null } };
    });
  }
  const metrics = ATTEMPT_METRICS[sheet].filter((metric) => attempts.some((attempt) => typeof attempt.values[metric.key] === "number"));
  return { sheet, metrics, attempts };
}

// ---------------------------------------------------------------------------
// The best attempt, kept with the result (decision 27)

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

/** What a result keeps of the attempt it came from: every number OVR wrote for it. */
export function attemptDetails(attempt: Attempt, outOf: number): AttemptDetails {
  const row = attempt.rows[attempt.gate] ?? attempt.rows[0];
  const pick = (keys: readonly AttemptDetailKey[]) => Object.fromEntries(keys.map((key) => [key, row[key]]).filter(([, value]) => finite(value)));
  if (row.sheet === "velocity") return { sheet: "velocity", ...pick(["setNumber", "repNumber", "loadKg", "meanVelocity", "peakVelocity", "meanPower", "peakPower", "romCm", "tpvS", "durationS", "eaIndex"]), attempts: outOf };
  if (row.sheet === "jump") return { sheet: "jump", ...pick(["setNumber", "repNumber", "jumpHeightCm", "contactTimeS", "rsi"]), attempts: outOf };
  // A run: the split at the test's gate, the distance covered to it, and the run's start.
  const covered = row.distanceM === null ? null : Math.round(attempt.rows.slice(0, attempt.gate + 1).reduce((sum, split) => sum + (split.distanceM ?? 0), 0) * 100) / 100;
  const details: AttemptDetails = { sheet: "sprint", ...pick(["sprintNumber", "splitNumber", "splitTimeS"]), attempts: outOf };
  if (covered !== null) details.distanceM = covered;
  if (finite(attempt.values.time)) details.totalTimeS = attempt.values.time;
  if (finite(attempt.values.topSpeed)) details.speedKmh = attempt.values.topSpeed;
  if (row.inBeamStart !== null) details.inBeamStart = row.inBeamStart;
  if (row.triggerStart !== null) details.triggerStart = row.triggerStart;
  return details;
}

/** What a result is scored on, per sheet: the first attempt metric. */
const SCORED_KEY: Record<OvrSheetKind, string> = { velocity: "peakPower", jump: "jumpHeightCm", sprint: "time" };

/**
 * The best attempt behind each result, from the OVR rows of its day: the
 * attempt whose scored value is the result, picked out of the test's attempts
 * the way the test day reads them. Null when no attempt gives the value (a
 * value typed by hand). The import uses it for what it writes, demo data and
 * tests for what is stored — the backfill in migration 202611140001 is the
 * same rule in SQL.
 */
export function detailsForResults(
  results: readonly { athleteId: string; date: string; testKey: string; side: Side | null; value: number }[],
  rows: readonly OvrRow[],
  mappingFor: Parameters<typeof rowsForTest>[2],
): (AttemptDetails | null)[] {
  const byDay = new Map<string, OvrRow[]>();
  for (const row of rows) {
    const key = `${row.athleteId}|${row.performedOn}`;
    byDay.set(key, [...(byDay.get(key) ?? []), row]);
  }
  const cache = new Map<string, ReturnType<typeof testAttempts>>();
  return results.map((result) => {
    const day = `${result.athleteId}|${result.date}`;
    const key = `${day}|${result.testKey}`;
    const read = cache.get(key) ?? testAttempts(byDay.get(day) ?? [], result.testKey, mappingFor);
    cache.set(key, read);
    if (!read.sheet) return null;
    const scored = SCORED_KEY[read.sheet];
    const own = read.attempts.filter((attempt) => attempt.athleteId === result.athleteId && attempt.side === result.side);
    const match = own.find((attempt) => finite(attempt.values[scored]) && Math.abs((attempt.values[scored] as number) - result.value) < 0.0005);
    return match ? attemptDetails(match, own.length) : null;
  });
}

const DETAIL_NUMBERS: readonly AttemptDetailKey[] = ["setNumber", "repNumber", "sprintNumber", "splitNumber", "loadKg", "meanVelocity", "peakVelocity", "meanPower", "peakPower", "romCm", "tpvS", "durationS", "eaIndex", "jumpHeightCm", "contactTimeS", "rsi", "distanceM", "splitTimeS", "totalTimeS", "speedKmh"];

/** `test_results.details` from the database: checked, never trusted. */
export function parseAttemptDetails(value: unknown): AttemptDetails | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (raw.sheet !== "velocity" && raw.sheet !== "jump" && raw.sheet !== "sprint") return null;
  const details: AttemptDetails = { sheet: raw.sheet };
  for (const key of DETAIL_NUMBERS) {
    const number = typeof raw[key] === "string" ? Number(raw[key]) : raw[key];
    if (finite(number)) details[key] = number;
  }
  if (typeof raw.inBeamStart === "boolean") details.inBeamStart = raw.inBeamStart;
  if (typeof raw.triggerStart === "boolean") details.triggerStart = raw.triggerStart;
  if (finite(raw.attempts) && raw.attempts > 0) details.attempts = raw.attempts;
  return details;
}

const formatNumber = (value: number, digits: number) => new Intl.NumberFormat("en-GB", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
const measured = (value: number | undefined, digits: number, unit: string, before = "", after = "") => value === undefined ? null : `${before}${formatNumber(value, digits)}${unit ? ` ${unit}` : ""}${after}`;

/** The best attempt in a line: “100 kg · 12,039 W peak · 4.64 m/s peak · ROM 122.4 cm”. */
export function detailsSummary(details: AttemptDetails | null | undefined): string {
  if (!details) return "";
  const parts = details.sheet === "velocity"
    ? [details.loadKg === undefined ? null : `${new Intl.NumberFormat("en-GB", { maximumFractionDigits: 1 }).format(details.loadKg)} kg`, measured(details.peakPower, 0, "W", "", " peak"), measured(details.meanPower, 0, "W", "", " mean"),
      measured(details.peakVelocity, 2, "m/s", "", " peak"), measured(details.meanVelocity, 2, "m/s", "", " mean"), measured(details.romCm, 1, "cm", "ROM ")]
    : details.sheet === "jump"
      ? [measured(details.jumpHeightCm, 1, "cm"), measured(details.contactTimeS, 3, "s", "contact "), measured(details.rsi, 2, "", "RSI ")]
      : [details.distanceM !== undefined && details.totalTimeS !== undefined ? `${new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 }).format(details.distanceM)} m in ${formatNumber(details.totalTimeS, 3)} s` : measured(details.totalTimeS, 3, "s"),
        measured(details.speedKmh, 1, "km/h"), details.inBeamStart ? "in-beam start" : details.triggerStart ? "trigger start" : null];
  return parts.filter(Boolean).join(" · ");
}

/** “best of 3 reps” */
export function detailsOutOf(details: AttemptDetails | null | undefined): string {
  if (!details?.attempts) return "";
  const noun = details.sheet === "velocity" ? "rep" : details.sheet === "jump" ? "jump" : "run";
  return `best of ${details.attempts} ${details.attempts === 1 ? noun : `${noun}s`}`;
}

/** Where the attempt sits: “set 1, rep 2”, “run 3”. */
export function detailsPlace(details: AttemptDetails | null | undefined): string {
  if (!details) return "";
  if (details.sheet === "sprint") return details.sprintNumber !== undefined ? `run ${details.sprintNumber}` : "";
  return details.setNumber !== undefined ? `set ${details.setNumber}, rep ${details.repNumber ?? "–"}` : "";
}

/** A result's details for a tooltip: one line, or a line per leg. */
export function resultDetailLines(value: { details?: AttemptDetails | null; sideDetails?: Partial<Record<Side, AttemptDetails>> } | null | undefined): string[] {
  if (!value) return [];
  const line = (details: AttemptDetails | null | undefined, prefix = "") => {
    const text = detailsSummary(details);
    return text ? `${prefix}${text}` : null;
  };
  const sided = value.sideDetails && (value.sideDetails.left || value.sideDetails.right);
  return (sided ? [line(value.sideDetails?.left, "Left: "), line(value.sideDetails?.right, "Right: ")] : [line(value.details)]).filter((entry): entry is string => Boolean(entry));
}

/**
 * Every column of an attempt OVR filled, labelled and formatted as on the
 * test day: “Load 100.0 kg”, “In-beam start Yes”. A run lists each split.
 */
export function attemptFields(rows: readonly OvrRow[]): { label: string; text: string }[] {
  const skip = new Set<OvrColumnKey>(["groups", "sport", "position"]);
  const columns = columnsWithData(rows).columns.filter((column) => !skip.has(column.key));
  const many = rows.length > 1;
  const fields: { label: string; text: string }[] = [];
  for (const column of columns) {
    const values = rows.map((row) => row[column.key]).filter(filled);
    if (!values.length) continue;
    const same = values.every((value) => value === values[0]);
    // Per split only where splits differ; a run's start is the run's.
    const text = !many || same ? formatCell(column, values[0]) : rows.map((row) => formatCell(column, row[column.key])).join(" / ");
    fields.push({ label: column.label, text: column.unit && !text.includes("—") ? `${text} ${column.unit}` : text });
  }
  return fields;
}

// ---------------------------------------------------------------------------
// Ranking results on another stored metric

/** The metrics a stored result can be ranked on, by sheet: the attempt metrics under their stored names. First is the scored one. */
export const RESULT_METRICS: Record<OvrSheetKind, (AttemptMetric & { key: AttemptDetailKey })[]> = {
  velocity: ATTEMPT_METRICS.velocity as (AttemptMetric & { key: AttemptDetailKey })[],
  jump: ATTEMPT_METRICS.jump as (AttemptMetric & { key: AttemptDetailKey })[],
  sprint: [
    { key: "totalTimeS", label: "Time", unit: "s", digits: 3, best: "min" },
    { key: "speedKmh", label: "Speed", unit: "km/h", digits: 1, best: "max" },
  ],
};

/** The stored metrics these results have, besides the scored one, for a ranking switch. */
export function resultMetrics(results: readonly { details?: AttemptDetails | null }[]): (AttemptMetric & { key: AttemptDetailKey })[] {
  const sheet = results.find((result) => result.details)?.details?.sheet;
  if (!sheet) return [];
  return RESULT_METRICS[sheet].slice(1).filter((metric) => results.some((result) => finite(result.details?.[metric.key])));
}

/** The best of some values, the way the metric is read. */
export function bestOf(values: readonly number[], best: "max" | "min"): number | null {
  if (!values.length) return null;
  return best === "max" ? Math.max(...values) : Math.min(...values);
}

/** Round ticks for an axis between two values. */
export function niceTicks(min: number, max: number, count = 4): number[] {
  if (!(max > min)) return [min];
  const step = (max - min) / count;
  const magnitude = 10 ** Math.floor(Math.log10(step));
  const nice = [1, 2, 2.5, 5, 10].map((factor) => factor * magnitude).find((candidate) => candidate >= step) ?? step;
  const ticks: number[] = [];
  for (let value = Math.ceil(min / nice) * nice; value <= max + 1e-9; value += nice) ticks.push(Math.round(value * 1e6) / 1e6);
  return ticks;
}
