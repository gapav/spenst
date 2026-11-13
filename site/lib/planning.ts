import { addDays, dayNumber, mondayOf, periodEndsOn, type Period } from "./season";
import { allSlots, describeSetGroup, summarizeContent, type Exercise, type Modality, type SectionKind, type SessionContent } from "./training";
import type { SessionSlot, TrainingSession } from "./types";

/**
 * Planning many weeks at a time: copying, pasting, and reading a block at a
 * glance. All pure; the season plan and the provider do the rest.
 *
 * Copies are independent (decision 24): a copied session keeps no link to the
 * one it came from, so changing week 4 never touches week 3.
 */

type IdFactory = () => string;

// ---------------------------------------------------------------------------
// Copying

/**
 * The same content with every id in it new — sections, slots, set groups and
 * variants — so a copy can be edited without touching the original.
 * Exercise ids are kept: built-in keys are permanent, and a team's own
 * exercises exist in the same team.
 */
export function cloneContent(content: SessionContent, makeId: IdFactory): SessionContent {
  return {
    sections: content.sections.map((section) => ({
      ...section,
      id: makeId(),
      slots: section.slots.map((slot) => ({
        ...slot,
        id: makeId(),
        autoregulation: slot.autoregulation && { ...slot.autoregulation },
        setGroups: slot.setGroups.map((group) => ({ ...structuredClone(group), id: makeId() })),
        variants: slot.variants.map((variant) => ({ ...variant, id: makeId(), setGroups: variant.setGroups.map((group) => ({ ...structuredClone(group), id: makeId() })) })),
      })),
    })),
  };
}

/** Where something goes on the calendar. */
export interface Placement {
  scheduledOn: string;
  slot: SessionSlot | null;
}

/** AM first, then the sessions with no slot, then PM — the order of a day. */
const slotOrder = (slot: SessionSlot | null) => slot === "am" ? 0 : slot === "pm" ? 2 : 1;

export function compareSessions(a: Pick<TrainingSession, "scheduledOn" | "slot" | "title">, b: Pick<TrainingSession, "scheduledOn" | "slot" | "title">): number {
  return (a.scheduledOn ?? "").localeCompare(b.scheduledOn ?? "") || slotOrder(a.slot) - slotOrder(b.slot) || a.title.localeCompare(b.title);
}

/**
 * Pasting several sessions onto one day: the earliest lands on that day and
 * the others keep their distance from it in days, and their AM/PM slot. A
 * Monday AM, a Monday PM and a Thursday pasted on a Wednesday become
 * Wednesday AM, Wednesday PM and Saturday. With an `anchor` (the session
 * that was dragged), that one lands on the target and the rest keep their
 * distance from it.
 */
export function pastePlacements(sources: readonly Pick<TrainingSession, "scheduledOn" | "slot">[], target: string, anchor?: string | null): Placement[] {
  const dated = sources.map((source) => source.scheduledOn).filter((date): date is string => date !== null);
  // A drag moves the selection by how far the dragged session moved; a paste
  // puts the earliest on the target day.
  const first = anchor ? dayNumber(anchor) : dated.length ? Math.min(...dated.map(dayNumber)) : dayNumber(target);
  return sources.map((source) => ({
    scheduledOn: source.scheduledOn ? addDays(target, dayNumber(source.scheduledOn) - first) : target,
    slot: source.slot,
  }));
}

/** Copying a week: each session to the same weekday and slot of the target week. */
export function weekCopyPlacements(sources: readonly Pick<TrainingSession, "scheduledOn" | "slot">[], fromWeek: string, toWeek: string): Placement[] {
  const shift = dayNumber(toWeek) - dayNumber(fromWeek);
  return sources.map((source) => ({ scheduledOn: addDays(source.scheduledOn ?? fromWeek, shift), slot: source.slot }));
}

/** The weeks after `weekStart` up to the end of the period it is in: “copy to the rest of the block”. */
export function restOfPeriodWeeks(weekStart: string, period: Pick<Period, "startsOn" | "weeks">): string[] {
  const weeks: string[] = [];
  const end = periodEndsOn(period);
  for (let week = addDays(mondayOf(weekStart), 7); week <= end; week = addDays(week, 7)) {
    if (week >= period.startsOn) weeks.push(week);
  }
  return weeks;
}

/**
 * The sessions to offer under “Copy of…” for a day: those on the same match
 * day first (MD-2 for an MD-2), then those on the same weekday, then the most
 * recent. Sessions with no date go last.
 */
