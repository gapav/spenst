import { addDays, dayNumber } from "./season";
import type { Match } from "./types";

/**
 * Match days: the labels team-sport S&C plans a week by. A day is MD on a
 * match, MD-n before one and MD+n after one. In a two-match week a day can be
 * both — Thursday after a Wednesday match is MD+1 and MD-2 before Saturday —
 * so it carries the label of the **nearer** match, and when both are equally
 * near the next match wins: preparing for it decides the session (decision
 * 24). The other label goes in `other`, for the tooltip.
 */

/** Days either side of a match that still get a label. Beyond it a day is just a day. */
export const MATCH_DAY_REACH = 7;

/**
 * Two kick-offs this close are a congested fixture: the second comes before
 * the usual recovery from the first is over (Saturday → Wednesday is four
 * days; Sunday → Wednesday is three, exactly 72 hours, and counts).
 */
export const CONGESTION_HOURS = 72;

export interface MatchDayLabel {
  /** `MD`, `MD-3`, `MD+1`. */
  label: string;
  /** The label from the other match, when two are in reach. */
  other: string | null;
  /** The match the label counts from. */
  match: Match;
}

const byDate = (a: Match, b: Match) => a.playedOn.localeCompare(b.playedOn) || (a.kickOff ?? "").localeCompare(b.kickOff ?? "");

export function matchDayLabel(date: string, matches: readonly Match[]): MatchDayLabel | null {
  const day = dayNumber(date);
  let previous: { match: Match; days: number } | null = null;
  let next: { match: Match; days: number } | null = null;
  for (const match of matches) {
    const days = dayNumber(match.playedOn) - day;
    if (days === 0) return { label: "MD", other: null, match };
    if (Math.abs(days) > MATCH_DAY_REACH) continue;
    if (days < 0 && (!previous || -days < previous.days)) previous = { match, days: -days };
    if (days > 0 && (!next || days < next.days)) next = { match, days };
  }
  const before = next && { label: `MD-${next.days}`, match: next.match, days: next.days };
  const after = previous && { label: `MD+${previous.days}`, match: previous.match, days: previous.days };
  if (before && after) {
    const [main, other] = after.days < before.days ? [after, before] : [before, after];
    return { label: main.label, other: other.label, match: main.match };
  }
  const only = before ?? after;
  return only ? { label: only.label, other: null, match: only.match } : null;
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
