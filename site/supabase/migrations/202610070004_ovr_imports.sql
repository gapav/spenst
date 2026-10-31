-- Spenst: OVR exports, kept as uploaded and read into results.
--
-- Apply after 202610070002_programming.sql. Not yet applied anywhere.
--
-- Nearly every test result arrives as a spreadsheet exported from OVR Connect:
-- one workbook with Velocity, Jump and Sprint sheets, always holding the
-- athletes' whole history. The coach uploads the file; the browser reads it,
-- matches names to the roster, compares with what is stored, and writes only
-- what is new. The original file is kept in a private bucket so an import can
-- be checked against its source, re-read when the parser improves, or undone.
-- The parsing is in lib/ovr-import.ts.
--
-- Privacy: the raw export holds whatever was typed into the OVR app — likely
-- full names. Only the team's coaches can read it, never athletes, and nothing
-- is copied out of it but the minimised roster match and the values.

-- One uploaded file. `summary` is what the import did — values written, test
-- days it created (removed again on undo if left empty) — plus the coach's
-- OVR-name → athlete matches, so the next import remembers them. Those names
-- are as personal as the file itself, and readable by the same coaches only.
create table public.test_imports (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  test_day_id uuid references public.test_days(id) on delete set null,
  source text not null default 'ovr' check (source in ('ovr', 'other')),
  -- `<team_id>/<import_id>/<file name>` in the `ovr-exports` bucket.
  file_path text not null unique check (char_length(file_path) between 3 and 400),
  file_name text not null check (char_length(file_name) between 1 and 200),
  file_size bigint not null check (file_size >= 0),
  -- The same export uploaded twice is recognised by its content.
  file_sha256 text check (file_sha256 ~ '^[0-9a-f]{64}$'),
  status text not null default 'uploaded' check (status in ('uploaded', 'applied', 'failed', 'undone')),
  summary jsonb not null default '{}'::jsonb,
  uploaded_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  applied_at timestamptz
);

create index idx_test_imports_team on public.test_imports(team_id, created_at desc);
create index idx_test_imports_sha on public.test_imports(team_id, file_sha256);

-- What each OVR exercise (and sprint distance) means to a team, chosen once in
-- the import and remembered: the power-profile test it feeds, and for a
-- one-leg test either its leg (an exercise per leg) or the leg the
-- alternating reps start on (reps 1, 3, 5, 7 that leg; left = left foot forward).
create table public.ovr_mappings (
  team_id uuid not null references public.teams(id) on delete cascade,
  -- "velocity|hang power clean", "sprint|1.09yd lead-in + 10.94yd|10"
  measure_key text not null check (char_length(measure_key) between 3 and 200),
  test_key text check (char_length(test_key) between 2 and 40),
  side text check (side in ('left', 'right')),
  first_leg text check (first_leg in ('left', 'right')),
  updated_at timestamptz not null default now(),
  primary key (team_id, measure_key)
);

-- Where a value came from, so an import can be undone without touching what
-- was typed by hand. Deleting the import record keeps the values.
alter table public.test_results add column import_id uuid references public.test_imports(id) on delete set null;

revoke all on public.test_imports, public.ovr_mappings from anon, authenticated;
grant select, insert, update, delete on public.test_imports, public.ovr_mappings to authenticated;
alter table public.test_imports enable row level security;
alter table public.ovr_mappings enable row level security;

create policy ovr_mappings_all on public.ovr_mappings for all to authenticated using (public.is_team_member(team_id)) with check (public.is_team_member(team_id));

-- Coaches only: athletes see their results, not the files they came from.
create policy test_imports_read on public.test_imports for select to authenticated using (public.is_team_member(team_id));
create policy test_imports_insert on public.test_imports for insert to authenticated with check (public.is_team_member(team_id) and uploaded_by = auth.uid());
create policy test_imports_update on public.test_imports for update to authenticated using (public.is_team_member(team_id)) with check (public.is_team_member(team_id));
create policy test_imports_delete on public.test_imports for delete to authenticated using (public.is_team_member(team_id));

-- ---------------------------------------------------------------------------
-- Every row of every export

