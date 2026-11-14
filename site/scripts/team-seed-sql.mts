// Generates the data script that creates a whole test team (decision 23): the
// team, its season (phases, week notes, matches and throughline copied from
// another team's live season), athletes, measurements, test days, blocks and
// sessions. One SQL file in supabase/data/ that the maintainer runs once with
// `npm run db:sql -- -f supabase/data/<file>.sql`, after `npm run db:backup`.
//
// Run `npm run data:team-seed` after editing the template;
// team-seed-sql.test.ts fails the suite if the checked-in file has drifted.
import { writeFileSync } from "node:fs";
import path from "node:path";
import { seniorTestDiv2202627, type TeamSeed } from "../lib/season-templates/senior-test-div-2-2026-27.ts";
import { dataDir, sqlText } from "./season-template-sql.mts";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function sqlDate(value: string): string {
  if (!DATE.test(value)) throw new Error(`Not a date: ${value}`);
  return `date '${value}'`;
}

function sqlUuid(value: string): string {
  if (!UUID.test(value)) throw new Error(`Not a uuid: ${value}`);
  return `'${value}'::uuid`;
}

function sqlNumber(value: number): string {
  if (!Number.isFinite(value)) throw new Error(`Not a number: ${value}`);
  return String(value);
}

const values = (rows: string[]) => rows.map((row) => `    (${row})`).join(",\n");

