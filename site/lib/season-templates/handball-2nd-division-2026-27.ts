import type { Period, Season, WeekNote } from "../season";

/**
 * Season 2026/27 for Test Team (Case H of the S&C Learning Path, decision 20):
 * an amateur men’s 2. divisjon handball season, built on Stord’s fixture list
 * (group 3, NHF tournament 446514, read 13 Nov 2026). Issue #19.
 *
 * Typed data only — phases, week notes and the throughline. Blocks and
 * sessions are the maintainer’s. `scripts/season-template-sql.mts` turns this
 * into `supabase/data/2026-27-test-team-handball-2nd-division.sql`, which the
 * maintainer runs once with `npm run db:sql` (decision 23).
 *
 * Imports stay relative and type-only, so Node can run the script directly.
 */

export type TemplatePeriod = Omit<Period, "id" | "seasonId">;
export type TemplateWeekNote = Omit<WeekNote, "seasonId">;

export interface SeasonTemplate {
  /** The team and season the data targets; the SQL finds them by these. */
  teamName: string;
  season: Pick<Season, "title" | "startsOn" | "weeks" | "throughline">;
  phases: TemplatePeriod[];
  weekNotes: TemplateWeekNote[];
}

const lines = (...points: string[]) => points.join("\n");

const phase = (kind: Period["kind"], title: string, startsOn: string, weeks: number, focus: string, notes: string): TemplatePeriod => ({
  level: "phase",
  kind,
  title,
  startsOn,
  weeks,
  emphasis: null,
  focus,
  notes,
});

