"use client";

import type { User } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { demoAthletes, demoMeasurements, demoOvrRows as seededOvrRows, demoPeriods, demoResults, demoSeasons, demoMatches, demoSessions, demoTeams, demoTestDays, demoUser, demoWeekNotes } from "@/lib/demo-data";
import { BUILTIN_EXERCISES } from "@/lib/exercise-library";
import { cleanBatteryTests, DEFAULT_BATTERY_ID, type TestBattery } from "@/lib/power-profile";
import { mergeOvrRows, OVR_BUCKET, parseSummary, storageFileName, XLSX_TYPE, type ImportStatus, type ImportSummary, type ImportWrites, type OvrMapping, type OvrRow, type TeamOvrMapping, type TestImport } from "@/lib/ovr-import";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { cleanNewAthlete, type NewAthleteInput } from "@/lib/roster";
import { cleanTeamName } from "@/lib/teams";
import { overlapsOnLevel, periodKindLabels, type Period, type Season, type WeekNote } from "@/lib/season";
import { cloneContent, type Placement } from "@/lib/planning";
import { emptyContent, parseSessionContent, type Exercise, type MetricKey, type Modality, type SessionContent } from "@/lib/training";
import type { Athlete, HandballPosition, Match, Measurement, Population, Profile, ResultInput, SaveState, SessionStatus, Sex, Side, Team, TeamRole, TestDay, TestResult, TrainingSession, TrainingSessionPatch, SessionSlot } from "@/lib/types";
import type { ZoneId } from "@/lib/vbt";
import { initials, makeUuid } from "@/lib/utils";

/**
 * The whole application state and data layer, shaped like Grep’s: pages are
 * thin and read everything through `useSpenst()`; every mutation is an
 * optimistic `setState` followed by `persist(() => supabase…)`; and with no
 * Supabase configured the provider seeds itself from `lib/demo-data.ts` and
 * `persist(null)` is a no-op. Every new mutation must handle that branch.
 */

const SELECTED_TEAM_KEY = "spenst.selected-team";
const SELF_COLOR = "#67467e";
const PEER_COLOR = "#e9ddf7";

type DbMembership = { team_id: string; profile_id: string; role: TeamRole; teams: { id: string; name: string; population: Population; logo_url: string | null; battery_key: string | null } | null; profiles: { id: string; email: string; full_name: string } | null };
type DbAthlete = { id: string; display_name: string; birth_month: string; sex: Sex; position: HandballPosition | null; measurement_consent: boolean; team_athletes: { team_id: string }[] | null };
type DbMeasurement = { id: string; athlete_id: string; measured_on: string; height_cm: number | string; sitting_height_cm: number | string | null; body_mass_kg: number | string };
type DbTestDay = { id: string; team_id: string; held_on: string; title: string; notes: string };
type DbResult = { id: string; test_day_id: string; athlete_id: string; test_key: string; side: "both" | Side; value: number | string; import_id: string | null };
type DbExercise = { id: string; team_id: string; name: string; modality: Modality; metrics: MetricKey[]; unilateral: boolean; velocity_metric: "mean" | "peak" | null; cue: string };
type DbSeason = { id: string; team_id: string; title: string; starts_on: string; weeks: number; throughline: string };
type DbPeriod = { id: string; season_id: string; level: Period["level"]; kind: Period["kind"]; title: string; starts_on: string; weeks: number; emphasis: ZoneId | null; focus: string; notes: string };
type DbWeekNote = { season_id: string; week_start: string; label: string };
type DbSession = { id: string; team_id: string; scheduled_on: string | null; slot: SessionSlot | null; title: string; status: SessionStatus; content: unknown };
type DbMatch = { id: string; team_id: string; played_on: string; kick_off: string | null; opponent: string; home: boolean; kind: Match["kind"]; priority: boolean; note: string };
type DbTestImport = { id: string; team_id: string; file_name: string; file_size: number | string; file_sha256: string | null; file_path: string; status: ImportStatus; summary: unknown; created_at: string };
type DbBattery = { id: string; team_id: string; name: string; description: string; test_keys: string[] };
type DbOvrMapping = { team_id: string; measure_key: string; test_key: string | null; side: Side | null; first_leg: Side | null };
type DbNumber = number | string | null;
type DbOvrRow = {
  id: string; athlete_id: string; import_id: string | null; sheet: OvrRow["sheet"]; side: Side | null; row_key: string; checksum: string; performed_on: string; exercise: string;
  ovr_groups: string; sport: string; position: string; note: string; set_number: number | null; rep_number: number | null; sprint_number: number | null; split_number: number | null;
  load_kg: DbNumber; mean_velocity: DbNumber; peak_velocity: DbNumber; mean_power: DbNumber; peak_power: DbNumber; duration_s: DbNumber; ea_index: DbNumber; rom_cm: DbNumber; tpv_s: DbNumber;
  target_type: string; target_min: DbNumber; target_max: DbNumber; jump_height_cm: DbNumber; contact_time_s: DbNumber; rsi: DbNumber; jump_type: string;
  distance_m: DbNumber; split_time_s: DbNumber; total_time_s: DbNumber; speed_kmh: DbNumber; in_beam_start: boolean | null; trigger_start: boolean | null; extra: unknown;
};
/** Rows per request: well under PostgREST's limits, and an export's worth in a few calls. */
const OVR_BATCH = 500;
const OVR_PAGE = 1000;
type PersistResult = { error: { message: string } | null; status?: number };

/** `Herrer senior · 2026` → `Herrer senior`: the part a sidebar has room for. */
const shortTeamName = (name: string) => name.split("·")[0].trim() || name;

