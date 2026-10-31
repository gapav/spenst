import { measureKey, type OvrMapping, type OvrRow, type OvrSheetKind } from "./ovr-import";

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
  values: Record<string, number | null>;
}

/** First is the metric the test is scored on. */
const ATTEMPT_METRICS: Record<OvrSheetKind, AttemptMetric[]> = {
  velocity: [
    { key: "peakPower", label: "Peak power", unit: "W", digits: 0, best: "max" },
    { key: "meanPower", label: "Mean power", unit: "W", digits: 0, best: "max" },
    { key: "peakVelocity", label: "Peak velocity", unit: "m/s", digits: 2, best: "max" },
    { key: "meanVelocity", label: "Mean velocity", unit: "m/s", digits: 2, best: "max" },
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
      values: sheet === "velocity"
        ? { peakPower: row.peakPower, meanPower: row.meanPower, peakVelocity: row.peakVelocity, meanVelocity: row.meanVelocity }
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
      return { key, athleteId: ordered[0].athleteId, side: null, label: `Run ${ordered[0].sprintNumber ?? "–"}`, rows: ordered, values: { time: times[at], topSpeed: Math.max(...speeds) || null } };
    });
  }
  const metrics = ATTEMPT_METRICS[sheet].filter((metric) => attempts.some((attempt) => typeof attempt.values[metric.key] === "number"));
  return { sheet, metrics, attempts };
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
