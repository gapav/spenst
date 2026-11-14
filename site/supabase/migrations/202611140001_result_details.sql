-- Spenst: a test result read from OVR keeps its best attempt (decision 27).
--
-- Apply after 202611130001_delete_athlete.sql.
--
-- A result is one number — the best rep's peak power, the fastest time — but
-- OVR measured much more about the rep or run it came from: load, mean and
-- peak velocity and power, ROM, time to peak velocity, duration, EA index; or
-- a run's split and total time, distance, speed and start. `details` keeps
-- those numbers with the result, so hovers and rankings on another metric
-- read them without paging in `ovr_rows`, which stays the full record.
--
-- One jsonb object, keyed by the app's `OvrRow` field names: `sheet`
-- ('velocity' | 'jump' | 'sprint'), then whichever of setNumber, repNumber,
-- sprintNumber, splitNumber, loadKg, meanVelocity, peakVelocity, meanPower,
-- peakPower, romCm, tpvS, durationS, eaIndex, jumpHeightCm, contactTimeS,
-- rsi, distanceM, splitTimeS, totalTimeS, speedKmh, inBeamStart,
-- triggerStart and attempts OVR filled. Built by `attemptDetails` in
-- lib/ovr-data.ts and read back through `parseAttemptDetails`, which checks
-- every field. Null for a value typed by hand.
--
-- Nothing new about the athlete: only more measurements of the same test, so
-- the privacy rules are unchanged. RLS and grants are unchanged too: the
-- table-level grants on test_results cover the new column, and the existing
-- policies (can_access_athlete / can_record_result) govern it.
--
-- Schema only (decision 23). Results imported before this migration are
-- filled by the data script supabase/data/202611140001-backfill-result-details.sql,
-- run once by the maintainer after a backup.

alter table public.test_results add column details jsonb
  constraint test_results_details_shape check (
    details is null or (
      jsonb_typeof(details) = 'object'
      -- coalesce: a missing key is null, and a check only rejects false.
      and coalesce(details ->> 'sheet' in ('velocity', 'jump', 'sprint'), false)
      -- A rep or a run is a couple of dozen numbers; anything larger is not one.
      and pg_column_size(details) <= 2048
    )
  );

comment on column public.test_results.details is
  'The OVR attempt the value came from (decision 27): sheet plus every number OVR wrote for that rep, jump or run. Null when typed by hand.';