const mapAthlete = (row: DbAthlete): Athlete => ({ id: row.id, displayName: row.display_name, birthMonth: row.birth_month.slice(0, 7), sex: row.sex, position: row.position, measurementConsent: row.measurement_consent, teamIds: (row.team_athletes ?? []).map((link) => link.team_id) });
const mapMeasurement = (row: DbMeasurement): Measurement => ({ id: row.id, athleteId: row.athlete_id, measuredOn: row.measured_on, heightCm: Number(row.height_cm), sittingHeightCm: row.sitting_height_cm === null ? null : Number(row.sitting_height_cm), bodyMassKg: Number(row.body_mass_kg) });
const mapTestDay = (row: DbTestDay): TestDay => ({ id: row.id, teamId: row.team_id, heldOn: row.held_on, title: row.title, notes: row.notes });
// The database keys a whole-body result as side 'both' so the unique
// constraint can cover it; the app calls that `null`.
const mapExercise = (row: DbExercise): Exercise => ({ id: row.id, teamId: row.team_id, name: row.name, modality: row.modality, metrics: row.metrics, unilateral: row.unilateral, velocityMetric: row.velocity_metric, cue: row.cue });
const mapSeason = (row: DbSeason): Season => ({ id: row.id, teamId: row.team_id, title: row.title, startsOn: row.starts_on, weeks: row.weeks, throughline: row.throughline });
const mapPeriod = (row: DbPeriod): Period => ({ id: row.id, seasonId: row.season_id, level: row.level, kind: row.kind, title: row.title, startsOn: row.starts_on, weeks: row.weeks, emphasis: row.emphasis, focus: row.focus, notes: row.notes });
const periodRow = (period: Period) => ({ id: period.id, season_id: period.seasonId, level: period.level, kind: period.kind, title: period.title, starts_on: period.startsOn, weeks: period.weeks, emphasis: period.emphasis, focus: period.focus, notes: period.notes });
// Content is JSON from the database: checked, never trusted.
const mapSession = (row: DbSession): TrainingSession => ({ id: row.id, teamId: row.team_id, scheduledOn: row.scheduled_on, slot: row.slot ?? null, title: row.title, status: row.status, content: parseSessionContent(row.content) });
const sessionRow = (session: TrainingSession, updatedBy: string) => ({ id: session.id, team_id: session.teamId, scheduled_on: session.scheduledOn, slot: session.slot, title: session.title, status: session.status, content: session.content, updated_by: updatedBy });
// Postgres hands a time back as `18:00:00`; the app keeps `18:00`.
const mapMatch = (row: DbMatch): Match => ({ id: row.id, teamId: row.team_id, playedOn: row.played_on, kickOff: row.kick_off ? row.kick_off.slice(0, 5) : null, opponent: row.opponent, home: row.home, kind: row.kind, priority: row.priority, note: row.note });
const matchPatchRow = (patch: Partial<Omit<Match, "id" | "teamId">>) => ({
  ...(patch.playedOn !== undefined ? { played_on: patch.playedOn } : {}), ...(patch.kickOff !== undefined ? { kick_off: patch.kickOff } : {}),
  ...(patch.opponent !== undefined ? { opponent: patch.opponent } : {}), ...(patch.home !== undefined ? { home: patch.home } : {}),
  ...(patch.kind !== undefined ? { kind: patch.kind } : {}), ...(patch.priority !== undefined ? { priority: patch.priority } : {}), ...(patch.note !== undefined ? { note: patch.note } : {}),
});
const mapTestImport = (row: DbTestImport): TestImport => ({ id: row.id, teamId: row.team_id, fileName: row.file_name, fileSize: Number(row.file_size), fileSha256: row.file_sha256, filePath: row.file_path, status: row.status, summary: parseSummary(row.summary), createdAt: row.created_at });
const mapOvrMapping = (row: DbOvrMapping): TeamOvrMapping => ({ teamId: row.team_id, key: row.measure_key, testKey: (row.test_key as TeamOvrMapping["testKey"]) ?? null, side: row.side, firstLeg: row.first_leg ?? null });
const dbNumber = (value: DbNumber) => value === null || value === "" ? null : Number(value);
const mapOvrRow = (row: DbOvrRow): OvrRow => ({
  id: row.id, athleteId: row.athlete_id, importId: row.import_id, sheet: row.sheet, side: row.side ?? null, rowKey: row.row_key, checksum: row.checksum, performedOn: row.performed_on, exercise: row.exercise,
  groups: row.ovr_groups, sport: row.sport, position: row.position, note: row.note, setNumber: row.set_number, repNumber: row.rep_number, sprintNumber: row.sprint_number, splitNumber: row.split_number,
  loadKg: dbNumber(row.load_kg), meanVelocity: dbNumber(row.mean_velocity), peakVelocity: dbNumber(row.peak_velocity), meanPower: dbNumber(row.mean_power), peakPower: dbNumber(row.peak_power),
  durationS: dbNumber(row.duration_s), eaIndex: dbNumber(row.ea_index), romCm: dbNumber(row.rom_cm), tpvS: dbNumber(row.tpv_s), targetType: row.target_type, targetMin: dbNumber(row.target_min), targetMax: dbNumber(row.target_max),
  jumpHeightCm: dbNumber(row.jump_height_cm), contactTimeS: dbNumber(row.contact_time_s), rsi: dbNumber(row.rsi), jumpType: row.jump_type,
  distanceM: dbNumber(row.distance_m), splitTimeS: dbNumber(row.split_time_s), totalTimeS: dbNumber(row.total_time_s), speedKmh: dbNumber(row.speed_kmh), inBeamStart: row.in_beam_start, triggerStart: row.trigger_start,
  extra: row.extra && typeof row.extra === "object" ? Object.fromEntries(Object.entries(row.extra as Record<string, unknown>).map(([key, value]) => [key, String(value)])) : {},
});
const ovrRowPayload = (row: OvrRow) => ({
  athlete_id: row.athleteId, sheet: row.sheet, side: row.side, row_key: row.rowKey, checksum: row.checksum, performed_on: row.performedOn, exercise: row.exercise,
  ovr_groups: row.groups, sport: row.sport, position: row.position, note: row.note, set_number: row.setNumber, rep_number: row.repNumber, sprint_number: row.sprintNumber, split_number: row.splitNumber,
  load_kg: row.loadKg, mean_velocity: row.meanVelocity, peak_velocity: row.peakVelocity, mean_power: row.meanPower, peak_power: row.peakPower, duration_s: row.durationS, ea_index: row.eaIndex, rom_cm: row.romCm, tpv_s: row.tpvS,
  target_type: row.targetType, target_min: row.targetMin, target_max: row.targetMax, jump_height_cm: row.jumpHeightCm, contact_time_s: row.contactTimeS, rsi: row.rsi, jump_type: row.jumpType,
  distance_m: row.distanceM, split_time_s: row.splitTimeS, total_time_s: row.totalTimeS, speed_kmh: row.speedKmh, in_beam_start: row.inBeamStart, trigger_start: row.triggerStart, extra: row.extra,
});
const mapResult = (row: DbResult): TestResult => ({ id: row.id, testDayId: row.test_day_id, athleteId: row.athlete_id, testKey: row.test_key, side: row.side === "both" ? null : row.side, value: Number(row.value), importId: row.import_id ?? null });

function readSelectedTeamId(): string | null {
  try { return window.localStorage.getItem(SELECTED_TEAM_KEY); } catch { return null; }
}
function rememberSelectedTeamId(id: string) {
  try { window.localStorage.setItem(SELECTED_TEAM_KEY, id); } catch { /* the choice just will not survive a reload */ }
}

function profileFromUser(user: User): Profile {
  const fullName = String(user.user_metadata?.full_name ?? user.email?.split("@")[0] ?? "Coach");
  return { id: user.id, email: user.email ?? "", fullName, initials: initials(fullName), color: SELF_COLOR };
}

