-- 202611140001-backfill-result-details.sql
-- A data script, not a migration (decision 23; see README.md here). Written by
-- hand: it is a one-off, not a season template.
--
-- Fills `test_results.details` (migration 202611140001_result_details.sql,
-- decision 27) for results imported from OVR before that migration, from the
-- `ovr_rows` they were read from. Only rows with an import and no details yet
-- are touched; values typed by hand stay without details. Running it twice
-- gives the same result: the second run finds nothing to fill.
--
-- The rule is `detailsForResults` in lib/ovr-data.ts, the one the import uses:
-- a result's attempts are the athlete's OVR rows on the test day whose
-- exercise (and, for a sprint, distance covered to the gate) the team maps to
-- the test in `ovr_mappings`, on the same leg; the best attempt is the one
-- whose scored value — peak power, jump height, or the time at the gate — is
-- the result. A run without distances (5-10-5) is read at its last split.
--
-- Run once, after the migration and a backup, from site/:
--   npm run db:backup
--   npm run db:sql -- -f supabase/data/202611140001-backfill-result-details.sql

begin;

with pending as (
  select result.id, result.athlete_id, result.test_key, result.side::text as side, result.value, day.held_on, day.team_id
  from public.test_results result
  join public.test_days day on day.id = result.test_day_id
  where result.import_id is not null and result.details is null
),
-- Reps and jumps: one row is one attempt.
lifted as (
  select
    pending.id as result_id,
    pending.value,
    case o.sheet when 'velocity' then o.peak_power else o.jump_height_cm end as scored,
    array[coalesce(o.set_number, 0), coalesce(o.rep_number, 0)] as session_order,
    o.row_key,
    jsonb_strip_nulls(case o.sheet
      when 'velocity' then jsonb_build_object(
        'sheet', 'velocity', 'setNumber', o.set_number, 'repNumber', o.rep_number, 'loadKg', o.load_kg,
        'meanVelocity', o.mean_velocity, 'peakVelocity', o.peak_velocity, 'meanPower', o.mean_power, 'peakPower', o.peak_power,
        'romCm', o.rom_cm, 'tpvS', o.tpv_s, 'durationS', o.duration_s, 'eaIndex', o.ea_index,
        'attempts', count(*) over (partition by pending.id))
      else jsonb_build_object(
        'sheet', 'jump', 'setNumber', o.set_number, 'repNumber', o.rep_number,
        'jumpHeightCm', o.jump_height_cm, 'contactTimeS', o.contact_time_s, 'rsi', o.rsi,
        'attempts', count(*) over (partition by pending.id))
    end) as details
  from pending
  join public.ovr_rows o
    on o.athlete_id = pending.athlete_id and o.performed_on = pending.held_on
   and o.sheet in ('velocity', 'jump') and coalesce(o.side, 'both') = pending.side
  join public.ovr_mappings mapping
    on mapping.team_id = pending.team_id and mapping.test_key = pending.test_key
   and mapping.measure_key = o.sheet || '|' || lower(regexp_replace(o.exercise, '^[\s\u00a0]+|[\s\u00a0]+$', '', 'g'))
),
-- Sprints: each split with the distance covered to its gate, the time there,
-- and the top speed so far in the run.
splits as (
  select
    o.athlete_id, o.performed_on, o.exercise, o.row_key, o.sprint_number, o.split_number, o.distance_m, o.split_time_s,
    o.in_beam_start, o.trigger_start,
    trim_scale(round(sum(o.distance_m) over run, 2)) as covered,
    coalesce(o.total_time_s, nullif(sum(coalesce(o.split_time_s, 0)) over run, 0)) as time_at,
    nullif(max(coalesce(o.speed_kmh, 0)) over run, 0) as top_speed,
    bool_or(o.distance_m is not null) over whole_run as has_distance,
    -- The run's last split, as the app sorts them: a run without distances is read there.
    row_number() over (whole_run order by coalesce(o.split_number, 0) desc, o.row_key desc) as from_end
  from public.ovr_rows o
  where o.sheet = 'sprint'
  -- A split without a Sprint # is a run of its own, as in the app (`sprintNumber ?? rowKey`).
  window whole_run as (partition by o.athlete_id, o.performed_on, o.exercise, coalesce(o.sprint_number::text, o.row_key)),
         run as (whole_run order by coalesce(o.split_number, 0), o.row_key rows between unbounded preceding and current row)
),
ran as (
  select
    pending.id as result_id,
    pending.value,
    splits.time_at as scored,
    array[coalesce(splits.sprint_number, 0), coalesce(splits.split_number, 0)] as session_order,
    splits.row_key,
    jsonb_strip_nulls(jsonb_build_object(
      'sheet', 'sprint', 'sprintNumber', splits.sprint_number, 'splitNumber', splits.split_number,
      'distanceM', case when splits.has_distance then splits.covered end,
      'splitTimeS', splits.split_time_s, 'totalTimeS', splits.time_at, 'speedKmh', splits.top_speed,
      'inBeamStart', splits.in_beam_start, 'triggerStart', splits.trigger_start,
      'attempts', count(*) over (partition by pending.id))) as details
  from pending
  join splits on splits.athlete_id = pending.athlete_id and splits.performed_on = pending.held_on
  join public.ovr_mappings mapping
    on mapping.team_id = pending.team_id and mapping.test_key = pending.test_key
   and mapping.measure_key = 'sprint|' || lower(regexp_replace(splits.exercise, '^[\s\u00a0]+|[\s\u00a0]+$', '', 'g'))
       || case when splits.has_distance then '|' || splits.covered::text else '' end
  where pending.side = 'both'
    -- A gate is a split with a distance; a run without distances has one, its last split.
    and case when splits.has_distance then splits.distance_m is not null else splits.from_end = 1 end
),
best as (
  select distinct on (result_id) result_id, details
  from (select * from lifted union all select * from ran) attempt
  where round(scored, 3) = value
  order by result_id, session_order, row_key
),
filled as (
  update public.test_results result
  set details = best.details
  from best
  where result.id = best.result_id and result.details is null
  returning result.id
)
select count(*) as results_filled from filled;

commit;
