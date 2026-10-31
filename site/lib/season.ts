import { VELOCITY_ZONES, type ZoneId } from "./vbt";

/**
 * The year plan — Ballou's yearly overview made interactive. A season is a run
 * of weeks; phases (makro) and blocks (meso) are week-aligned spans laid on
 * it, each with a focus and notes; a throughline is the one thing that runs
 * through every phase ("hurtigstyrke i alle faser"). Sessions are not owned by
 * a period: they sit on dates in the team's calendar, and a period is whatever
 * span their date falls in. Moving a block never orphans a session.
 *
 * Dates are `YYYY-MM-DD` calendar days, handled in UTC so no time zone can
 * move them.
 */

export type PeriodLevel = "phase" | "block";
/** Ballou's pink weeks are `break`: holidays, discretionary weeks, off. */
export type PeriodKind = "training" | "competition" | "break";

export interface Season {
  id: string;
  teamId: string;
  title: string;
  /** A Monday. */
  startsOn: string;
  weeks: number;
  /** The line under every phase: what never stops. Empty for none. */
  throughline: string;
}

export interface Period {
  id: string;
  seasonId: string;
  level: PeriodLevel;
  kind: PeriodKind;
  title: string;
  /** A Monday. */
  startsOn: string;
  weeks: number;
  /** For blocks: the velocity zone the block emphasizes. */
  emphasis: ZoneId | null;
  /** One line: what this period is for. */
  focus: string;
  /** Free text, one point per line — Ballou's "component by phase" lists. */
  notes: string;
}

/** A label on one week: “Match week ×2”, “Deload”, “Autumn break”. */
export interface WeekNote {
  seasonId: string;
  /** A Monday. */
  weekStart: string;
  label: string;
}

export const periodKindLabels: Record<PeriodKind, string> = { training: "Training", competition: "Competition", break: "Break / recovery" };
export const periodLevelLabels: Record<PeriodLevel, string> = { phase: "Phase", block: "Block" };
export const zoneLabel = (zone: ZoneId) => VELOCITY_ZONES.find((candidate) => candidate.id === zone)?.label ?? zone;

// ---------------------------------------------------------------------------
// Calendar arithmetic

const DAY_MS = 24 * 60 * 60 * 1000;

export function dayNumber(dateKey: string): number {
  const [year, month, day] = dateKey.split("-").map(Number);
  return Date.UTC(year, month - 1, day) / DAY_MS;
}

