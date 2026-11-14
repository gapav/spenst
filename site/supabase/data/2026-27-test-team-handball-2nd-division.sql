-- 2026-27-test-team-handball-2nd-division.sql
-- GENERATED FILE — do not edit by hand. The source is
-- lib/season-templates/; run `npm run data:season-template` to regenerate.
--
-- A data script, not a migration (decision 23; see README.md here).
-- Targets team Test Team, season Season 2026/27 (2026-08-03, 52 weeks).
-- It replaces that season's phases, upserts its week notes, adds the team's
-- matches that are not there yet (same date and opponent), deletes the week
-- notes that are matches now while they still read exactly as this script
-- once wrote them, and sets the throughline. Blocks, sessions, other matches
-- and the notes on other weeks stay as they are.
-- Running it twice gives the same result.
--
-- Run once, after a backup, from site/:
--   npm run db:backup
--   npm run db:sql -- -f supabase/data/2026-27-test-team-handball-2nd-division.sql

begin;

do $script$
declare
  matches integer;
  target uuid;
  target_team uuid;
  author uuid;
begin
  -- Team names are not unique, so the name must pick out exactly one team.
  select count(*) into matches from public.teams team where team.name = 'Test Team';

  if matches <> 1 then
    raise exception 'Expected exactly one team %, found %.', 'Test Team', matches;
  end if;

  select count(*) into matches
  from public.seasons season
  join public.teams team on team.id = season.team_id
  where team.name = 'Test Team' and season.title = 'Season 2026/27';

  if matches <> 1 then
    raise exception 'Expected exactly one season % for team %, found %.', 'Season 2026/27', 'Test Team', matches;
  end if;

  select season.id into target
  from public.seasons season
  join public.teams team on team.id = season.team_id
  where team.name = 'Test Team' and season.title = 'Season 2026/27'
    and season.starts_on = date '2026-08-03' and season.weeks = 52;

  if target is null then
    raise exception 'Season % for team % does not start on % with % weeks.', 'Season 2026/27', 'Test Team', date '2026-08-03', 52;
  end if;

  select season.team_id into target_team from public.seasons season where season.id = target;

  -- A match records who made it; the script makes them as the team's first admin.
  select membership.profile_id into author
  from public.team_memberships membership
  where membership.team_id = target_team and membership.role = 'admin'
  order by membership.joined_at
  limit 1;

  if author is null then
    raise exception 'Team % has no admin to record the matches as.', 'Test Team';
  end if;

  -- Phases only: blocks and sessions are left alone.
  delete from public.periods where season_id = target and level = 'phase';

  insert into public.periods (season_id, level, kind, title, starts_on, weeks, emphasis, focus, notes)
  values
    (
      target, 'phase', 'training', 'Preseason', date '2026-08-03', 3, null,
      'Raise the team load safely and bring strength and speed up to match level before the first match on Sun 30 Aug.',
      concat_ws(E'\n',
        'Team practice goes from 0–1 a week to 3 a week plus friendlies. The handball load roughly doubles, so S&C volume falls as it rises.',
        'Develop: acceleration, full-speed change of direction, speed-strength (jumps, throws) and repeated high-intensity efforts.',
        'Maintain: the off-season’s maximal strength, at ≥ 80 % 1RM and low volume.',
        'Sprint at ≥ 90 % speed, plus hamstring and groin work (Nordics, Copenhagen), every week. Early preseason carries the year’s highest injury risk.',
        'Week 3 is a short taper: cut S&C volume and keep intensity.',
        'Test day in week 1, with the team battery, as the season baseline.',
        'Suggested blocks: one 3-week block, moving from strength-speed to speed-strength.'
      )
    ),
    (
      target, 'phase', 'competition', 'Autumn league I', date '2026-08-24', 5, null,
      'Hold the preseason level through the first three matches, and use the two match-free weeks for one short loading block.',
      concat_ws(E'\n',
        'Fixtures are Stord’s (2. divisjon menn, group 3, 2026/27): Sun 30 Aug H, Sat 19 Sep A, Sat 26 Sep H.',
        'No match in w36–37. Load strength and speed harder there.',
        'Normal match week: the hard S&C goes early in the week, and nothing hard in the 48 h before a match.',
        'At least one heavy strength exposure (≥ 80 % 1RM) every week, all season.',
        'Practice days are fixed (Mon, Tue, Thu, 20:00–21:30). S&C slots must fit around work and practice.'
      )
    ),
    (
      target, 'phase', 'training', 'Autumn gap', date '2026-09-28', 2, null,
      'Three weeks between matches (26 Sep → 17 Oct): a short development block for strength and speed.',
      concat_ws(E'\n',
        'The autumn school holiday falls here in most regions, so expect lower attendance in one week.',
        'Week 1: raise S&C volume. Week 2: bring it down, so the team is fresh for Sat 17 Oct.',
        'A good place for maximal-velocity sprints and more jump volume.',
        'Suggested block: 2 weeks, absolute or accelerative strength.'
      )
    ),
    (
      target, 'phase', 'competition', 'Autumn league II', date '2026-10-12', 10, null,
      'The busiest stretch of the autumn: 8 matches in 10 weeks with an away weekend. Keep strength and speed and manage fatigue.',
      concat_ws(E'\n',
        'w44 is an away weekend: Sat 31 Oct at Haslum IL and Sun 1 Nov at Nordstrand 2, with long travel. S&C that week is a minimum dose early in the week. Mon–Tue of w45 are for recovery.',
        'No match in w43, w45 or w46. Put the heaviest S&C weeks of the phase in w45–46.',
        'Wed 18 Nov is a home match at 18:00. That week, no hard S&C from Monday on.',
        'w48–51 has a match every weekend: heavy but short strength work, and no new exercises.',
        'The last match before Christmas is Sat 19 Dec.',
        'If many players report high fatigue after the away weekend, cut the next S&C session to the minimum dose.'
      )
    ),
    (
      target, 'phase', 'break', 'Christmas break', date '2026-12-21', 2, null,
      'Rest from team practice. A short home programme keeps detraining small.',
      concat_ws(E'\n',
        'No team practice for about 10 days.',
        'Home programme 2 × a week, 20–30 min: jumps, one strength lift (or single-leg strength), Nordics, short sprints where possible.',
        'Two weeks or more without training cost some sprint and power. A minimum dose limits the loss.',
        'Nothing new, and nothing that leaves players sore.'
      )
    ),
    (
      target, 'phase', 'training', 'Return before restart', date '2027-01-04', 1, null,
      'Load back up before the restart on Sat 16 Jan: full sprint speed and heavy strength again within one week.',
      concat_ws(E'\n',
        'Team practice restarts. The first match is Sat 16 Jan, away at Fyllingen.',
        'Retest the team battery at the first practice, to see what the break cost.',
        'Build sprint exposure back to ≥ 90 % speed by the end of the week. Hamstring risk is high after a break.',
        'Moderate volume at normal intensity.'
      )
    ),
    (
      target, 'phase', 'competition', 'Winter league', date '2027-01-11', 8, null,
      'Keep strength and speed through 8 matches in 8 weeks, including an away weekend and a two-match week.',
      concat_ws(E'\n',
        'w06 is an away weekend: Sat 13 Feb at Ros and Sun 14 Feb at Bækkelaget. w07 Mon–Tue are for recovery.',
        'w09 has two matches: Wed 3 Mar away at Gneist (19:00) and Sun 7 Mar at home. Use the minimum dose that week.',
        'No match in w03 or w08. These are the loading weeks of the phase.',
        'The winter school holiday falls in w08 or w09, depending on the region, so expect lower attendance.',
        'Suggested blocks: two 4-week blocks, with the heaviest S&C in w03 and w08.'
      )
    ),
    (
      target, 'phase', 'competition', 'Run-in', date '2027-03-08', 5, null,
      'The last league rounds, 3 matches in 5 weeks: keep the team fresh and sharp, and start the peak if the team can win the group.',
      concat_ws(E'\n',
        'Matches: Sat 20 Mar away at Åsane 2, Sat 3 Apr at home to Bjørnar, and Sun 11 Apr at home to Bergensdalen (the last round).',
        'No match in w10 or w12 (Easter). w10 is the last loading week of the season, and w12 is a light week.',
        'Strength stays heavy with lower volume. Speed and jumps stay high quality at low volume.',
        'After w11, decide whether the team can win the group. If it can, plan the qualification peak (phase 9). If it can’t, the season ends on 11 Apr.',
        'In 2026, two of the four groups were decided in the last round, so the decisive matches can come before any qualification.'
      )
    ),
    (
      target, 'phase', 'competition', 'Qualification window', date '2027-04-12', 3, null,
      'Group winner only: a 2-week taper into two qualification matches for 1. divisjon. For every other team, this is the start of the transition.',
      concat_ws(E'\n',
        'The format: two pools of three teams (the group winners plus the 11th and 12th teams of 1. divisjon). Each team plays two matches, and the top two in each pool go up.',
        '2026 dates were 26 Apr, 29 Apr and 3 May. The 2027 dates aren’t known yet, so expect about 25 Apr–2 May.',
        'Taper in w15–16: cut S&C volume clearly, and keep intensity and frequency.',
        'Between the two matches: recovery and a short neural primer, nothing more.',
        'End-of-season test day (team battery) in w15, or after the last match. It sets the off-season priorities.',
        'Not qualified: one week of light, unstructured activity, then the transition.'
      )
    ),
    (
      target, 'phase', 'break', 'Transition', date '2027-05-03', 3, null,
      'Physical and mental recovery after a 9-month season, with a minimum dose so detraining stays small.',
      concat_ws(E'\n',
        'No team practice.',
        '2 short sessions a week, unsupervised: other sports, easy running, a simple strength circuit.',
        'Treat the injuries and niggles of the season now (rehab, physio).',
        'This is a window to keep a minimum dose, not a holiday.'
      )
    ),
    (
      target, 'phase', 'training', 'Off-season development', date '2027-05-24', 6, null,
      'The main development window of the year: build maximal strength, muscle and tissue capacity for next season.',
      concat_ws(E'\n',
        'Team practice is 0–1 a week, so S&C can run 3 sessions a week. Players work, so sessions go after work.',
        'Develop maximal strength and hypertrophy first, then strength-speed.',
        'Some sprinting and jumping every week at low volume, per the throughline. Gamble (2006) instead leaves plyometrics and speed out of the off-season. This plan follows the throughline.',
        'Individual priorities come from the end-of-season tests and the needs analysis.',
        'Suggested blocks: two 3-week blocks, hypertrophy or absolute strength, then absolute or accelerative strength.'
      )
    ),
    (
      target, 'phase', 'break', 'Summer holiday', date '2027-07-05', 3, null,
      'Holiday. A short programme players do alone keeps strength and fitness from falling far.',
      concat_ws(E'\n',
        'Players train alone and often travel: 2 sessions a week of 30 min, with no equipment or a hotel gym.',
        'Content: jumps, single-leg strength, sprints, intervals.',
        'Simple enough to do without a coach.'
      )
    ),
    (
      target, 'phase', 'training', 'Return to running', date '2027-07-26', 1, null,
      'Bridge to next season: get running and sprint volume back up before team practice starts.',
      concat_ws(E'\n',
        'Progressive running: intervals and sprint build-ups to ≥ 90 % speed.',
        'Strength 2 × a week, at moderate load.',
        'Next season’s plan starts on Mon 2 Aug 2027.'
      )
    );

  insert into public.week_notes (season_id, week_start, label)
  values
    (target, date '2026-08-03', 'Preseason starts · test day'),
    (target, date '2026-08-17', 'Last preseason week · taper'),
    (target, date '2026-08-24', 'League start'),
    (target, date '2026-10-26', 'Away weekend'),
    (target, date '2026-12-14', 'Last match before Christmas'),
    (target, date '2026-12-21', 'Christmas · no team practice'),
    (target, date '2026-12-28', 'Christmas · no team practice'),
    (target, date '2027-01-04', 'Team practice restarts · retest'),
    (target, date '2027-01-11', 'Restart'),
    (target, date '2027-02-08', 'Away weekend'),
    (target, date '2027-03-08', 'Last loading week'),
    (target, date '2027-03-15', 'Decide: contender?'),
    (target, date '2027-03-22', 'Easter'),
    (target, date '2027-04-05', 'Last round'),
    (target, date '2027-04-12', 'Taper if group winner · end-of-season tests'),
    (target, date '2027-04-19', 'Qualification if group winner (dates TBC)'),
    (target, date '2027-04-26', 'Qualification if group winner (dates TBC)'),
    (target, date '2027-05-03', 'Transition starts'),
    (target, date '2027-05-24', 'Off-season development starts'),
    (target, date '2027-07-05', 'Summer holiday'),
    (target, date '2027-07-26', 'Return to running')
  on conflict (season_id, week_start) do update set label = excluded.label;

  -- Notes that are matches now, only while they still say what this script once wrote.
  delete from public.week_notes note
  using (values
    (date '2026-08-31', 'No match'),
    (date '2026-09-07', 'No match'),
    (date '2026-09-14', 'Sat A Bjørnar 16:00'),
    (date '2026-09-21', 'Sat H Fyllingen 14:00'),
    (date '2026-09-28', 'No match'),
    (date '2026-10-05', 'No match'),
    (date '2026-10-12', 'Sat H Ros 16:00'),
    (date '2026-10-19', 'No match'),
    (date '2026-11-02', 'No match'),
    (date '2026-11-09', 'No match'),
    (date '2026-11-16', 'Wed H Gneist 18:00'),
    (date '2026-11-23', 'Sun H Bækkelaget 16:00'),
    (date '2026-11-30', 'Sun A Bergensdalen 15:00'),
    (date '2026-12-07', 'Sun A Viking TIF 2 13:00'),
    (date '2027-01-18', 'No match'),
    (date '2027-01-25', 'Sat A BSI 14:30'),
    (date '2027-02-01', 'Sun H Haslum IL 14:00'),
    (date '2027-02-15', 'Sun H Viking TIF 2 16:00'),
    (date '2027-02-22', 'No match'),
    (date '2027-03-01', '2 matches: Wed A Gneist 19:00 · Sun H Nordstrand 2 14:00'),
    (date '2027-03-29', 'Sat H Bjørnar 16:00')
  ) as retired (week_start, label)
  where note.season_id = target and note.week_start = retired.week_start and note.label = retired.label;

  insert into public.matches (team_id, played_on, kick_off, opponent, home, kind, priority, note, created_by)
  select target_team, fixture.played_on, fixture.kick_off, fixture.opponent, fixture.home, fixture.kind, fixture.priority, fixture.note, author
  from (values
    (date '2026-08-30', time '16:00', 'BSI', true, 'league'::public.match_kind, false, 'League start'),
    (date '2026-09-19', time '16:00', 'Bjørnar', false, 'league'::public.match_kind, false, ''),
    (date '2026-09-26', time '14:00', 'Fyllingen', true, 'league'::public.match_kind, false, ''),
    (date '2026-10-17', time '16:00', 'Ros', true, 'league'::public.match_kind, false, ''),
    (date '2026-10-31', time '15:00', 'Haslum IL', false, 'league'::public.match_kind, false, 'Away weekend, with long travel'),
    (date '2026-11-01', time '12:00', 'Nordstrand 2', false, 'league'::public.match_kind, false, 'Away weekend, with long travel'),
    (date '2026-11-18', time '18:00', 'Gneist', true, 'league'::public.match_kind, false, ''),
    (date '2026-11-29', time '16:00', 'Bækkelaget', true, 'league'::public.match_kind, false, ''),
    (date '2026-12-06', time '15:00', 'Bergensdalen', false, 'league'::public.match_kind, false, ''),
    (date '2026-12-13', time '13:00', 'Viking TIF 2', false, 'league'::public.match_kind, false, ''),
    (date '2026-12-19', time '16:00', 'Åsane 2', true, 'league'::public.match_kind, false, 'Last match before Christmas'),
    (date '2027-01-16', time '16:30', 'Fyllingen', false, 'league'::public.match_kind, false, 'First match after the break'),
    (date '2027-01-30', time '14:30', 'BSI', false, 'league'::public.match_kind, false, ''),
    (date '2027-02-07', time '14:00', 'Haslum IL', true, 'league'::public.match_kind, false, ''),
    (date '2027-02-13', time '16:00', 'Ros', false, 'league'::public.match_kind, false, 'Away weekend'),
    (date '2027-02-14', time '14:00', 'Bækkelaget', false, 'league'::public.match_kind, false, 'Away weekend'),
    (date '2027-02-21', time '16:00', 'Viking TIF 2', true, 'league'::public.match_kind, false, ''),
    (date '2027-03-03', time '19:00', 'Gneist', false, 'league'::public.match_kind, false, ''),
    (date '2027-03-07', time '14:00', 'Nordstrand 2', true, 'league'::public.match_kind, false, ''),
    (date '2027-03-20', time '14:00', 'Åsane 2', false, 'league'::public.match_kind, false, 'Decide: contender for the group?'),
    (date '2027-04-03', time '16:00', 'Bjørnar', true, 'league'::public.match_kind, false, ''),
    (date '2027-04-11', time '16:00', 'Bergensdalen', true, 'league'::public.match_kind, true, 'Last round — can decide the group')
  ) as fixture (played_on, kick_off, opponent, home, kind, priority, note)
  where not exists (
    select 1 from public.matches existing
    where existing.team_id = target_team and existing.played_on = fixture.played_on and existing.opponent = fixture.opponent
  );

  update public.seasons
  set throughline = 'In every training and competition phase, sprint, jump and lift heavy every week. Only the dose changes.'
  where id = target;
end
$script$;

commit;