interface SpenstContextValue {
  user: Profile | null;
  authLoading: boolean;
  /** Latches once the first workspace load has settled, success or not. */
  workspaceLoaded: boolean;
  isDemoMode: boolean;
  teams: Team[];
  currentTeam: Team | null;
  athletes: Athlete[];
  measurements: Measurement[];
  testDays: TestDay[];
  results: TestResult[];
  saveState: SaveState;
  notice: string | null;
  sidebarCollapsed: boolean;
  setSidebarCollapsed(collapsed: boolean): void;
  setCurrentTeamId(id: string): void;
  clearNotice(): void;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  /**
   * A new team with the signed-in user as its admin, switched to and handed
   * back by id. Global admins only, as `create_team` enforces.
   */
  createTeam(input: { name: string; population: Population }): Promise<string>;
  /**
   * Adds an athlete to the current team — the name minimized to “Firstname L.”
   * — and hands back their id. Team admins only, as `add_athlete` enforces.
   */
  addAthlete(input: NewAthleteInput): Promise<string>;
  /**
   * Name, birth month, sex, position and consent. Withdrawing consent deletes
   * the athlete's measurements (the database trigger does the same).
   */
  updateAthlete(id: string, input: NewAthleteInput): Promise<void>;
  /** Takes the athlete off one team; their history stays with their other teams. */
  removeAthleteFromTeam(id: string, teamId: string): Promise<void>;
  /** Deletes the athlete and everything about them. Admins of all their teams only. */
  deleteAthlete(id: string): Promise<void>;
  /** Starts a test day on the current team and hands back its id. */
  createTestDay(input: { title: string; heldOn: string }): Promise<string>;
  /** Writes one value; `value: null` clears it. */
  saveResult(input: ResultInput): Promise<void>;
  /** The built-in library followed by the teams' own exercises. */
  exercises: Exercise[];
  exerciseById: ReadonlyMap<string, Exercise>;
  seasons: Season[];
  periods: Period[];
  weekNotes: WeekNote[];
  sessions: TrainingSession[];
  /** Starts a season plan on the current team and hands back its id. */
  createSeason(input: { title: string; startsOn: string; weeks: number }): Promise<string>;
  updateSeason(id: string, patch: Partial<Pick<Season, "title" | "throughline">>): Promise<void>;
  /** Refuses a period that overlaps another on the same level. */
  createPeriod(input: Omit<Period, "id">): Promise<string>;
  updatePeriod(id: string, patch: Partial<Omit<Period, "id" | "seasonId">>): Promise<void>;
  deletePeriod(id: string): Promise<void>;
  /** An empty label removes the note. */
  setWeekNote(seasonId: string, weekStart: string, label: string): Promise<void>;
  /** Starts a session on the current team and hands back its id. */
  createSession(input: { title: string; scheduledOn: string | null; slot?: SessionSlot | null }): Promise<string>;
  /**
   * Independent copies (decision 24): each source to its placement, as a
   * draft with every content id new, in one insert. Hands back the new ids,
   * in the order given.
   */
  copySessions(items: { source: TrainingSession; placement: Placement }[]): Promise<string[]>;
  /** Moves sessions to new days and slots, all or none (`move_sessions`). */
  moveSessions(moves: { id: string; scheduledOn: string | null; slot: SessionSlot | null }[]): Promise<void>;
  /** Deletes many at once; hands back what was deleted, for an undo. */
  deleteSessions(ids: string[]): Promise<TrainingSession[]>;
  /** Puts deleted sessions back as they were — the undo of `deleteSessions`. */
  restoreSessions(sessions: TrainingSession[]): Promise<void>;
  matches: Match[];
  /** A match on the current team; hands back its id. */
  createMatch(input: Omit<Match, "id" | "teamId">): Promise<string>;
  updateMatch(id: string, patch: Partial<Omit<Match, "id" | "teamId">>): Promise<void>;
  deleteMatch(id: string): Promise<void>;
  updateSession(id: string, patch: TrainingSessionPatch): Promise<void>;
  /** Publish or unpublish many at once — a whole block’s sessions. */
  setSessionsStatus(ids: string[], status: SessionStatus): Promise<void>;
  /**
   * Applies `edit` to the session’s latest content and saves the result whole.
   * Saves for one session are queued, so a slow request can never land after
   * a newer one and overwrite it.
   */
  editSessionContent(id: string, edit: (content: SessionContent) => SessionContent): Promise<void>;
  deleteSession(id: string): Promise<void>;
  /** The teams' own test batteries; the built-ins are in `lib/power-profile.ts`. */
  customBatteries: TestBattery[];
  /** The team's test battery: a team setting, for its admins. */
  setTeamBattery(teamId: string, batteryId: string): Promise<void>;
  /** Creates or updates one of a team's own batteries and hands back its id. */
  saveBattery(battery: Omit<TestBattery, "id"> & { id?: string }): Promise<string>;
  /** Deletes one; a team using it falls back to the default. */
  deleteBattery(id: string): Promise<void>;
  /** OVR exports imported on the coach's teams, newest first. */
  testImports: TestImport[];
  ovrMappings: TeamOvrMapping[];
  /**
   * Stores the OVR file, then writes what the import plan chose — test days
   * for dates without one, results, every OVR row — each tagged with the
   * import, and remembers the exercise mappings for the team.
   */
  importOvr(input: { file: File; sha256: string; writes: ImportWrites; rows: OvrRow[]; mappings: OvrMapping[]; matches: Record<string, string>; exportedAt: string | null }): Promise<TestImport>;
  /** Every stored OVR row for an athlete, newest first. Fetched on demand: a season of reps is too much to load with everything else. */
  loadOvrRows(athleteId: string): Promise<OvrRow[]>;
  /** The OVR rows of a squad on one day — what a test day's results came from. */
  loadOvrRowsForDay(athleteIds: string[], date: string): Promise<OvrRow[]>;
  /** Bumps after an import or undo, so anything showing OVR rows knows to fetch again. */
  ovrRowsVersion: number;
  /** Removes what an import wrote, and the test days it made that are left empty. The file stays. */
  undoImport(id: string): Promise<void>;
  /** A short-lived link to download the stored file. */
  importFileUrl(id: string): Promise<string>;
}