-- One row of an OVR export — a rep, a jump or a sprint split — with every
-- column OVR wrote, for an athlete on a roster. Typed columns for what OVR
-- writes today; `extra` keeps any column it adds later, header → text, so
-- nothing in a file is dropped. Numbers are unconstrained `numeric`: stored
-- exactly as written. The OVR name is not kept here (the file has it).
create table public.ovr_rows (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  -- The import that added it, or last changed it. Undo deletes by this.
  import_id uuid references public.test_imports(id) on delete set null,
  sheet text not null check (sheet in ('velocity', 'jump', 'sprint')),
  -- The leg of a one-leg test's rep: from the exercise name, or alternation.
  side text check (side in ('left', 'right')),
  -- sheet|date|exercise|set-or-sprint|rep-or-split#occurrence: the same row in
  -- the next export gets the same key, so the full history is stored once.
  row_key text not null check (char_length(row_key) between 3 and 400),
  -- Changes when OVR's values change: the row is updated, not duplicated.
  checksum text not null check (char_length(checksum) between 6 and 64),
  performed_on date not null,
  exercise text not null check (char_length(exercise) between 1 and 200),
  ovr_groups text not null default '',
  sport text not null default '',
  position text not null default '',
  note text not null default '',
  set_number integer,
  rep_number integer,
  sprint_number integer,
  split_number integer,
  load_kg numeric,
  mean_velocity numeric,
  peak_velocity numeric,
  mean_power numeric,
  peak_power numeric,
  duration_s numeric,
  ea_index numeric,
  rom_cm numeric,
  tpv_s numeric,
  target_type text not null default '',
  target_min numeric,
  target_max numeric,
  jump_height_cm numeric,
  contact_time_s numeric,
  rsi numeric,
  jump_type text not null default '',
  distance_m numeric,
  split_time_s numeric,
  total_time_s numeric,
  speed_kmh numeric,
  in_beam_start boolean,
  trigger_start boolean,
  extra jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (athlete_id, row_key)
);

create index idx_ovr_rows_athlete on public.ovr_rows(athlete_id, sheet, exercise, performed_on desc);
create index idx_ovr_rows_import on public.ovr_rows(import_id);

revoke all on public.ovr_rows from anon, authenticated;
grant select, insert, update, delete on public.ovr_rows to authenticated;
alter table public.ovr_rows enable row level security;

-- Coaches of the athlete's teams read and write; athletes read their own.
create policy ovr_rows_read on public.ovr_rows for select to authenticated using (public.can_access_athlete(athlete_id) or public.is_own_athlete(athlete_id));
create policy ovr_rows_insert on public.ovr_rows for insert to authenticated with check (public.can_access_athlete(athlete_id));
create policy ovr_rows_update on public.ovr_rows for update to authenticated using (public.can_access_athlete(athlete_id)) with check (public.can_access_athlete(athlete_id));
create policy ovr_rows_delete on public.ovr_rows for delete to authenticated using (public.can_access_athlete(athlete_id));

-- Every export repeats the whole history, so an import sends every row and
-- the database sorts them: a new key is added, a known key whose checksum
-- changed is updated, an unchanged row is not touched — it keeps the import
-- that first wrote it. Security invoker: the caller's RLS applies to each row.
create or replace function public.import_ovr_rows(target_import_id uuid, incoming jsonb)
returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  added integer;
  changed integer;
