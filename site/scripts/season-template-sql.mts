// Generates the data script for a season template (decision 23): one SQL file
// in supabase/data/ that the maintainer runs once with
// `npm run db:sql -- -f supabase/data/<file>.sql`, after `npm run db:backup`.
// It is not a migration and `db:push` never runs it.
//
// Run `npm run data:season-template` after editing the template;
// season-template-sql.test.ts fails the suite if the checked-in file has drifted.
import { writeFileSync } from "node:fs";
import path from "node:path";
import { handball2ndDivision202627, type SeasonTemplate } from "../lib/season-templates/handball-2nd-division-2026-27.ts";

/**
 * A SQL string literal. Every piece of text goes through here: single quotes
 * are doubled (standard_conforming_strings is on, so a backslash is just a
 * character), and a NUL byte, which Postgres text cannot hold, is refused —
 * as is the `$script$` tag that closes the DO block the literals sit in.
 */
export function sqlText(value: string): string {
  if (value.includes("\0")) throw new Error("Text may not contain a NUL byte.");
  if (value.includes(DO_TAG)) throw new Error(`Text may not contain ${DO_TAG}.`);
  return `'${value.replaceAll("'", "''")}'`;
}

const DO_TAG = "$script$";
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function sqlDate(value: string): string {
  if (!DATE.test(value)) throw new Error(`Not a date: ${value}`);
  return `date '${value}'`;
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

function sqlTime(value: string | null): string {
  if (value === null) return "null";
  if (!TIME.test(value)) throw new Error(`Not a time: ${value}`);
  return `time '${value}'`;
}

function sqlBoolean(value: boolean): string {
  return value ? "true" : "false";
}

function sqlInteger(value: number): string {
  if (!Number.isInteger(value)) throw new Error(`Not an integer: ${value}`);
  return String(value);
}

/** Notes are one point per line; each line becomes its own literal, joined by a newline. */
function sqlNotes(notes: string, indent: string): string {
  const points = notes.split("\n");
  if (points.length === 1) return sqlText(notes);
  return `concat_ws(E'\\n',\n${points.map((point) => `${indent}  ${sqlText(point)}`).join(",\n")}\n${indent})`;
}

export function seasonTemplateSql(template: SeasonTemplate, fileName: string): string {
  const { season, phases, weekNotes, matches, retiredWeekNotes } = template;
  const team = sqlText(template.teamName);
  const title = sqlText(season.title);
  const startsOn = sqlDate(season.startsOn);
  const weeks = sqlInteger(season.weeks);
  const indent = "      ";
  // These also go into the header comments, where a line break would end the comment.
  for (const value of [template.teamName, season.title, fileName]) {
    if (/[\r\n]/.test(value)) throw new Error(`No line breaks in a team name, season title or file name: ${JSON.stringify(value)}`);
  }

  const phaseRows = phases.map((phase) => {
    if (phase.level !== "phase") throw new Error(`Only phases belong in a season template: ${phase.title}`);
    return [
      `    (`,
      `      target, 'phase', ${sqlText(phase.kind)}, ${sqlText(phase.title)}, ${sqlDate(phase.startsOn)}, ${sqlInteger(phase.weeks)}, null,`,
      `      ${sqlText(phase.focus)},`,
      `      ${sqlNotes(phase.notes, indent)}`,
      `    )`,
    ].join("\n");
  });

  const noteRows = weekNotes.map((note) => `    (target, ${sqlDate(note.weekStart)}, ${sqlText(note.label)})`);
  const retiredRows = retiredWeekNotes.map((note) => `    (${sqlDate(note.weekStart)}, ${sqlText(note.label)})`);
  const matchRows = matches.map((match) => {
    if (match.playedOn < season.startsOn) throw new Error(`A match before the season: ${match.playedOn}`);
    return `    (${sqlDate(match.playedOn)}, ${sqlTime(match.kickOff)}, ${sqlText(match.opponent)}, ${sqlBoolean(match.home)}, ${sqlText(match.kind)}::public.match_kind, ${sqlBoolean(match.priority)}, ${sqlText(match.note)})`;
  });

  return `-- ${fileName}
-- GENERATED FILE — do not edit by hand. The source is
-- lib/season-templates/; run \`npm run data:season-template\` to regenerate.
--
-- A data script, not a migration (decision 23; see README.md here).
-- Targets team ${template.teamName}, season ${season.title} (${season.startsOn}, ${season.weeks} weeks).
-- It replaces that season's phases, upserts its week notes, adds the team's
-- matches that are not there yet (same date and opponent), deletes the week
-- notes that are matches now while they still read exactly as this script
-- once wrote them, and sets the throughline. Blocks, sessions, other matches
-- and the notes on other weeks stay as they are.
-- Running it twice gives the same result.
--
-- Run once, after a backup, from site/:
--   npm run db:backup
--   npm run db:sql -- -f supabase/data/${fileName}

begin;

do $script$
declare
  matches integer;
  target uuid;
  target_team uuid;
  author uuid;
begin
  -- Team names are not unique, so the name must pick out exactly one team.
  select count(*) into matches from public.teams team where team.name = ${team};

  if matches <> 1 then
    raise exception 'Expected exactly one team %, found %.', ${team}, matches;
  end if;

  select count(*) into matches
  from public.seasons season
  join public.teams team on team.id = season.team_id
  where team.name = ${team} and season.title = ${title};

  if matches <> 1 then
    raise exception 'Expected exactly one season % for team %, found %.', ${title}, ${team}, matches;
  end if;

  select season.id into target
  from public.seasons season
  join public.teams team on team.id = season.team_id
  where team.name = ${team} and season.title = ${title}
    and season.starts_on = ${startsOn} and season.weeks = ${weeks};

  if target is null then
    raise exception 'Season % for team % does not start on % with % weeks.', ${title}, ${team}, ${startsOn}, ${weeks};
  end if;

  select season.team_id into target_team from public.seasons season where season.id = target;

  -- A match records who made it; the script makes them as the team's first admin.
  select membership.profile_id into author
  from public.team_memberships membership
  where membership.team_id = target_team and membership.role = 'admin'
  order by membership.joined_at
  limit 1;

  if author is null then
    raise exception 'Team % has no admin to record the matches as.', ${team};
  end if;

  -- Phases only: blocks and sessions are left alone.
  delete from public.periods where season_id = target and level = 'phase';

  insert into public.periods (season_id, level, kind, title, starts_on, weeks, emphasis, focus, notes)
  values
${phaseRows.join(",\n")};

  insert into public.week_notes (season_id, week_start, label)
  values
${noteRows.join(",\n")}
  on conflict (season_id, week_start) do update set label = excluded.label;
${retiredRows.length ? `
  -- Notes that are matches now, only while they still say what this script once wrote.
  delete from public.week_notes note
  using (values
${retiredRows.join(",\n")}
  ) as retired (week_start, label)
  where note.season_id = target and note.week_start = retired.week_start and note.label = retired.label;
` : ""}${matchRows.length ? `
  insert into public.matches (team_id, played_on, kick_off, opponent, home, kind, priority, note, created_by)
  select target_team, fixture.played_on, fixture.kick_off, fixture.opponent, fixture.home, fixture.kind, fixture.priority, fixture.note, author
  from (values
${matchRows.join(",\n")}
  ) as fixture (played_on, kick_off, opponent, home, kind, priority, note)
  where not exists (
    select 1 from public.matches existing
    where existing.team_id = target_team and existing.played_on = fixture.played_on and existing.opponent = fixture.opponent
  );
` : ""}
  update public.seasons
  set throughline = ${sqlText(season.throughline)}
  where id = target;
end
$script$;

commit;
`;
}

export interface DataScript {
  fileName: string;
  template: SeasonTemplate;
}

export const dataDir = path.join(import.meta.dirname, "..", "supabase", "data");

export const dataScripts: DataScript[] = [
  { fileName: "2026-27-test-team-handball-2nd-division.sql", template: handball2ndDivision202627 },
];

if (process.argv[1] === import.meta.filename) {
  for (const script of dataScripts) {
    const target = path.join(dataDir, script.fileName);
    writeFileSync(target, seasonTemplateSql(script.template, script.fileName));
    console.log(`Wrote ${path.relative(process.cwd(), target)}.`);
  }
}