export function teamSeedSql(seed: TeamSeed, fileName: string): string {
  for (const value of [seed.teamName, seed.source.teamName, seed.source.seasonTitle, seed.season.title, fileName]) {
    if (/[\r\n]/.test(value)) throw new Error(`No line breaks in names: ${JSON.stringify(value)}`);
  }
  const team = sqlUuid(seed.teamId);
  const season = sqlUuid(seed.season.id);
  const startsOn = sqlDate(seed.season.startsOn);
  const weeks = sqlNumber(seed.season.weeks);

  const athleteRows = seed.athletes.map((athlete) => {
    if (!/^\d{4}-\d{2}$/.test(athlete.birthMonth)) throw new Error(`Not a birth month: ${athlete.birthMonth}`);
    return `${sqlUuid(athlete.id)}, ${sqlText(athlete.displayName)}, ${sqlDate(`${athlete.birthMonth}-01`)}, 'M'::public.athlete_sex, ${sqlText(athlete.position)}::public.handball_position, ${athlete.measurementConsent}, author`;
  });
  const rosterRows = seed.athletes.map((athlete) => `${team}, ${sqlUuid(athlete.id)}`);
  const measurementRows = seed.measurements.map((row) =>
    `${sqlUuid(row.athleteId)}, ${sqlDate(row.measuredOn)}, ${sqlNumber(row.heightCm)}, ${sqlNumber(row.sittingHeightCm)}, ${sqlNumber(row.bodyMassKg)}, author`);
  const testDayRows = seed.testDays.map((day) => `${sqlUuid(day.id)}, ${team}, ${sqlDate(day.heldOn)}, ${sqlText(day.title)}, ${sqlText(day.notes)}, author`);
  const resultRows = seed.testDays.flatMap((day) => day.results.map((result) =>
    `${sqlUuid(day.id)}, ${sqlUuid(result.athleteId)}, ${sqlText(result.testKey)}, ${sqlText(result.side)}::public.result_side, ${sqlNumber(result.value)}, author`));
  const blockRows = seed.blocks.map((block) => {
    if (block.level !== "block") throw new Error(`Only blocks are written; phases are copied: ${block.title}`);
    return `${season}, 'block', ${sqlText(block.kind)}::public.period_kind, ${sqlText(block.title)}, ${sqlDate(block.startsOn)}, ${sqlNumber(block.weeks)}, ${block.emphasis ? `${sqlText(block.emphasis)}::public.velocity_zone` : "null"}, ${sqlText(block.focus)}, ${sqlText(block.notes)}`;
  });
  const sessionRows = seed.sessions.map((session) =>
    `${sqlUuid(session.id)}, ${team}, ${sqlDate(session.scheduledOn)}, ${sqlText(session.title)}, ${sqlText(session.status)}::public.session_status, ${sqlText(JSON.stringify(session.content))}::jsonb, author`);

  return `-- ${fileName}
-- GENERATED FILE — do not edit by hand. The source is
-- lib/season-templates/; run \`npm run data:team-seed\` to regenerate.
--
-- A data script, not a migration (decision 23; see README.md here).
-- Creates team ${seed.teamName}: its ${seed.season.title} with the phases, week notes,
-- matches and throughline of ${seed.source.teamName}'s ${seed.source.seasonTitle} as they are in the
-- database now, plus ${seed.athletes.length} athletes, ${seed.measurements.length} measurements, ${seed.testDays.length} test days
-- (${resultRows.length} results), ${seed.blocks.length} blocks and ${seed.sessions.length} sessions. Its first admin is ${seed.source.teamName}'s.
-- It only adds: it refuses to run if ${seed.teamName} exists already, so running it
-- twice gives the same result.
--
-- Run once, after a backup, from site/:
--   npm run db:backup
--   npm run db:sql -- -f supabase/data/${fileName}

begin;

do $script$
declare
  found integer;
  source_season uuid;
  source_team uuid;
  author uuid;
begin
  if exists (select 1 from public.teams where name = ${sqlText(seed.teamName)}) then
    raise exception 'Team % exists already; this script only creates it.', ${sqlText(seed.teamName)};
  end if;

  select count(*) into found
  from public.seasons season
  join public.teams team on team.id = season.team_id
  where team.name = ${sqlText(seed.source.teamName)} and season.title = ${sqlText(seed.source.seasonTitle)};

  if found <> 1 then
    raise exception 'Expected exactly one season % for team %, found %.', ${sqlText(seed.source.seasonTitle)}, ${sqlText(seed.source.teamName)}, found;
  end if;

  select season.id, season.team_id into source_season, source_team
  from public.seasons season
  join public.teams team on team.id = season.team_id
  where team.name = ${sqlText(seed.source.teamName)} and season.title = ${sqlText(seed.source.seasonTitle)}
    and season.starts_on = ${startsOn} and season.weeks = ${weeks};

  if source_season is null then
    raise exception 'Season % for team % does not start on % with % weeks.', ${sqlText(seed.source.seasonTitle)}, ${sqlText(seed.source.teamName)}, ${startsOn}, ${weeks};
  end if;

  select membership.profile_id into author
  from public.team_memberships membership
  where membership.team_id = source_team and membership.role = 'admin'
  order by membership.joined_at
  limit 1;

  if author is null then
    raise exception 'Team % has no admin to create the new team as.', ${sqlText(seed.source.teamName)};
  end if;

  insert into public.teams (id, name, population, battery_key, created_by)
  values (${team}, ${sqlText(seed.teamName)}, ${sqlText(seed.population)}::public.population, ${sqlText(seed.batteryKey)}, author);

  insert into public.team_memberships (team_id, profile_id, role) values (${team}, author, 'admin');

  -- The season, its phases, week notes and throughline, as the source has them now.
  insert into public.seasons (id, team_id, title, starts_on, weeks, throughline, created_by)
  select ${season}, ${team}, ${sqlText(seed.season.title)}, source.starts_on, source.weeks, source.throughline, author
  from public.seasons source where source.id = source_season;

  insert into public.periods (season_id, level, kind, title, starts_on, weeks, emphasis, focus, notes)
  select ${season}, 'phase', phase.kind, phase.title, phase.starts_on, phase.weeks, phase.emphasis, phase.focus, phase.notes
  from public.periods phase where phase.season_id = source_season and phase.level = 'phase';

  insert into public.week_notes (season_id, week_start, label)
  select ${season}, note.week_start, note.label from public.week_notes note where note.season_id = source_season;

  -- The same fixture list, inside the season.
  insert into public.matches (team_id, played_on, kick_off, opponent, home, kind, priority, note, created_by)
  select ${team}, match.played_on, match.kick_off, match.opponent, match.home, match.kind, match.priority, match.note, author
  from public.matches match
  where match.team_id = source_team and match.played_on >= ${startsOn} and match.played_on < ${startsOn} + ${weeks} * 7;

  insert into public.periods (season_id, level, kind, title, starts_on, weeks, emphasis, focus, notes)
  values
${values(blockRows)};

  insert into public.athletes (id, display_name, birth_month, sex, position, measurement_consent, created_by)
  values
${values(athleteRows)};

  insert into public.team_athletes (team_id, athlete_id)
  values
${values(rosterRows)};

  insert into public.athlete_measurements (athlete_id, measured_on, height_cm, sitting_height_cm, body_mass_kg, recorded_by)
  values
${values(measurementRows)};

  insert into public.test_days (id, team_id, held_on, title, notes, created_by)
  values
${values(testDayRows)};

  insert into public.test_results (test_day_id, athlete_id, test_key, side, value, recorded_by)
  values
${values(resultRows)};

  insert into public.sessions (id, team_id, scheduled_on, title, status, content, updated_by)
  values
${values(sessionRows)};
end
$script$;

commit;
`;
}

export const teamSeeds: { fileName: string; seed: TeamSeed }[] = [
  { fileName: "2026-27-senior-test-div-2.sql", seed: seniorTestDiv2202627 },
];

if (process.argv[1] === import.meta.filename) {
  for (const { fileName, seed } of teamSeeds) {
    const target = path.join(dataDir, fileName);
    writeFileSync(target, teamSeedSql(seed, fileName));
    console.log(`Wrote ${path.relative(process.cwd(), target)}.`);
  }
}