begin
  with source as (
    select * from jsonb_to_recordset(incoming) as r(
      athlete_id uuid, sheet text, side text, row_key text, checksum text, performed_on date, exercise text,
      ovr_groups text, sport text, position text, note text,
      set_number integer, rep_number integer, sprint_number integer, split_number integer,
      load_kg numeric, mean_velocity numeric, peak_velocity numeric, mean_power numeric, peak_power numeric,
      duration_s numeric, ea_index numeric, rom_cm numeric, tpv_s numeric,
      target_type text, target_min numeric, target_max numeric,
      jump_height_cm numeric, contact_time_s numeric, rsi numeric, jump_type text,
      distance_m numeric, split_time_s numeric, total_time_s numeric, speed_kmh numeric, in_beam_start boolean, trigger_start boolean,
      extra jsonb)
  ), written as (
    insert into public.ovr_rows as existing (
      import_id, athlete_id, sheet, side, row_key, checksum, performed_on, exercise, ovr_groups, sport, position, note,
      set_number, rep_number, sprint_number, split_number, load_kg, mean_velocity, peak_velocity, mean_power, peak_power,
      duration_s, ea_index, rom_cm, tpv_s, target_type, target_min, target_max, jump_height_cm, contact_time_s, rsi, jump_type,
      distance_m, split_time_s, total_time_s, speed_kmh, in_beam_start, trigger_start, extra)
    select
      target_import_id, athlete_id, sheet, side, row_key, checksum, performed_on, exercise, coalesce(ovr_groups, ''), coalesce(sport, ''), coalesce(position, ''), coalesce(note, ''),
      set_number, rep_number, sprint_number, split_number, load_kg, mean_velocity, peak_velocity, mean_power, peak_power,
      duration_s, ea_index, rom_cm, tpv_s, coalesce(target_type, ''), target_min, target_max, jump_height_cm, contact_time_s, rsi, coalesce(jump_type, ''),
      distance_m, split_time_s, total_time_s, speed_kmh, in_beam_start, trigger_start, coalesce(extra, '{}'::jsonb)
    from source
    on conflict (athlete_id, row_key) do update set
      import_id = excluded.import_id, checksum = excluded.checksum, sheet = excluded.sheet, side = excluded.side, performed_on = excluded.performed_on,
      exercise = excluded.exercise, ovr_groups = excluded.ovr_groups, sport = excluded.sport, position = excluded.position, note = excluded.note,
      set_number = excluded.set_number, rep_number = excluded.rep_number, sprint_number = excluded.sprint_number, split_number = excluded.split_number,
      load_kg = excluded.load_kg, mean_velocity = excluded.mean_velocity, peak_velocity = excluded.peak_velocity,
      mean_power = excluded.mean_power, peak_power = excluded.peak_power, duration_s = excluded.duration_s, ea_index = excluded.ea_index,
      rom_cm = excluded.rom_cm, tpv_s = excluded.tpv_s, target_type = excluded.target_type, target_min = excluded.target_min,
      target_max = excluded.target_max, jump_height_cm = excluded.jump_height_cm, contact_time_s = excluded.contact_time_s,
      rsi = excluded.rsi, jump_type = excluded.jump_type, distance_m = excluded.distance_m, split_time_s = excluded.split_time_s,
      total_time_s = excluded.total_time_s, speed_kmh = excluded.speed_kmh, in_beam_start = excluded.in_beam_start,
      trigger_start = excluded.trigger_start, extra = excluded.extra
      where existing.checksum is distinct from excluded.checksum
    returning (xmax = 0) as inserted
  )
  select count(*) filter (where inserted), count(*) filter (where not inserted) into added, changed from written;
  return jsonb_build_object('added', added, 'changed', changed);
end;
$$;

revoke all on function public.import_ovr_rows(uuid, jsonb) from public, anon;
grant execute on function public.import_ovr_rows(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Storage

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ovr-exports', 'ovr-exports', false, 10485760, array[
  'text/csv', 'text/plain', 'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
])
on conflict (id) do nothing;

-- The team an object belongs to is its first folder. A malformed name maps to
-- no team (and so to no access) instead of failing the uuid cast.
create or replace function public.storage_team_id(object_name text) returns uuid
language sql immutable set search_path = public as $$
  select case
    when (storage.foldername(object_name))[1] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    then ((storage.foldername(object_name))[1])::uuid
  end
$$;

-- Files are written once and never changed: read, upload and delete, no update.
create policy ovr_exports_read on storage.objects for select to authenticated
  using (bucket_id = 'ovr-exports' and public.is_team_member(public.storage_team_id(name)));
create policy ovr_exports_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'ovr-exports' and public.is_team_member(public.storage_team_id(name)));
create policy ovr_exports_delete on storage.objects for delete to authenticated
  using (bucket_id = 'ovr-exports' and public.is_team_member(public.storage_team_id(name)));