export const handball2ndDivision202627: SeasonTemplate = {
  teamName: "Test Team",
  season: {
    title: "Season 2026/27",
    startsOn: "2026-08-03",
    weeks: 52,
    throughline: "In every training and competition phase, sprint, jump and lift heavy every week. Only the dose changes.",
  },
  phases: [
    phase(
      "training",
      "Preseason",
      "2026-08-03",
      3,
      "Raise the team load safely and bring strength and speed up to match level before the first match on Sun 30 Aug.",
      lines(
        "Team practice goes from 0–1 a week to 3 a week plus friendlies. The handball load roughly doubles, so S&C volume falls as it rises.",
        "Develop: acceleration, full-speed change of direction, speed-strength (jumps, throws) and repeated high-intensity efforts.",
        "Maintain: the off-season’s maximal strength, at ≥ 80 % 1RM and low volume.",
        "Sprint at ≥ 90 % speed, plus hamstring and groin work (Nordics, Copenhagen), every week. Early preseason carries the year’s highest injury risk.",
        "Week 3 is a short taper: cut S&C volume and keep intensity.",
        "Test day in week 1, with the team battery, as the season baseline.",
        "Suggested blocks: one 3-week block, moving from strength-speed to speed-strength.",
      ),
    ),
    phase(
      "competition",
      "Autumn league I",
      "2026-08-24",
      5,
      "Hold the preseason level through the first three matches, and use the two match-free weeks for one short loading block.",
      lines(
        "Fixtures are Stord’s (2. divisjon menn, group 3, 2026/27): Sun 30 Aug H, Sat 19 Sep A, Sat 26 Sep H.",
        "No match in w36–37. Load strength and speed harder there.",
        "Normal match week: the hard S&C goes early in the week, and nothing hard in the 48 h before a match.",
        "At least one heavy strength exposure (≥ 80 % 1RM) every week, all season.",
        "Practice days are fixed (Mon, Tue, Thu, 20:00–21:30). S&C slots must fit around work and practice.",
      ),
    ),
    phase(
      "training",
      "Autumn gap",
      "2026-09-28",
      2,
      "Three weeks between matches (26 Sep → 17 Oct): a short development block for strength and speed.",
      lines(
        "The autumn school holiday falls here in most regions, so expect lower attendance in one week.",
        "Week 1: raise S&C volume. Week 2: bring it down, so the team is fresh for Sat 17 Oct.",
        "A good place for maximal-velocity sprints and more jump volume.",
        "Suggested block: 2 weeks, absolute or accelerative strength.",
      ),
    ),
    phase(
      "competition",
      "Autumn league II",
      "2026-10-12",
      10,
      "The busiest stretch of the autumn: 8 matches in 10 weeks with an away weekend. Keep strength and speed and manage fatigue.",
      lines(
        "w44 is an away weekend: Sat 31 Oct at Haslum IL and Sun 1 Nov at Nordstrand 2, with long travel. S&C that week is a minimum dose early in the week. Mon–Tue of w45 are for recovery.",
        "No match in w43, w45 or w46. Put the heaviest S&C weeks of the phase in w45–46.",
        "Wed 18 Nov is a home match at 18:00. That week, no hard S&C from Monday on.",
        "w48–51 has a match every weekend: heavy but short strength work, and no new exercises.",
        "The last match before Christmas is Sat 19 Dec.",
        "If many players report high fatigue after the away weekend, cut the next S&C session to the minimum dose.",
      ),
    ),
    phase(
      "break",
      "Christmas break",
      "2026-12-21",
      2,
      "Rest from team practice. A short home programme keeps detraining small.",
      lines(
        "No team practice for about 10 days.",
        "Home programme 2 × a week, 20–30 min: jumps, one strength lift (or single-leg strength), Nordics, short sprints where possible.",
        "Two weeks or more without training cost some sprint and power. A minimum dose limits the loss.",
        "Nothing new, and nothing that leaves players sore.",
      ),
    ),
    phase(
      "training",
      "Return before restart",
      "2027-01-04",
      1,
      "Load back up before the restart on Sat 16 Jan: full sprint speed and heavy strength again within one week.",
      lines(
        "Team practice restarts. The first match is Sat 16 Jan, away at Fyllingen.",
        "Retest the team battery at the first practice, to see what the break cost.",
        "Build sprint exposure back to ≥ 90 % speed by the end of the week. Hamstring risk is high after a break.",
        "Moderate volume at normal intensity.",
      ),
    ),
    phase(
      "competition",
      "Winter league",
      "2027-01-11",
      8,
      "Keep strength and speed through 8 matches in 8 weeks, including an away weekend and a two-match week.",
      lines(
        "w06 is an away weekend: Sat 13 Feb at Ros and Sun 14 Feb at Bækkelaget. w07 Mon–Tue are for recovery.",
        "w09 has two matches: Wed 3 Mar away at Gneist (19:00) and Sun 7 Mar at home. Use the minimum dose that week.",
        "No match in w03 or w08. These are the loading weeks of the phase.",
        "The winter school holiday falls in w08 or w09, depending on the region, so expect lower attendance.",
        "Suggested blocks: two 4-week blocks, with the heaviest S&C in w03 and w08.",
      ),
    ),
    phase(
      "competition",
      "Run-in",
      "2027-03-08",
      5,
      "The last league rounds, 3 matches in 5 weeks: keep the team fresh and sharp, and start the peak if the team can win the group.",
      lines(
        "Matches: Sat 20 Mar away at Åsane 2, Sat 3 Apr at home to Bjørnar, and Sun 11 Apr at home to Bergensdalen (the last round).",
        "No match in w10 or w12 (Easter). w10 is the last loading week of the season, and w12 is a light week.",
        "Strength stays heavy with lower volume. Speed and jumps stay high quality at low volume.",
        "After w11, decide whether the team can win the group. If it can, plan the qualification peak (phase 9). If it can’t, the season ends on 11 Apr.",
        "In 2026, two of the four groups were decided in the last round, so the decisive matches can come before any qualification.",
      ),
    ),
    phase(
      "competition",
      "Qualification window",
      "2027-04-12",
      3,
      "Group winner only: a 2-week taper into two qualification matches for 1. divisjon. For every other team, this is the start of the transition.",
      lines(
        "The format: two pools of three teams (the group winners plus the 11th and 12th teams of 1. divisjon). Each team plays two matches, and the top two in each pool go up.",
        "2026 dates were 26 Apr, 29 Apr and 3 May. The 2027 dates aren’t known yet, so expect about 25 Apr–2 May.",
        "Taper in w15–16: cut S&C volume clearly, and keep intensity and frequency.",
        "Between the two matches: recovery and a short neural primer, nothing more.",
        "End-of-season test day (team battery) in w15, or after the last match. It sets the off-season priorities.",
        "Not qualified: one week of light, unstructured activity, then the transition.",
      ),
    ),
    phase(
      "break",
      "Transition",
      "2027-05-03",
      3,
      "Physical and mental recovery after a 9-month season, with a minimum dose so detraining stays small.",
      lines(
        "No team practice.",
        "2 short sessions a week, unsupervised: other sports, easy running, a simple strength circuit.",
        "Treat the injuries and niggles of the season now (rehab, physio).",
        "This is a window to keep a minimum dose, not a holiday.",
      ),
    ),
    phase(
      "training",
      "Off-season development",
      "2027-05-24",
      6,
      "The main development window of the year: build maximal strength, muscle and tissue capacity for next season.",
      lines(
        "Team practice is 0–1 a week, so S&C can run 3 sessions a week. Players work, so sessions go after work.",
        "Develop maximal strength and hypertrophy first, then strength-speed.",
        "Some sprinting and jumping every week at low volume, per the throughline. Gamble (2006) instead leaves plyometrics and speed out of the off-season. This plan follows the throughline.",
        "Individual priorities come from the end-of-season tests and the needs analysis.",
        "Suggested blocks: two 3-week blocks, hypertrophy or absolute strength, then absolute or accelerative strength.",
      ),
    ),
    phase(
      "break",
      "Summer holiday",
      "2027-07-05",
      3,
      "Holiday. A short programme players do alone keeps strength and fitness from falling far.",
      lines(
        "Players train alone and often travel: 2 sessions a week of 30 min, with no equipment or a hotel gym.",
        "Content: jumps, single-leg strength, sprints, intervals.",
        "Simple enough to do without a coach.",
      ),
    ),
    phase(
      "training",
      "Return to running",
      "2027-07-26",
      1,
      "Bridge to next season: get running and sprint volume back up before team practice starts.",
      lines(
        "Progressive running: intervals and sprint build-ups to ≥ 90 % speed.",
        "Strength 2 × a week, at moderate load.",
        "Next season’s plan starts on Mon 2 Aug 2027.",
      ),
    ),
  ],
  weekNotes: [
    { weekStart: "2026-08-03", label: "Preseason starts · test day" },
    { weekStart: "2026-08-17", label: "Last preseason week · taper" },
    { weekStart: "2026-08-24", label: "Sun H BSI 16:00 · league start" },
    { weekStart: "2026-08-31", label: "No match" },
    { weekStart: "2026-09-07", label: "No match" },
    { weekStart: "2026-09-14", label: "Sat A Bjørnar 16:00" },
    { weekStart: "2026-09-21", label: "Sat H Fyllingen 14:00" },
    { weekStart: "2026-09-28", label: "No match" },
    { weekStart: "2026-10-05", label: "No match" },
    { weekStart: "2026-10-12", label: "Sat H Ros 16:00" },
    { weekStart: "2026-10-19", label: "No match" },
    { weekStart: "2026-10-26", label: "2 away: Sat Haslum IL 15:00 · Sun Nordstrand 2 12:00" },
    { weekStart: "2026-11-02", label: "No match" },
    { weekStart: "2026-11-09", label: "No match" },
    { weekStart: "2026-11-16", label: "Wed H Gneist 18:00" },
    { weekStart: "2026-11-23", label: "Sun H Bækkelaget 16:00" },
    { weekStart: "2026-11-30", label: "Sun A Bergensdalen 15:00" },
    { weekStart: "2026-12-07", label: "Sun A Viking TIF 2 13:00" },
    { weekStart: "2026-12-14", label: "Sat H Åsane 2 16:00 · last match before Christmas" },
    { weekStart: "2026-12-21", label: "Christmas · no team practice" },
    { weekStart: "2026-12-28", label: "Christmas · no team practice" },
    { weekStart: "2027-01-04", label: "Team practice restarts · retest" },
    { weekStart: "2027-01-11", label: "Sat A Fyllingen 16:30 · restart" },
    { weekStart: "2027-01-18", label: "No match" },
    { weekStart: "2027-01-25", label: "Sat A BSI 14:30" },
    { weekStart: "2027-02-01", label: "Sun H Haslum IL 14:00" },
    { weekStart: "2027-02-08", label: "2 away: Sat Ros 16:00 · Sun Bækkelaget 14:00" },
    { weekStart: "2027-02-15", label: "Sun H Viking TIF 2 16:00" },
    { weekStart: "2027-02-22", label: "No match" },
    { weekStart: "2027-03-01", label: "2 matches: Wed A Gneist 19:00 · Sun H Nordstrand 2 14:00" },
    { weekStart: "2027-03-08", label: "No match · last loading week" },
    { weekStart: "2027-03-15", label: "Sat A Åsane 2 14:00 · decide: contender?" },
    { weekStart: "2027-03-22", label: "Easter · no match" },
    { weekStart: "2027-03-29", label: "Sat H Bjørnar 16:00" },
    { weekStart: "2027-04-05", label: "Sun H Bergensdalen 16:00 · last round" },
    { weekStart: "2027-04-12", label: "Taper if group winner · end-of-season tests" },
    { weekStart: "2027-04-19", label: "Qualification if group winner (dates TBC)" },
    { weekStart: "2027-04-26", label: "Qualification if group winner (dates TBC)" },
    { weekStart: "2027-05-03", label: "Transition starts" },
    { weekStart: "2027-05-24", label: "Off-season development starts" },
    { weekStart: "2027-07-05", label: "Summer holiday" },
    { weekStart: "2027-07-26", label: "Return to running" },
  ],
};