const SpenstContext = createContext<SpenstContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [user, setUser] = useState<Profile | null>(() => isSupabaseConfigured ? null : demoUser);
  const [authLoading, setAuthLoading] = useState(isSupabaseConfigured);
  const [workspaceLoaded, setWorkspaceLoaded] = useState(!isSupabaseConfigured);
  const [teams, setTeams] = useState<Team[]>(() => isSupabaseConfigured ? [] : structuredClone(demoTeams));
  const [currentTeamId, setCurrentTeamId] = useState<string | null>(null);
  const [athletes, setAthletes] = useState<Athlete[]>(() => isSupabaseConfigured ? [] : structuredClone(demoAthletes));
  const [measurements, setMeasurements] = useState<Measurement[]>(() => isSupabaseConfigured ? [] : structuredClone(demoMeasurements));
  const [testDays, setTestDays] = useState<TestDay[]>(() => isSupabaseConfigured ? [] : structuredClone(demoTestDays));
  const [results, setResults] = useState<TestResult[]>(() => isSupabaseConfigured ? [] : structuredClone(demoResults));
  const [customExercises, setCustomExercises] = useState<Exercise[]>([]);
  const [seasons, setSeasons] = useState<Season[]>(() => isSupabaseConfigured ? [] : structuredClone(demoSeasons));
  const [periods, setPeriods] = useState<Period[]>(() => isSupabaseConfigured ? [] : structuredClone(demoPeriods));
  const [weekNotes, setWeekNotes] = useState<WeekNote[]>(() => isSupabaseConfigured ? [] : structuredClone(demoWeekNotes));
  const [sessions, setSessions] = useState<TrainingSession[]>(() => isSupabaseConfigured ? [] : structuredClone(demoSessions));
  const [matches, setMatches] = useState<Match[]>(() => isSupabaseConfigured ? [] : structuredClone(demoMatches));
  const [testImports, setTestImports] = useState<TestImport[]>([]);
  const [ovrMappings, setOvrMappings] = useState<TeamOvrMapping[]>([]);
  const [customBatteries, setCustomBatteries] = useState<TestBattery[]>([]);
  // Demo mode keeps imported rows here; with Supabase they are fetched per athlete.
  const [demoOvrRows, setDemoOvrRows] = useState<OvrRow[]>(() => isSupabaseConfigured ? [] : structuredClone(seededOvrRows));
  const demoOvrRowsRef = useRef(demoOvrRows);
  useEffect(() => { demoOvrRowsRef.current = demoOvrRows; }, [demoOvrRows]);
  const [ovrRowsVersion, setOvrRowsVersion] = useState(0);
  // The latest sessions, for edits that must build on what is on screen now
  // rather than on the render that created the callback.
  const sessionsRef = useRef(sessions);
  useEffect(() => { sessionsRef.current = sessions; }, [sessions]);
  const sessionSaves = useRef(new Map<string, Promise<void>>());
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [notice, setNotice] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // The remembered team is read after mount, never during render, so the
  // server and the first client render agree.
  useEffect(() => {
    const restore = () => { const remembered = readSelectedTeamId(); if (remembered) setCurrentTeamId(remembered); };
    restore();
  }, []);

  const currentTeam = teams.find((team) => team.id === currentTeamId) ?? teams[0] ?? null;
  const selectTeam = useCallback((id: string) => { setCurrentTeamId(id); rememberSelectedTeamId(id); }, []);

  /** Refetches everything the signed-in coach can see, in one parallel batch. */
  const loadPrivateData = useCallback(async (authUser: User) => {
    if (!supabase) return;
    const [{ data: membershipRows }, { data: athleteRows }, { data: measurementRows }, { data: dayRows }, { data: resultRows }, { data: profileRow }, { data: exerciseRows }, { data: seasonRows }, { data: periodRows }, { data: weekNoteRows }, { data: sessionRows }, { data: importRows }, { data: mappingRows }, { data: batteryRows }, { data: matchRows }] = await Promise.all([
      supabase.from("team_memberships").select("team_id, profile_id, role, teams(id, name, population, logo_url, battery_key), profiles(id, email, full_name)"),
      supabase.from("athletes").select("id, display_name, birth_month, sex, position, measurement_consent, team_athletes(team_id)").order("display_name"),
      supabase.from("athlete_measurements").select("id, athlete_id, measured_on, height_cm, sitting_height_cm, body_mass_kg"),
      supabase.from("test_days").select("id, team_id, held_on, title, notes").order("held_on", { ascending: false }),
      supabase.from("test_results").select("id, test_day_id, athlete_id, test_key, side, value, import_id"),
      supabase.from("profiles").select("id, email, full_name, is_global_admin").eq("id", authUser.id).single(),
      supabase.from("exercises").select("id, team_id, name, modality, metrics, unilateral, velocity_metric, cue").is("archived_at", null).order("name"),
      supabase.from("seasons").select("id, team_id, title, starts_on, weeks, throughline").order("starts_on", { ascending: false }),
      supabase.from("periods").select("id, season_id, level, kind, title, starts_on, weeks, emphasis, focus, notes"),
      supabase.from("week_notes").select("season_id, week_start, label"),
      supabase.from("sessions").select("id, team_id, scheduled_on, slot, title, status, content"),
      supabase.from("test_imports").select("id, team_id, file_name, file_size, file_sha256, file_path, status, summary, created_at").order("created_at", { ascending: false }),
      supabase.from("ovr_mappings").select("team_id, measure_key, test_key, side, first_leg"),
      supabase.from("test_batteries").select("id, team_id, name, description, test_keys").order("name"),
      supabase.from("matches").select("id, team_id, played_on, kick_off, opponent, home, kind, priority, note").order("played_on"),
    ]);
    if (profileRow) setUser({ id: profileRow.id, email: profileRow.email, fullName: profileRow.full_name, initials: initials(profileRow.full_name), color: SELF_COLOR, isGlobalAdmin: profileRow.is_global_admin });
    if (membershipRows) {
      const grouped = new Map<string, Team>();
      for (const row of membershipRows as unknown as DbMembership[]) {
        if (!row.teams) continue;
        const team = grouped.get(row.team_id) ?? { id: row.team_id, name: row.teams.name, shortName: shortTeamName(row.teams.name), population: row.teams.population, batteryId: row.teams.battery_key ?? DEFAULT_BATTERY_ID, logoUrl: row.teams.logo_url, role: "coach" as TeamRole, members: [] };
        if (row.profile_id === authUser.id) team.role = row.role;
        if (row.profiles && !team.members.some((member) => member.id === row.profile_id)) {
          team.members.push({ id: row.profiles.id, email: row.profiles.email, fullName: row.profiles.full_name, initials: initials(row.profiles.full_name), color: row.profile_id === authUser.id ? SELF_COLOR : PEER_COLOR, teamRole: row.role });
        }
        grouped.set(row.team_id, team);
      }
      setTeams([...grouped.values()]);
    }
    if (athleteRows) setAthletes((athleteRows as unknown as DbAthlete[]).map(mapAthlete));
    if (measurementRows) setMeasurements((measurementRows as unknown as DbMeasurement[]).map(mapMeasurement));
    if (dayRows) setTestDays((dayRows as unknown as DbTestDay[]).map(mapTestDay));
    if (resultRows) setResults((resultRows as unknown as DbResult[]).map(mapResult));
    // A missing table — the migration not yet applied by hand — reads as "none yet".
    if (exerciseRows) setCustomExercises((exerciseRows as unknown as DbExercise[]).map(mapExercise));
    if (seasonRows) setSeasons((seasonRows as unknown as DbSeason[]).map(mapSeason));
    if (periodRows) setPeriods((periodRows as unknown as DbPeriod[]).map(mapPeriod));
    if (weekNoteRows) setWeekNotes((weekNoteRows as unknown as DbWeekNote[]).map((row) => ({ seasonId: row.season_id, weekStart: row.week_start, label: row.label })));
    if (sessionRows) setSessions((sessionRows as unknown as DbSession[]).map(mapSession));
    if (matchRows) setMatches((matchRows as unknown as DbMatch[]).map(mapMatch));
    if (importRows) setTestImports((importRows as unknown as DbTestImport[]).map(mapTestImport));
    if (batteryRows) setCustomBatteries((batteryRows as unknown as DbBattery[]).map((row) => ({ id: row.id, teamId: row.team_id, name: row.name, description: row.description, tests: cleanBatteryTests(row.test_keys) })));
    if (mappingRows) setOvrMappings((mappingRows as unknown as DbOvrMapping[]).map(mapOvrMapping));
  }, [supabase]);

  useEffect(() => {
    if (!supabase) return;
    const settle = (authUser: User | null) => {
      setAuthLoading(false);
      if (!authUser) { setWorkspaceLoaded(true); return; }
      // `finally`: a failed load still settles, or a waiting page spins for ever.
      void loadPrivateData(authUser).finally(() => setWorkspaceLoaded(true));
    };
    void supabase.auth.getUser().then(({ data }) => {
      setUser(data.user ? profileFromUser(data.user) : null);
      settle(data.user ?? null);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      setUser((current) => session?.user ? current?.id === session.user.id ? current : profileFromUser(session.user) : null);
      settle(session?.user ?? null);
    });
    return () => { listener.subscription.unsubscribe(); };
  }, [loadPrivateData, supabase]);

  useEffect(() => {
    const online = () => setSaveState("saved");
    const offline = () => setSaveState("offline");
    window.addEventListener("online", online); window.addEventListener("offline", offline);
    return () => { window.removeEventListener("online", online); window.removeEventListener("offline", offline); };
  }, []);

  const persist = useCallback(async (operation: (() => PromiseLike<PersistResult>) | null) => {
    if (!operation) { setSaveState("saved"); return; }
    setSaveState("saving");
    const result = await operation();
    if (result.error) {
      console.error("[spenst] the save failed", result.error);
      // No status means no server answered: the write may well have landed.
      const lost = !result.status;
      const message = lost ? "Lost the connection. Check the network and try again." : "The change wasn’t saved.";
      setSaveState(lost ? "offline" : "error"); setNotice(message); throw new Error(message);
    }
    setSaveState("saved");
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) { setUser(demoUser); setNotice("Demo mode — any password opens the demo."); return; }
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error("Wrong email address or password.");
  }, [supabase]);

  const signOut = useCallback(async () => {
    if (supabase) await supabase.auth.signOut();
    setUser(supabase ? null : demoUser);
    if (supabase) { setTeams([]); setAthletes([]); setMeasurements([]); setTestDays([]); setResults([]); setCustomExercises([]); setSeasons([]); setPeriods([]); setWeekNotes([]); setSessions([]); setMatches([]); setTestImports([]); setOvrMappings([]); setCustomBatteries([]); }
  }, [supabase]);

  // Not optimistic: `create_team` mints the id and the admin membership in one
  // transaction, so the team joins the list once the server has it.
  const createTeam = useCallback(async (input: { name: string; population: Population }) => {
    if (!user) throw new Error("Sign in first.");
    if (!user.isGlobalAdmin) throw new Error("Only the system administrator can create teams.");
    const cleaned = cleanTeamName(input.name);
    if ("problem" in cleaned) throw new Error(cleaned.problem);
    let id = makeUuid();
    await persist(supabase && (async () => {
      const result = await supabase.rpc("create_team", { team_name: cleaned.name, team_population: input.population });
      if (!result.error) id = result.data as string;
      return result;
    }));
    const team: Team = { id, name: cleaned.name, shortName: shortTeamName(cleaned.name), population: input.population, batteryId: DEFAULT_BATTERY_ID, logoUrl: null, role: "admin", members: [{ ...user, color: SELF_COLOR, teamRole: "admin" }] };
    setTeams((current) => [...current, team]);
    selectTeam(id);
    return id;
  }, [persist, selectTeam, supabase, user]);

  // Not optimistic, like createTeam: `add_athlete` mints the id and the roster
  // row together, and the database has the last word on name and age.
  const addAthlete = useCallback(async (input: NewAthleteInput) => {
    if (!user || !currentTeam) throw new Error("Choose a team first.");
    if (currentTeam.role !== "admin") throw new Error("Only a team admin can add athletes.");
    const cleaned = cleanNewAthlete(input, new Date());
    if ("problem" in cleaned) throw new Error(cleaned.problem);
    let id = makeUuid();
    await persist(supabase && (async () => {
      const result = await supabase.rpc("add_athlete", { target_team_id: currentTeam.id, athlete_name: cleaned.name, athlete_birth_month: `${cleaned.birthMonth}-01`, athlete_sex: cleaned.sex, athlete_position: cleaned.position, consent: cleaned.measurementConsent });
      if (!result.error) id = result.data as string;
      return result;
    }));
    const athlete: Athlete = { id, displayName: cleaned.name, birthMonth: cleaned.birthMonth, sex: cleaned.sex, position: cleaned.position, teamIds: [currentTeam.id], measurementConsent: cleaned.measurementConsent };
    setAthletes((current) => [...current, athlete].sort((a, b) => a.displayName.localeCompare(b.displayName, "en-GB")));
    return id;
  }, [currentTeam, persist, supabase, user]);

  const updateAthlete = useCallback(async (id: string, input: NewAthleteInput) => {
    const previous = athletes.find((athlete) => athlete.id === id);
    if (!previous) throw new Error("No such athlete.");
    const cleaned = cleanNewAthlete(input, new Date());
    if ("problem" in cleaned) throw new Error(cleaned.problem);
    const next: Athlete = { ...previous, displayName: cleaned.name, birthMonth: cleaned.birthMonth, sex: cleaned.sex, position: cleaned.position, measurementConsent: cleaned.measurementConsent };
    const dropped = previous.measurementConsent && !next.measurementConsent ? measurements.filter((measurement) => measurement.athleteId === id) : [];
    setAthletes((current) => current.map((athlete) => athlete.id === id ? next : athlete));
    if (dropped.length) setMeasurements((current) => current.filter((measurement) => measurement.athleteId !== id));
    try {
      await persist(supabase && (() => supabase.from("athletes").update({ display_name: next.displayName, birth_month: `${next.birthMonth}-01`, sex: next.sex, position: next.position, measurement_consent: next.measurementConsent }).eq("id", id)));
    } catch (error) {
      setAthletes((current) => current.map((athlete) => athlete.id === id ? previous : athlete));
      if (dropped.length) setMeasurements((current) => [...current, ...dropped]);
      throw error;
    }
  }, [athletes, measurements, persist, supabase]);

  const removeAthleteFromTeam = useCallback(async (id: string, teamId: string) => {
    setAthletes((current) => current.map((athlete) => athlete.id === id ? { ...athlete, teamIds: athlete.teamIds.filter((candidate) => candidate !== teamId) } : athlete));
    try {
      await persist(supabase && (() => supabase.from("team_athletes").delete().eq("athlete_id", id).eq("team_id", teamId)));
    } catch (error) {
      setAthletes((current) => current.map((athlete) => athlete.id === id && !athlete.teamIds.includes(teamId) ? { ...athlete, teamIds: [...athlete.teamIds, teamId] } : athlete));
      throw error;
    }
  }, [persist, supabase]);

  const deleteAthlete = useCallback(async (id: string) => {
    const athlete = athletes.find((candidate) => candidate.id === id);
    if (!athlete) throw new Error("No such athlete.");
    const theirResults = results.filter((result) => result.athleteId === id);
    const theirMeasurements = measurements.filter((measurement) => measurement.athleteId === id);
    setAthletes((current) => current.filter((candidate) => candidate.id !== id));
    setResults((current) => current.filter((result) => result.athleteId !== id));
    setMeasurements((current) => current.filter((measurement) => measurement.athleteId !== id));
    try {
      await persist(supabase && (() => supabase.rpc("delete_athlete", { target_athlete_id: id })));
    } catch (error) {
      setAthletes((current) => [...current, athlete].sort((a, b) => a.displayName.localeCompare(b.displayName, "en-GB")));
      setResults((current) => [...current, ...theirResults]);
      setMeasurements((current) => [...current, ...theirMeasurements]);
      throw error;
    }
    if (!supabase) setDemoOvrRows((current) => current.filter((row) => row.athleteId !== id));
    setOvrRowsVersion((version) => version + 1);
  }, [athletes, measurements, persist, results, supabase]);

  const createTestDay = useCallback(async (input: { title: string; heldOn: string }) => {
    if (!user || !currentTeam) throw new Error("Choose a team first");
    const day: TestDay = { id: makeUuid(), teamId: currentTeam.id, heldOn: input.heldOn, title: input.title.trim() || "Test day", notes: "" };
    setTestDays((current) => [day, ...current]);
    try {
      await persist(supabase && (() => supabase.from("test_days").insert({ id: day.id, team_id: day.teamId, held_on: day.heldOn, title: day.title, notes: day.notes, created_by: user.id })));
    } catch (error) {
      setTestDays((current) => current.filter((candidate) => candidate.id !== day.id));
      throw error;
    }
    return day.id;
  }, [currentTeam, persist, supabase, user]);

  const saveResult = useCallback(async (input: ResultInput) => {
    if (!user) throw new Error("Sign in to record results");
    const same = (result: TestResult) => result.testDayId === input.testDayId && result.athleteId === input.athleteId && result.testKey === input.testKey && result.side === input.side;
    const previous = results.find(same);
    const value = input.value;
    setResults((current) => {
      const rest = current.filter((result) => !same(result));
      return value === null ? rest : [...rest, { id: previous?.id ?? makeUuid(), testDayId: input.testDayId, athleteId: input.athleteId, testKey: input.testKey, side: input.side, value }];
    });
    const side = input.side ?? "both";
    try {
      await persist(supabase && (() => value === null
        ? supabase.from("test_results").delete().match({ test_day_id: input.testDayId, athlete_id: input.athleteId, test_key: input.testKey, side })
        : supabase.from("test_results").upsert({ test_day_id: input.testDayId, athlete_id: input.athleteId, test_key: input.testKey, side, value, recorded_by: user.id }, { onConflict: "test_day_id,athlete_id,test_key,side" })));
    } catch (error) {
      setResults((current) => [...current.filter((result) => !same(result)), ...(previous ? [previous] : [])]);
      throw error;
    }
  }, [persist, results, supabase, user]);

  const exercises = useMemo(() => [...BUILTIN_EXERCISES, ...customExercises], [customExercises]);
  const exerciseById = useMemo(() => new Map(exercises.map((exercise) => [exercise.id, exercise])), [exercises]);

  const createSeason = useCallback(async (input: { title: string; startsOn: string; weeks: number }) => {
    if (!user || !currentTeam) throw new Error("Choose a team first");
    const season: Season = { id: makeUuid(), teamId: currentTeam.id, title: input.title.trim() || "Season", startsOn: input.startsOn, weeks: input.weeks, throughline: "" };
    setSeasons((current) => [season, ...current]);
    try {
      await persist(supabase && (() => supabase.from("seasons").insert({ id: season.id, team_id: season.teamId, title: season.title, starts_on: season.startsOn, weeks: season.weeks, throughline: "", created_by: user.id })));
    } catch (error) {
      setSeasons((current) => current.filter((candidate) => candidate.id !== season.id));
      throw error;
    }
    return season.id;
  }, [currentTeam, persist, supabase, user]);

  const updateSeason = useCallback(async (id: string, patch: Partial<Pick<Season, "title" | "throughline">>) => {
    const previous = seasons.find((season) => season.id === id);
    if (!previous) return;
    setSeasons((current) => current.map((season) => season.id === id ? { ...season, ...patch } : season));
    try {
      await persist(supabase && (() => supabase.from("seasons").update(patch).eq("id", id)));
    } catch (error) {
      setSeasons((current) => current.map((season) => season.id === id ? previous : season));
      throw error;
    }
  }, [persist, seasons, supabase]);

  const createPeriod = useCallback(async (input: Omit<Period, "id">) => {
    const period: Period = { ...input, id: makeUuid(), title: input.title.trim() || periodKindLabels[input.kind] };
    const clash = overlapsOnLevel(periods.filter((other) => other.seasonId === period.seasonId), period);
    if (clash) { const message = `Overlaps with “${clash.title}”.`; setNotice(message); throw new Error(message); }
    setPeriods((current) => [...current, period]);
    try {
      await persist(supabase && (() => supabase.from("periods").insert(periodRow(period))));
    } catch (error) {
      setPeriods((current) => current.filter((candidate) => candidate.id !== period.id));
      throw error;
    }
    return period.id;
  }, [periods, persist, supabase]);

  const updatePeriod = useCallback(async (id: string, patch: Partial<Omit<Period, "id" | "seasonId">>) => {
    const previous = periods.find((period) => period.id === id);
    if (!previous) return;
    const next = { ...previous, ...patch };
    const clash = overlapsOnLevel(periods.filter((other) => other.seasonId === next.seasonId), next);
    if (clash) { const message = `Overlaps with “${clash.title}”.`; setNotice(message); throw new Error(message); }
    setPeriods((current) => current.map((period) => period.id === id ? next : period));
    try {
      await persist(supabase && (() => supabase.from("periods").update({ level: next.level, kind: next.kind, title: next.title, starts_on: next.startsOn, weeks: next.weeks, emphasis: next.emphasis, focus: next.focus, notes: next.notes }).eq("id", id)));
    } catch (error) {
      setPeriods((current) => current.map((period) => period.id === id ? previous : period));
      throw error;
    }
  }, [periods, persist, supabase]);

  const deletePeriod = useCallback(async (id: string) => {
    const previous = periods.find((period) => period.id === id);
    setPeriods((current) => current.filter((period) => period.id !== id));
    try {
      await persist(supabase && (() => supabase.from("periods").delete().eq("id", id)));
    } catch (error) {
      if (previous) setPeriods((current) => [...current, previous]);
      throw error;
    }
  }, [periods, persist, supabase]);

  const setWeekNote = useCallback(async (seasonId: string, weekStart: string, label: string) => {
    const previous = weekNotes.find((note) => note.seasonId === seasonId && note.weekStart === weekStart);
    const trimmed = label.trim();
    setWeekNotes((current) => [...current.filter((note) => !(note.seasonId === seasonId && note.weekStart === weekStart)), ...(trimmed ? [{ seasonId, weekStart, label: trimmed }] : [])]);
    try {
      await persist(supabase && (() => trimmed
        ? supabase.from("week_notes").upsert({ season_id: seasonId, week_start: weekStart, label: trimmed }, { onConflict: "season_id,week_start" })
        : supabase.from("week_notes").delete().match({ season_id: seasonId, week_start: weekStart })));
    } catch (error) {
      setWeekNotes((current) => [...current.filter((note) => !(note.seasonId === seasonId && note.weekStart === weekStart)), ...(previous ? [previous] : [])]);
      throw error;
    }
  }, [persist, supabase, weekNotes]);

  const createSession = useCallback(async (input: { title: string; scheduledOn: string | null; slot?: SessionSlot | null }) => {
    if (!user || !currentTeam) throw new Error("Choose a team first");
    const session: TrainingSession = { id: makeUuid(), teamId: currentTeam.id, scheduledOn: input.scheduledOn, slot: input.slot ?? null, title: input.title.trim() || "Session", status: "draft", content: emptyContent() };
    sessionsRef.current = [...sessionsRef.current, session];
    setSessions(sessionsRef.current);
    try {
      await persist(supabase && (() => supabase.from("sessions").insert(sessionRow(session, user.id))));
    } catch (error) {
      setSessions((current) => current.filter((candidate) => candidate.id !== session.id));
      throw error;
    }
    return session.id;
  }, [currentTeam, persist, supabase, user]);

  const updateSession = useCallback(async (id: string, patch: TrainingSessionPatch) => {
    if (!user) throw new Error("Sign in to plan sessions");
    const previous = sessionsRef.current.find((session) => session.id === id);
    if (!previous) return;
    setSessions((current) => current.map((session) => session.id === id ? { ...session, ...patch } : session));
    try {
      await persist(supabase && (() => supabase.from("sessions").update({
        ...(patch.title !== undefined ? { title: patch.title } : {}),
        ...(patch.scheduledOn !== undefined ? { scheduled_on: patch.scheduledOn } : {}),
        ...(patch.slot !== undefined ? { slot: patch.slot } : {}),
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        updated_by: user.id,
      }).eq("id", id)));
    } catch (error) {
      setSessions((current) => current.map((session) => session.id === id ? { ...session, title: previous.title, scheduledOn: previous.scheduledOn, slot: previous.slot, status: previous.status } : session));
      throw error;
    }
  }, [persist, supabase, user]);

  const setSessionsStatus = useCallback(async (ids: string[], status: SessionStatus) => {
    if (!user || !ids.length) return;
    const previous = new Map(sessionsRef.current.filter((session) => ids.includes(session.id)).map((session) => [session.id, session.status]));
    setSessions((current) => current.map((session) => ids.includes(session.id) ? { ...session, status } : session));
    try {
      await persist(supabase && (() => supabase.from("sessions").update({ status, updated_by: user.id }).in("id", ids)));
    } catch (error) {
      setSessions((current) => current.map((session) => previous.has(session.id) ? { ...session, status: previous.get(session.id) as SessionStatus } : session));
      throw error;
    }
  }, [persist, supabase, user]);

  const editSessionContent = useCallback(async (id: string, edit: (content: SessionContent) => SessionContent) => {
    if (!user) throw new Error("Sign in to plan sessions");
    const current = sessionsRef.current.find((session) => session.id === id);
    if (!current) return;
    const content = edit(current.content);
    if (content === current.content) return;
    const next = sessionsRef.current.map((session) => session.id === id ? { ...session, content } : session);
    sessionsRef.current = next;
    setSessions(next);
    // The whole document goes up each time, so the saves for one session run
    // one after another. A failed save leaves the edit on screen and says so;
    // the next edit sends everything again and catches up.
    const previousSave = sessionSaves.current.get(id) ?? Promise.resolve();
    const save = previousSave.catch(() => undefined).then(() => persist(supabase && (() => supabase.from("sessions").update({ content, updated_by: user.id }).eq("id", id))));
    sessionSaves.current.set(id, save);
    await save;
  }, [persist, supabase, user]);

  const deleteSession = useCallback(async (id: string) => {
    const previous = sessionsRef.current.find((session) => session.id === id);
    setSessions((current) => current.filter((session) => session.id !== id));
    try {
      await persist(supabase && (() => supabase.from("sessions").delete().eq("id", id)));
    } catch (error) {
      if (previous) setSessions((current) => [...current, previous]);
      throw error;
    }
  }, [persist, supabase]);

  const copySessions = useCallback(async (items: { source: TrainingSession; placement: Placement }[]) => {
    if (!user) throw new Error("Sign in to plan sessions");
    if (!items.length) return [];
    const copies: TrainingSession[] = items.map(({ source, placement }) => ({
      id: makeUuid(), teamId: source.teamId, scheduledOn: placement.scheduledOn, slot: placement.slot, title: source.title, status: "draft", content: cloneContent(source.content, makeUuid),
    }));
    const ids = new Set(copies.map((copy) => copy.id));
    sessionsRef.current = [...sessionsRef.current, ...copies];
    setSessions(sessionsRef.current);
    try {
      // One insert is one statement: every copy lands, or none does.
      await persist(supabase && (() => supabase.from("sessions").insert(copies.map((copy) => sessionRow(copy, user.id)))));
    } catch (error) {
      setSessions((current) => current.filter((session) => !ids.has(session.id)));
      throw error;
    }
    return copies.map((copy) => copy.id);
  }, [persist, supabase, user]);

  const moveSessions = useCallback(async (moves: { id: string; scheduledOn: string | null; slot: SessionSlot | null }[]) => {
    if (!user) throw new Error("Sign in to plan sessions");
    if (!moves.length) return;
    const target = new Map(moves.map((move) => [move.id, move]));
    const previous = new Map(sessionsRef.current.filter((session) => target.has(session.id)).map((session) => [session.id, { scheduledOn: session.scheduledOn, slot: session.slot }]));
    const apply = (lookup: Map<string, { scheduledOn: string | null; slot: SessionSlot | null }>) => {
      sessionsRef.current = sessionsRef.current.map((session) => { const next = lookup.get(session.id); return next ? { ...session, scheduledOn: next.scheduledOn, slot: next.slot } : session; });
      setSessions(sessionsRef.current);
    };
    apply(target);
    try {
      await persist(supabase && (() => supabase.rpc("move_sessions", { moves: moves.map((move) => ({ id: move.id, scheduled_on: move.scheduledOn, slot: move.slot })) })));
    } catch (error) {
      apply(previous);
      throw error;
    }
  }, [persist, supabase, user]);

  const deleteSessions = useCallback(async (ids: string[]) => {
    const doomed = new Set(ids);
    const removed = sessionsRef.current.filter((session) => doomed.has(session.id));
    if (!removed.length) return [];
    sessionsRef.current = sessionsRef.current.filter((session) => !doomed.has(session.id));
    setSessions(sessionsRef.current);
    try {
      await persist(supabase && (() => supabase.from("sessions").delete().in("id", ids)));
    } catch (error) {
      sessionsRef.current = [...sessionsRef.current, ...removed];
      setSessions(sessionsRef.current);
      throw error;
    }
    return removed;
  }, [persist, supabase]);

  const restoreSessions = useCallback(async (restored: TrainingSession[]) => {
    if (!user) throw new Error("Sign in to plan sessions");
    if (!restored.length) return;
    const ids = new Set(restored.map((session) => session.id));
    sessionsRef.current = [...sessionsRef.current.filter((session) => !ids.has(session.id)), ...restored];
    setSessions(sessionsRef.current);
    try {
      await persist(supabase && (() => supabase.from("sessions").insert(restored.map((session) => sessionRow(session, user.id)))));
    } catch (error) {
      sessionsRef.current = sessionsRef.current.filter((session) => !ids.has(session.id));
      setSessions(sessionsRef.current);
      throw error;
    }
  }, [persist, supabase, user]);

  const createMatch = useCallback(async (input: Omit<Match, "id" | "teamId">) => {
    if (!user || !currentTeam) throw new Error("Choose a team first");
    const match: Match = { ...input, id: makeUuid(), teamId: currentTeam.id, opponent: input.opponent.trim(), note: input.note.trim() };
    if (!match.opponent) throw new Error("Name the opponent.");
    setMatches((current) => [...current, match]);
    try {
      await persist(supabase && (() => supabase.from("matches").insert({ id: match.id, team_id: match.teamId, played_on: match.playedOn, kick_off: match.kickOff, opponent: match.opponent, home: match.home, kind: match.kind, priority: match.priority, note: match.note, created_by: user.id })));
    } catch (error) {
      setMatches((current) => current.filter((entry) => entry.id !== match.id));
      throw error;
    }
    return match.id;
  }, [currentTeam, persist, supabase, user]);

  const updateMatch = useCallback(async (id: string, patch: Partial<Omit<Match, "id" | "teamId">>) => {
    const previous = matches.find((match) => match.id === id);
    if (!previous) return;
    const next = { ...patch, ...(patch.opponent !== undefined ? { opponent: patch.opponent.trim() } : {}), ...(patch.note !== undefined ? { note: patch.note.trim() } : {}) };
    if (next.opponent === "") throw new Error("Name the opponent.");
    setMatches((current) => current.map((match) => match.id === id ? { ...match, ...next } : match));
    try {
      await persist(supabase && (() => supabase.from("matches").update(matchPatchRow(next)).eq("id", id)));
    } catch (error) {
      setMatches((current) => current.map((match) => match.id === id ? previous : match));
      throw error;
    }
  }, [matches, persist, supabase]);

  const deleteMatch = useCallback(async (id: string) => {
    const previous = matches.find((match) => match.id === id);
    setMatches((current) => current.filter((match) => match.id !== id));
    try {
      await persist(supabase && (() => supabase.from("matches").delete().eq("id", id)));
    } catch (error) {
      if (previous) setMatches((current) => [...current, previous]);
      throw error;
    }
  }, [matches, persist, supabase]);

  const setTeamBattery = useCallback(async (teamId: string, batteryId: string) => {
    const previous = teams.find((team) => team.id === teamId)?.batteryId;
    setTeams((current) => current.map((team) => team.id === teamId ? { ...team, batteryId } : team));
    try {
      await persist(supabase && (() => supabase.from("teams").update({ battery_key: batteryId }).eq("id", teamId)));
    } catch (error) {
      setTeams((current) => current.map((team) => team.id === teamId && previous ? { ...team, batteryId: previous } : team));
      throw error;
    }
  }, [persist, supabase, teams]);

  const saveBattery = useCallback(async (input: Omit<TestBattery, "id"> & { id?: string }) => {
    if (!user || !input.teamId) throw new Error("Choose a team first");
    const battery: TestBattery = { ...input, id: input.id ?? makeUuid(), name: input.name.trim() || "Test battery", description: input.description.trim(), tests: cleanBatteryTests(input.tests) };
    if (!battery.tests.length) throw new Error("A battery needs at least one test.");
    const previous = customBatteries.find((entry) => entry.id === battery.id);
    setCustomBatteries((current) => [...current.filter((entry) => entry.id !== battery.id), battery].sort((a, b) => a.name.localeCompare(b.name)));
    try {
      await persist(supabase && (() => previous
        ? supabase.from("test_batteries").update({ name: battery.name, description: battery.description, test_keys: [...battery.tests] }).eq("id", battery.id)
        : supabase.from("test_batteries").insert({ id: battery.id, team_id: battery.teamId, name: battery.name, description: battery.description, test_keys: [...battery.tests], created_by: user.id })));
    } catch (error) {
      setCustomBatteries((current) => [...current.filter((entry) => entry.id !== battery.id), ...(previous ? [previous] : [])]);
      throw error;
    }
    return battery.id;
  }, [customBatteries, persist, supabase, user]);

  const deleteBattery = useCallback(async (id: string) => {
    const previous = customBatteries.find((entry) => entry.id === id);
    if (!previous) return;
    setCustomBatteries((current) => current.filter((entry) => entry.id !== id));
    // A team on the deleted battery goes back to the default, here and in the database.
    const affected = teams.filter((team) => team.batteryId === id);
    setTeams((current) => current.map((team) => team.batteryId === id ? { ...team, batteryId: DEFAULT_BATTERY_ID } : team));
    try {
      await persist(supabase && (async () => {
        for (const team of affected) {
          const reset = await supabase.from("teams").update({ battery_key: DEFAULT_BATTERY_ID }).eq("id", team.id);
          if (reset.error) return reset;
        }
        return supabase.from("test_batteries").delete().eq("id", id);
      }));
    } catch (error) {
      setCustomBatteries((current) => [...current, previous]);
      setTeams((current) => current.map((team) => affected.some((entry) => entry.id === team.id) ? { ...team, batteryId: id } : team));
      throw error;
    }
  }, [customBatteries, persist, supabase, teams]);

  const importOvr = useCallback(async (input: { file: File; sha256: string; writes: ImportWrites; rows: OvrRow[]; mappings: OvrMapping[]; matches: Record<string, string>; exportedAt: string | null }) => {
    if (!user || !currentTeam) throw new Error("Choose a team first");
    const teamId = currentTeam.id;
    const id = makeUuid();
    const filePath = `${teamId}/${id}/${storageFileName(input.file.name)}`;
    const days: TestDay[] = input.writes.newTestDays.map((heldOn) => ({ id: makeUuid(), teamId, heldOn, title: "OVR test", notes: `Imported from ${input.file.name}` }));
    const dayFor = (date: string, testDayId: string | null) => testDayId ?? days.find((day) => day.heldOn === date)?.id ?? "";
    const newResults: TestResult[] = input.writes.results.map((result) => ({ id: makeUuid(), testDayId: dayFor(result.date, result.testDayId), athleteId: result.athleteId, testKey: result.testKey, side: result.side, value: result.value, importId: id }));
    const summary: ImportSummary = {
      results: newResults.length,
      rowsAdded: 0,
      rowsChanged: 0,
      dates: [...new Set(input.writes.results.map((result) => result.date))].sort(),
      createdTestDayIds: days.map((day) => day.id),
      matches: input.matches,
      exportedAt: input.exportedAt,
    };
    const record: TestImport = { id, teamId, fileName: input.file.name, fileSize: input.file.size, fileSha256: input.sha256, filePath, status: "applied", summary, createdAt: new Date().toISOString() };
    const mappings: TeamOvrMapping[] = input.mappings.map((mapping) => ({ ...mapping, teamId }));

    await persist(supabase && (async () => {
      // The file first: an import is only as good as the source it can be checked against.
      const stored = await supabase.storage.from(OVR_BUCKET).upload(filePath, input.file, { contentType: input.file.type || XLSX_TYPE, upsert: false });
      if (stored.error) return { error: stored.error, status: 400 };
      const created = await supabase.from("test_imports").insert({ id, team_id: teamId, source: "ovr", file_path: filePath, file_name: input.file.name, file_size: input.file.size, file_sha256: input.sha256, status: "uploaded", summary, uploaded_by: user.id });
      if (created.error) return created;
      const failed = async (result: PersistResult) => { await supabase.from("test_imports").update({ status: "failed" }).eq("id", id); return result; };
      if (days.length) {
        const result = await supabase.from("test_days").insert(days.map((day) => ({ id: day.id, team_id: teamId, held_on: day.heldOn, title: day.title, notes: day.notes, created_by: user.id })));
        if (result.error) return failed(result);
      }
      if (newResults.length) {
        const result = await supabase.from("test_results").upsert(newResults.map((entry) => ({ test_day_id: entry.testDayId, athlete_id: entry.athleteId, test_key: entry.testKey, side: entry.side ?? "both", value: entry.value, recorded_by: user.id, import_id: id })), { onConflict: "test_day_id,athlete_id,test_key,side" });
        if (result.error) return failed(result);
      }
      // Every row, in batches; the database adds the new, updates the changed and skips the rest.
      for (let start = 0; start < input.rows.length; start += OVR_BATCH) {
        const result = await supabase.rpc("import_ovr_rows", { target_import_id: id, incoming: input.rows.slice(start, start + OVR_BATCH).map(ovrRowPayload) });
        if (result.error) return failed(result);
        const counts = (result.data ?? {}) as { added?: number; changed?: number };
        summary.rowsAdded += counts.added ?? 0;
        summary.rowsChanged += counts.changed ?? 0;
      }
      if (mappings.length) {
        const result = await supabase.from("ovr_mappings").upsert(mappings.map((mapping) => ({ team_id: teamId, measure_key: mapping.key, test_key: mapping.testKey, side: mapping.side, first_leg: mapping.firstLeg ?? null, updated_at: new Date().toISOString() })), { onConflict: "team_id,measure_key" });
        if (result.error) return failed(result);
      }
      return supabase.from("test_imports").update({ status: "applied", applied_at: new Date().toISOString(), summary }).eq("id", id);
    }));
    if (!supabase) {
      const merged = mergeOvrRows(demoOvrRowsRef.current, input.rows, id, makeUuid);
      summary.rowsAdded = merged.added;
      summary.rowsChanged = merged.changed;
      setDemoOvrRows(merged.rows);
    }
    setOvrRowsVersion((version) => version + 1);

    // Written (or demo): show it. Replaced results swap in place.
    const sameResult = (a: TestResult, b: TestResult) => a.testDayId === b.testDayId && a.athleteId === b.athleteId && a.testKey === b.testKey && a.side === b.side;
    setTestDays((current) => [...days, ...current]);
    setResults((current) => [...current.filter((result) => !newResults.some((entry) => sameResult(entry, result))), ...newResults]);
    setOvrMappings((current) => [...current.filter((mapping) => !mappings.some((entry) => entry.teamId === mapping.teamId && entry.key === mapping.key)), ...mappings]);
    const shown = supabase ? record : { ...record, localUrl: URL.createObjectURL(input.file) };
    setTestImports((current) => [shown, ...current]);
    return shown;
  }, [currentTeam, persist, supabase, user]);

  const undoImport = useCallback(async (id: string) => {
    const record = testImports.find((entry) => entry.id === id);
    if (!record) return;
    const remaining = results.filter((result) => result.importId !== id);
    // Only the test days the import made, and only if nothing else is on them now.
    const emptyDays = record.summary.createdTestDayIds.filter((dayId) => !remaining.some((result) => result.testDayId === dayId));
    await persist(supabase && (async () => {
      const steps = [
        () => supabase.from("ovr_rows").delete().eq("import_id", id),
        () => supabase.from("test_results").delete().eq("import_id", id),
        () => emptyDays.length ? supabase.from("test_days").delete().in("id", emptyDays) : Promise.resolve({ error: null }),
        () => supabase.from("test_imports").update({ status: "undone" }).eq("id", id),
      ];
      for (const step of steps) { const result = await step(); if (result.error) return result; }
      return { error: null };
    }));
    setResults(remaining);
    setTestDays((current) => current.filter((day) => !emptyDays.includes(day.id)));
    setTestImports((current) => current.map((entry) => entry.id === id ? { ...entry, status: "undone" } : entry));
    setDemoOvrRows((current) => current.filter((row) => row.importId !== id));
    setOvrRowsVersion((version) => version + 1);
  }, [persist, results, supabase, testImports]);

  const loadOvrRows = useCallback(async (athleteId: string) => {
    if (!supabase) return demoOvrRowsRef.current.filter((row) => row.athleteId === athleteId).sort((a, b) => b.performedOn.localeCompare(a.performedOn));
    const rows: OvrRow[] = [];
    // PostgREST pages at 1000 rows; a season of reps is many pages.
    for (let from = 0; ; from += OVR_PAGE) {
      const { data, error } = await supabase.from("ovr_rows").select("*").eq("athlete_id", athleteId).order("performed_on", { ascending: false }).order("row_key").range(from, from + OVR_PAGE - 1);
      if (error) throw new Error("Couldn’t load the OVR data.");
      rows.push(...(data as unknown as DbOvrRow[]).map(mapOvrRow));
      if (data.length < OVR_PAGE) return rows;
    }
  }, [supabase]);

  const loadOvrRowsForDay = useCallback(async (athleteIds: string[], date: string) => {
    if (!athleteIds.length) return [];
    if (!supabase) return demoOvrRowsRef.current.filter((row) => row.performedOn === date && athleteIds.includes(row.athleteId));
    const rows: OvrRow[] = [];
    for (let from = 0; ; from += OVR_PAGE) {
      const { data, error } = await supabase.from("ovr_rows").select("*").in("athlete_id", athleteIds).eq("performed_on", date).order("row_key").range(from, from + OVR_PAGE - 1);
      if (error) throw new Error("Couldn’t load the OVR data.");
      rows.push(...(data as unknown as DbOvrRow[]).map(mapOvrRow));
      if (data.length < OVR_PAGE) return rows;
    }
  }, [supabase]);

  const importFileUrl = useCallback(async (id: string) => {
    const record = testImports.find((entry) => entry.id === id);
    if (!record) throw new Error("No such import");
    if (!supabase) { if (record.localUrl) return record.localUrl; throw new Error("The demo keeps a file only until the page reloads."); }
    const { data, error } = await supabase.storage.from(OVR_BUCKET).createSignedUrl(record.filePath, 60, { download: record.fileName });
    if (error || !data) throw new Error("Couldn’t get the file. Try again.");
    return data.signedUrl;
  }, [supabase, testImports]);

  const value = useMemo<SpenstContextValue>(() => ({
    user, authLoading, workspaceLoaded, isDemoMode: !supabase, teams, currentTeam, athletes, measurements, testDays, results, saveState, notice, sidebarCollapsed,
    setSidebarCollapsed, setCurrentTeamId: selectTeam, clearNotice: () => setNotice(null), signIn, signOut, createTeam, addAthlete, updateAthlete, removeAthleteFromTeam, deleteAthlete, createTestDay, saveResult,
    exercises, exerciseById, seasons, periods, weekNotes, sessions, createSeason, updateSeason, createPeriod, updatePeriod, deletePeriod, setWeekNote,
    createSession, updateSession, setSessionsStatus, editSessionContent, deleteSession, copySessions, moveSessions, deleteSessions, restoreSessions, matches, createMatch, updateMatch, deleteMatch,
    testImports, ovrMappings, importOvr, undoImport, importFileUrl, loadOvrRows, loadOvrRowsForDay, ovrRowsVersion,
    customBatteries, setTeamBattery, saveBattery, deleteBattery,
  }), [user, authLoading, workspaceLoaded, supabase, teams, currentTeam, athletes, measurements, testDays, results, saveState, notice, sidebarCollapsed, selectTeam, signIn, signOut, createTeam, addAthlete, updateAthlete, removeAthleteFromTeam, deleteAthlete, createTestDay, saveResult,
    exercises, exerciseById, seasons, periods, weekNotes, sessions, createSeason, updateSeason, createPeriod, updatePeriod, deletePeriod, setWeekNote,
    createSession, updateSession, setSessionsStatus, editSessionContent, deleteSession, copySessions, moveSessions, deleteSessions, restoreSessions, matches, createMatch, updateMatch, deleteMatch,
    testImports, ovrMappings, importOvr, undoImport, importFileUrl, loadOvrRows, loadOvrRowsForDay, ovrRowsVersion,
    customBatteries, setTeamBattery, saveBattery, deleteBattery]);

  return <SpenstContext.Provider value={value}>{children}</SpenstContext.Provider>;
}

export function useSpenst() {
  const context = useContext(SpenstContext);
  if (!context) throw new Error("useSpenst must be used inside <AppProvider>");
  return context;
}
