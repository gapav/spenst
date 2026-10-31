import type { SessionContent } from "./training";

/**
 * The single source of domain shapes. Snake_case rows are mapped onto these by
 * the `map*` functions at the top of `components/app-provider.tsx`, the same
 * split Grep uses.
 */

export type TeamRole = "admin" | "coach";
export type SaveState = "saved" | "saving" | "offline" | "error";

/** Youth and adult teams run the same tests; the interpretation switches on this. */
export type Population = "youth" | "adult";
export type Sex = "F" | "M";
export type HandballPosition = "keeper" | "wing" | "back" | "centre" | "pivot";
/** A sided test (split squat jump) stores one value per leg. */
export type Side = "left" | "right";

export interface Profile {
  id: string;
  email: string;
  fullName: string;
  initials: string;
  color: string;
  isGlobalAdmin?: boolean;
}

export interface TeamMember extends Profile {
  teamRole: TeamRole;
}

export interface Team {
  id: string;
  name: string;
  shortName: string;
  population: Population;
  /** The test battery the team tests on: a `builtin:` key or one of its own. */
  batteryId: string;
  logoUrl: string | null;
  /** The signed-in coach's role on this team. */
  role: TeamRole;
  members: TeamMember[];
}

/**
 * An athlete exists on their own and is rostered on one or more teams, so a
 * youth player who also trains with the senior squad has one profile and one
 * history, not two.
 *
 * Privacy-minimized like Grep's roster: the name is kept as “Fornavn E.”, and
 * the birth date only to the month — enough for age bands and the maturity
 * estimate (half a month of error against a model that is ±1 year), not enough
 * to identify a child.
 */
export interface Athlete {
  id: string;
  displayName: string;
  /** `YYYY-MM`. */
  birthMonth: string;
  sex: Sex;
  position: HandballPosition | null;
  teamIds: string[];
  /**
   * Guardian (or adult athlete) consent to store height, sitting height and
   * body mass. Without it the maturity block stays empty and power tests are
   * scored on absolute rather than relative values.
   */
  measurementConsent: boolean;
}

export interface Measurement {
  id: string;
  athleteId: string;
  /** `YYYY-MM-DD`. */
  measuredOn: string;
  heightCm: number;
  sittingHeightCm: number | null;
  bodyMassKg: number;
}

export interface TestDay {
  id: string;
  teamId: string;
  /** `YYYY-MM-DD`. */
  heldOn: string;
  title: string;
  notes: string;
}

/**
 * One value per athlete, test and side on a test day: the coach runs 2–3
 * trials and keeps the best, so the trials themselves are not stored yet.
 */
export interface TestResult {
  id: string;
  testDayId: string;
  athleteId: string;
  testKey: string;
  side: Side | null;
  value: number;
  /** The OVR import that wrote it, so an import can be undone; null when typed by hand. */
  importId?: string | null;
}

export interface ResultInput {
  testDayId: string;
  athleteId: string;
  testKey: string;
  side: Side | null;
  value: number | null;
}

// ---------------------------------------------------------------------------
// Training. The prescription vocabulary is in lib/training.ts, the year plan
// (seasons, phases, blocks, week notes) in lib/season.ts.

export type SessionStatus = "draft" | "published";

/**
 * One session on the team's calendar. Every athlete on the team sees the same
 * session once it is published; variants inside it are how it fits each of
 * them. It belongs to no period: a phase or block is whatever span its date
 * falls in.
 */
export interface TrainingSession {
  id: string;
  teamId: string;
  /** `YYYY-MM-DD`, or null while it is still being placed. */
  scheduledOn: string | null;
  title: string;
  status: SessionStatus;
  content: SessionContent;
}

export type TrainingSessionPatch = Partial<Pick<TrainingSession, "title" | "scheduledOn" | "status">>;

