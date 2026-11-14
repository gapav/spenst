import { addDays, dayNumber } from "./season";
import type { Match } from "./types";

/**
 * Match days: the labels team-sport S&C plans a week by. A day is MD on a
 * match and MD-n before the next one; days after a match get no MD+ label,
 * because what a day is for is decided by the match coming (decision 25).
 */

/** Days before a match that still get a label. Beyond it a day is just a day. */
export const MATCH_DAY_REACH = 7;

/**
 * Two kick-offs this close are a congested fixture: the second comes before
 * the usual recovery from the first is over (Saturday → Wednesday is four
 * days; Sunday → Wednesday is three, exactly 72 hours, and counts).
 */
export const CONGESTION_HOURS = 72;

export interface MatchDayLabel {
  /** `MD` or `MD-3`. */
  label: string;
  /** The match the label counts towards. */
  match: Match;
}

const byDate = (a: Match, b: Match) => a.playedOn.localeCompare(b.playedOn) || (a.kickOff ?? "").localeCompare(b.kickOff ?? "");

export function matchDayLabel(date: string, matches: readonly Match[]): MatchDayLabel | null {
  const day = dayNumber(date);
  let next: { match: Match; days: number } | null = null;
  for (const match of matches) {
    const days = dayNumber(match.playedOn) - day;
    if (days === 0) return { label: "MD", match };
    if (days > 0 && days <= MATCH_DAY_REACH && (!next || days < next.days)) next = { match, days };
  }
  return next && { label: `MD-${next.days}`, match: next.match };
}

/** The matches from Monday to Sunday of the week starting `weekStart`, in order. */
export function matchesInWeek(weekStart: string, matches: readonly Match[]): Match[] {
  const end = addDays(weekStart, 6);
  return matches.filter((match) => match.playedOn >= weekStart && match.playedOn <= end).sort(byDate);
}

/** Hours between two kick-offs; a missing time counts as the same time of day. */
export function hoursBetween(first: Match, second: Match): number {
  const minutes = (match: Match) => {
    if (!match.kickOff) return 0;
    const [hours, mins] = match.kickOff.split(":").map(Number);
    return hours * 60 + mins;
  };
  const both = first.kickOff && second.kickOff;
  return (dayNumber(second.playedOn) - dayNumber(first.playedOn)) * 24 + (both ? (minutes(second) - minutes(first)) / 60 : 0);
}

/**
 * A congested week: two or more matches in it, or a match in it that comes
 * `CONGESTION_HOURS` or less after the one before (a Sunday match, then
 * Wednesday). The week of the first match is not marked for what follows.
 */
export function isCongestedWeek(weekStart: string, matches: readonly Match[]): boolean {
  const inWeek = matchesInWeek(weekStart, matches);
  if (inWeek.length >= 2) return true;
  if (!inWeek.length) return false;
  const sorted = [...matches].sort(byDate);
  const index = sorted.indexOf(inWeek[0]);
  const before = index > 0 ? sorted[index - 1] : null;
  return before !== null && hoursBetween(before, inWeek[0]) <= CONGESTION_HOURS;
}

export const matchKindLabels: Record<Match["kind"], string> = { league: "League", cup: "Cup", friendly: "Friendly", playoff: "Play-off" };

/** “vs Lyn” at home, “at Lyn” away. */
export const matchTitle = (match: Pick<Match, "home" | "opponent">) => `${match.home ? "vs" : "at"} ${match.opponent}`;