export function rankCopySources<T extends Pick<TrainingSession, "id" | "scheduledOn" | "title">>(sessions: readonly T[], target: string, matchDay: (date: string) => string | null): T[] {
  const targetLabel = matchDay(target);
  const weekday = (date: string) => (dayNumber(date) % 7 + 7) % 7;
  const score = (session: T) => {
    if (!session.scheduledOn) return 3;
    if (targetLabel && matchDay(session.scheduledOn) === targetLabel) return 0;
    return weekday(session.scheduledOn) === weekday(target) ? 1 : 2;
  };
  return [...sessions].sort((a, b) => score(a) - score(b) || (b.scheduledOn ?? "").localeCompare(a.scheduledOn ?? "") || a.title.localeCompare(b.title));
}

// ---------------------------------------------------------------------------
// Reading a block

export interface WeekSummary {
  sessions: number;
  minutes: number;
  contacts: number;
  /** Sets per modality — the week's mix. */
  modalities: Partial<Record<Modality, number>>;
}

/** What a week holds: sessions, about how long, jump contacts, and its mix of modalities. */
export function weekSummary(sessions: readonly Pick<TrainingSession, "content">[], exercises: ReadonlyMap<string, Pick<Exercise, "modality">>): WeekSummary {
  const summary: WeekSummary = { sessions: sessions.length, minutes: 0, contacts: 0, modalities: {} };
  for (const session of sessions) {
    const one = summarizeContent(session.content, exercises);
    summary.minutes += one.minutes; summary.contacts += one.contacts;
    for (const slot of allSlots(session.content)) {
      const modality = exercises.get(slot.exerciseId)?.modality ?? "strength";
      const sets = slot.setGroups.reduce((total, group) => total + group.count, 0);
      summary.modalities[modality] = (summary.modalities[modality] ?? 0) + sets;
    }
  }
  return summary;
}

/** Section kinds in the order a session runs. */
export const SECTION_ORDER: readonly SectionKind[] = ["prep", "speed", "main", "accessory", "conditioning", "custom"];

export interface MatrixEntry {
  sessionId: string;
  scheduledOn: string;
  /** “3 × 5 · 80 kg”, set groups joined by “, ”. The standard prescription: variants are an in-session choice. */
  text: string;
}

export interface MatrixCell {
  entries: MatrixEntry[];
  /** Different from the week before, which had the exercise too. */
  changed: boolean;
}

export interface MatrixRow {
  exerciseId: string;
  section: SectionKind;
  cells: MatrixCell[];
}

export interface ProgressionMatrix {
  weeks: string[];
  rows: MatrixRow[];
}

/** A prescription without rest: the part that progresses. */
export function prescriptionText(groups: SessionContent["sections"][number]["slots"][number]["setGroups"]): string {
  return groups.map((group) => describeSetGroup({ ...group, restSeconds: undefined })).join(", ");
}

/**
 * The exercise × week view of a block: one row per exercise the sessions use
 * (grouped by the section it first appears in, then by first appearance),
 * one column per week, each cell that week's prescription. A cell is marked
 * changed when it differs from the week before and both have the exercise —
 * so progression, and its absence, stands out.
 */
export function progressionMatrix(weeks: readonly string[], sessions: readonly TrainingSession[]): ProgressionMatrix {
  const columnOf = (date: string) => weeks.indexOf(mondayOf(date));
  const placed = sessions.filter((session) => session.scheduledOn && columnOf(session.scheduledOn) >= 0).sort(compareSessions);
  const rows = new Map<string, { section: SectionKind; first: number; cells: MatrixEntry[][] }>();
  let order = 0;
  for (const session of placed) {
    const column = columnOf(session.scheduledOn as string);
    for (const section of session.content.sections) {
      for (const slot of section.slots) {
        const row = rows.get(slot.exerciseId) ?? { section: section.kind, first: order++, cells: weeks.map(() => []) };
        row.cells[column].push({ sessionId: session.id, scheduledOn: session.scheduledOn as string, text: prescriptionText(slot.setGroups) });
        rows.set(slot.exerciseId, row);
      }
    }
  }
  const signature = (entries: MatrixEntry[]) => entries.map((entry) => entry.text).join(" | ");
  return {
    weeks: [...weeks],
    rows: [...rows].sort(([, a], [, b]) => SECTION_ORDER.indexOf(a.section) - SECTION_ORDER.indexOf(b.section) || a.first - b.first).map(([exerciseId, row]) => ({
      exerciseId,
      section: row.section,
      cells: row.cells.map((entries, index) => {
        const before = index > 0 ? row.cells[index - 1] : [];
        return { entries, changed: entries.length > 0 && before.length > 0 && signature(entries) !== signature(before) };
      }),
    })),
  };
}