export function fromDayNumber(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

export function addDays(dateKey: string, days: number): string {
  return fromDayNumber(dayNumber(dateKey) + days);
}

/** The Monday on or before a date. */
export function mondayOf(dateKey: string): string {
  const day = dayNumber(dateKey);
  const weekday = (new Date(day * DAY_MS).getUTCDay() + 6) % 7;
  return fromDayNumber(day - weekday);
}

/** ISO 8601 week number: the week with the year's first Thursday is week 1. */
export function isoWeek(dateKey: string): number {
  const thursday = dayNumber(mondayOf(dateKey)) + 3;
  const year = new Date(thursday * DAY_MS).getUTCFullYear();
  const firstThursday = dayNumber(mondayOf(`${year}-01-04`)) + 3;
  return Math.round((thursday - firstThursday) / 7) + 1;
}

export interface SeasonWeek {
  /** 0-based column on the timeline. */
  index: number;
  /** Monday. */
  start: string;
  /** Sunday. */
  end: string;
  isoWeek: number;
}

export function seasonWeeks(season: Pick<Season, "startsOn" | "weeks">): SeasonWeek[] {
  return Array.from({ length: season.weeks }, (_, index) => {
    const start = addDays(season.startsOn, index * 7);
    return { index, start, end: addDays(start, 6), isoWeek: isoWeek(start) };
  });
}

export function seasonEndsOn(season: Pick<Season, "startsOn" | "weeks">): string {
  return addDays(season.startsOn, season.weeks * 7 - 1);
}

/** Column of the week a date falls in, or null outside the season. */
export function weekIndex(season: Pick<Season, "startsOn" | "weeks">, dateKey: string): number | null {
  const index = Math.floor((dayNumber(dateKey) - dayNumber(season.startsOn)) / 7);
  return index >= 0 && index < season.weeks ? index : null;
}

export function periodEndsOn(period: Pick<Period, "startsOn" | "weeks">): string {
  return addDays(period.startsOn, period.weeks * 7 - 1);
}

/** The columns a period covers, clipped to the season; null if it lies wholly outside. */
export function periodColumns(season: Pick<Season, "startsOn" | "weeks">, period: Pick<Period, "startsOn" | "weeks">): { from: number; to: number } | null {
  const from = Math.round((dayNumber(period.startsOn) - dayNumber(season.startsOn)) / 7);
  const to = from + period.weeks - 1;
  if (to < 0 || from >= season.weeks) return null;
  return { from: Math.max(0, from), to: Math.min(season.weeks - 1, to) };
}

/**
 * Month labels over the week columns. A week belongs to the month its
 * Thursday is in — the ISO rule — so a week is never split between two.
 */
export function monthSpans(season: Pick<Season, "startsOn" | "weeks">): { label: string; from: number; to: number }[] {
  const spans: { key: string; label: string; from: number; to: number }[] = [];
  const format = new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" });
  for (const week of seasonWeeks(season)) {
    const thursday = addDays(week.start, 3);
    const key = thursday.slice(0, 7);
    const last = spans.at(-1);
    if (last?.key === key) last.to = week.index;
    else spans.push({ key, label: format.format(new Date(dayNumber(thursday) * DAY_MS)).replace(".", ""), from: week.index, to: week.index });
  }
  return spans.map(({ label, from, to }) => ({ label, from, to }));
}

// ---------------------------------------------------------------------------
// Periods

/** Periods on one level never overlap — a week is in one phase and one block. */
export function overlapsOnLevel(periods: readonly Period[], candidate: Pick<Period, "id" | "level" | "startsOn" | "weeks">): Period | null {
  const start = dayNumber(candidate.startsOn);
  const end = start + candidate.weeks * 7;
  return periods.find((period) => {
    if (period.id === candidate.id || period.level !== candidate.level) return false;
    const otherStart = dayNumber(period.startsOn);
    return start < otherStart + period.weeks * 7 && otherStart < end;
  }) ?? null;
}

export function periodAt(periods: readonly Period[], level: PeriodLevel, dateKey: string): Period | null {
  const day = dayNumber(dateKey);
  return periods.find((period) => period.level === level && day >= dayNumber(period.startsOn) && day < dayNumber(period.startsOn) + period.weeks * 7) ?? null;
}

/** A drag or a pick on the timeline as a week-aligned span, whichever way it was dragged. */
export function spanFromColumns(season: Pick<Season, "startsOn">, a: number, b: number): { startsOn: string; weeks: number } {
  const from = Math.min(a, b); const to = Math.max(a, b);
  return { startsOn: addDays(season.startsOn, from * 7), weeks: to - from + 1 };
}

/**
 * The widest free span on a level around a column, capped at `max` weeks —
 * where a new period can go without overlapping its neighbours.
 */
export function freeSpanAround(season: Pick<Season, "startsOn" | "weeks">, periods: readonly Period[], level: PeriodLevel, column: number): { from: number; to: number } | null {
  const taken = new Set<number>();
  for (const period of periods) {
    if (period.level !== level) continue;
    const columns = periodColumns(season, period);
    if (columns) for (let index = columns.from; index <= columns.to; index += 1) taken.add(index);
  }
  if (taken.has(column) || column < 0 || column >= season.weeks) return null;
  let from = column; let to = column;
  while (from - 1 >= 0 && !taken.has(from - 1)) from -= 1;
  while (to + 1 < season.weeks && !taken.has(to + 1)) to += 1;
  return { from, to };
}

/** Notes as bullet points: one per non-empty line, any leading dash or bullet removed. */
export function noteLines(notes: string): string[] {
  return notes.split("\n").map((line) => line.replace(/^\s*[-•*]\s*/, "").trim()).filter(Boolean);
}
