-- Bootstrap script for Spenst
-- GENERATED FILE — do not edit by hand. Run `npm run db:bootstrap` after
-- adding a migration. supabase/migrations/ stays the source of truth; this
-- file is only their concatenation in filename order, so a brand-new, empty
-- Supabase project can be built with a single SQL Editor paste.

-- ============================================================
-- 202610070001_initial.sql
-- ============================================================
-- Spenst: initial schema.
--
-- Same security model as Grep: the browser talks to PostgREST directly, so row
-- level security and grants ARE the authorization boundary. Everything is
-- revoked from anon and re-granted narrowly to authenticated; every policy is
-- built from the security-definer helpers below; and anything that needs a
-- transaction or a check the client must not skip is an RPC.
--
-- Not yet applied anywhere. Apply by hand in the Supabase SQL editor of a NEW
-- project (see the README for whether to share Grep's project instead).

create extension if not exists pgcrypto;
create extension if not exists citext;

do $$ begin create type public.team_role as enum ('admin', 'coach'); exception when duplicate_object then null; end $$;
do $$ begin create type public.population as enum ('youth', 'adult'); exception when duplicate_object then null; end $$;
do $$ begin create type public.athlete_sex as enum ('F', 'M'); exception when duplicate_object then null; end $$;
do $$ begin create type public.handball_position as enum ('keeper', 'wing', 'back', 'centre', 'pivot'); exception when duplicate_object then null; end $$;
do $$ begin create type public.result_side as enum ('both', 'left', 'right'); exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Tables

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email citext not null,
  full_name text not null default 'Coach',
  is_global_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 120),
  population public.population not null,
  logo_url text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.team_memberships (
  team_id uuid not null references public.teams(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role public.team_role not null default 'coach',
  joined_at timestamptz not null default now(),
  primary key (team_id, profile_id)
);

-- An athlete exists on their own and is rostered on teams through
-- team_athletes, so a youth player who also trains with the seniors has one
-- history. Privacy-minimized: «Firstname L.» (enforced by trigger), birth month
-- only, and body measurements only with consent.
create table public.athletes (
  id uuid primary key default gen_random_uuid(),
  display_name text not null check (char_length(trim(display_name)) between 1 and 80),
  -- Always the first of the month; the day is not stored.
  birth_month date not null check (extract(day from birth_month) = 1),
  sex public.athlete_sex not null,
  position public.handball_position,
  measurement_consent boolean not null default false,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.team_athletes (
  team_id uuid not null references public.teams(id) on delete cascade,
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (team_id, athlete_id)
);

create table public.athlete_measurements (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  measured_on date not null,
  height_cm numeric(5,1) not null check (height_cm between 80 and 230),
  sitting_height_cm numeric(5,1) check (sitting_height_cm between 40 and 130),
  body_mass_kg numeric(5,1) not null check (body_mass_kg between 15 and 200),
  recorded_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (athlete_id, measured_on)
);

create table public.test_days (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  held_on date not null,
  title text not null default 'Test day' check (char_length(trim(title)) between 1 and 80),
  notes text not null default '',
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One value per athlete, test and side on a test day (the best trial). The
-- test catalogue lives in lib/power-profile.ts; the key format is checked here
-- so a typo cannot create a test nobody can score.
create table public.test_results (
  id uuid primary key default gen_random_uuid(),
  test_day_id uuid not null references public.test_days(id) on delete cascade,
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  test_key text not null check (test_key ~ '^[a-z0-9_]{2,40}$'),
  side public.result_side not null default 'both',
  value numeric(10,3) not null check (value > 0),
  recorded_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (test_day_id, athlete_id, test_key, side)
);

create index idx_memberships_profile on public.team_memberships(profile_id, team_id);
create index idx_team_athletes_athlete on public.team_athletes(athlete_id, team_id);
create index idx_measurements_athlete on public.athlete_measurements(athlete_id, measured_on desc);
create index idx_test_days_team on public.test_days(team_id, held_on desc);
create index idx_results_athlete on public.test_results(athlete_id, test_key);
create index idx_results_day on public.test_results(test_day_id);

-- ---------------------------------------------------------------------------
-- Triggers

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
create trigger teams_touch before update on public.teams for each row execute function public.touch_updated_at();
create trigger athletes_touch before update on public.athletes for each row execute function public.touch_updated_at();
create trigger test_days_touch before update on public.test_days for each row execute function public.touch_updated_at();
create trigger test_results_touch before update on public.test_results for each row execute function public.touch_updated_at();

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, coalesce(new.email, ''), coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(coalesce(new.email, 'Coach'), '@', 1)))
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;
create trigger auth_user_created after insert or update of email on auth.users for each row execute function public.handle_new_user();

-- «Ida Marie Kristiansen» → «Ida K.», the same rule as lib/roster.ts and
-- Grep's team_players trigger. Whatever the client sends, the full name is
-- never stored.
create or replace function public.minimize_athlete_name() returns trigger
language plpgsql set search_path = public as $$
declare name_parts text[]; part_count integer;
begin
  name_parts := regexp_split_to_array(trim(new.display_name), E'\\s+');
  part_count := coalesce(array_length(name_parts, 1), 0);
  if part_count > 1 then
    new.display_name := name_parts[1] || ' ' || upper(left(name_parts[part_count], 1)) || '.';
  elsif part_count = 1 then
    new.display_name := name_parts[1];
  end if;
  return new;
end;
$$;
create trigger athletes_minimize_name before insert or update of display_name on public.athletes for each row execute function public.minimize_athlete_name();

-- Spenst is for athletes from the year they turn 14 (MIN_AGE_CLASS in
-- lib/roster.ts). By birth year, as Norwegian age classes are, so a whole J14
-- squad can be added in January. Covers updates too, so a birth month cannot
-- be edited below the line afterwards.
create or replace function public.enforce_minimum_age() returns trigger
language plpgsql set search_path = public as $$
begin
  if extract(year from current_date) - extract(year from new.birth_month) < 14 then
    raise exception 'Spenst is for athletes from the year they turn 14';
  end if;
  return new;
end;
$$;
create trigger athletes_minimum_age before insert or update of birth_month on public.athletes for each row execute function public.enforce_minimum_age();

-- Withdrawing consent deletes the measurements; it does not just hide them.
create or replace function public.drop_measurements_without_consent() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.measurement_consent and not new.measurement_consent then
    delete from public.athlete_measurements where athlete_id = new.id;
  end if;
  return new;
end;
$$;
create trigger athletes_consent_withdrawn after update of measurement_consent on public.athletes for each row execute function public.drop_measurements_without_consent();

-- ---------------------------------------------------------------------------
-- Access helpers. Security definer so policies can call them without
-- recursing through each other's RLS.

create or replace function public.is_global_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_global_admin from public.profiles where id = auth.uid()), false)
$$;

create or replace function public.is_team_member(target_team_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.team_memberships where team_id = target_team_id and profile_id = auth.uid())
$$;

create or replace function public.is_team_admin(target_team_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.team_memberships where team_id = target_team_id and profile_id = auth.uid() and role = 'admin')
$$;

create or replace function public.shares_team(target_profile_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from public.team_memberships mine
    join public.team_memberships theirs on theirs.team_id = mine.team_id
    where mine.profile_id = auth.uid() and theirs.profile_id = target_profile_id
  )
$$;

-- A coach can see an athlete rostered on any team they coach — and therefore
-- the athlete's whole history, including results from the athlete's other
-- teams. That is the point of one athlete across squads.
create or replace function public.can_access_athlete(target_athlete_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from public.team_athletes roster
    join public.team_memberships membership on membership.team_id = roster.team_id
    where roster.athlete_id = target_athlete_id and membership.profile_id = auth.uid()
  )
$$;

-- Writing a result needs more than seeing the athlete: the coach must be on
-- the test day's team, and the athlete rostered on that same team.
create or replace function public.can_record_result(target_test_day_id uuid, target_athlete_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from public.test_days day
    join public.team_athletes roster on roster.team_id = day.team_id and roster.athlete_id = target_athlete_id
    where day.id = target_test_day_id and public.is_team_member(day.team_id)
  )
$$;

-- A test day is visible to its team, and to coaches of an athlete who has a
-- result on it — otherwise a result from the senior squad would arrive on the
-- youth coach's screen without a date.
create or replace function public.can_see_test_day(target_test_day_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from public.test_days day
    where day.id = target_test_day_id
      and (public.is_team_member(day.team_id)
        or exists(select 1 from public.test_results result where result.test_day_id = day.id and public.can_access_athlete(result.athlete_id)))
  )
$$;

create or replace function public.has_measurement_consent(target_athlete_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select measurement_consent from public.athletes where id = target_athlete_id), false)
$$;

-- ---------------------------------------------------------------------------
-- RPCs

-- A team and its first administrator, in one transaction. Global admins only:
-- clubs are onboarded, not self-served.
create or replace function public.create_team(team_name text, team_population public.population) returns uuid
language plpgsql security definer set search_path = public as $$
declare new_team_id uuid;
begin
  if auth.uid() is null then raise exception 'You must be signed in'; end if;
  if not public.is_global_admin() then raise exception 'Only the system administrator can create teams'; end if;
  insert into public.teams(name, population, created_by) values (trim(team_name), team_population, auth.uid()) returning id into new_team_id;
  insert into public.team_memberships(team_id, profile_id, role) values (new_team_id, auth.uid(), 'admin');
  return new_team_id;
end;
$$;

-- An athlete and their first roster row together: an athlete row with no team
-- would be invisible to everyone, including whoever just created it.
create or replace function public.add_athlete(target_team_id uuid, athlete_name text, athlete_birth_month date, athlete_sex public.athlete_sex, athlete_position public.handball_position default null, consent boolean default false) returns uuid
language plpgsql security definer set search_path = public as $$
declare new_athlete_id uuid;
begin
  if auth.uid() is null then raise exception 'You must be signed in'; end if;
  if not public.is_team_admin(target_team_id) then raise exception 'Only a team admin can add athletes'; end if;
  insert into public.athletes(display_name, birth_month, sex, position, measurement_consent, created_by)
  values (athlete_name, date_trunc('month', athlete_birth_month)::date, athlete_sex, athlete_position, consent, auth.uid())
  returning id into new_athlete_id;
  insert into public.team_athletes(team_id, athlete_id) values (target_team_id, new_athlete_id);
  return new_athlete_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants: nothing for anon, narrow for authenticated.

revoke all on all tables in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon;

grant select on public.profiles to authenticated;
grant update (full_name) on public.profiles to authenticated;
grant select on public.teams to authenticated;
grant update (name, logo_url) on public.teams to authenticated;
grant select on public.team_memberships to authenticated;
grant select on public.athletes to authenticated;
grant update (display_name, birth_month, sex, position, measurement_consent) on public.athletes to authenticated;
grant select, insert, delete on public.team_athletes to authenticated;
grant select, insert, update, delete on public.athlete_measurements to authenticated;
grant select, insert, update, delete on public.test_days to authenticated;
grant select, insert, update, delete on public.test_results to authenticated;

grant execute on function public.create_team(text, public.population) to authenticated;
grant execute on function public.add_athlete(uuid, text, date, public.athlete_sex, public.handball_position, boolean) to authenticated;
grant execute on function public.is_global_admin(), public.is_team_member(uuid), public.is_team_admin(uuid), public.shares_team(uuid), public.can_access_athlete(uuid), public.can_record_result(uuid, uuid), public.can_see_test_day(uuid), public.has_measurement_consent(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Policies

alter table public.profiles enable row level security;
alter table public.teams enable row level security;
alter table public.team_memberships enable row level security;
alter table public.athletes enable row level security;
alter table public.team_athletes enable row level security;
alter table public.athlete_measurements enable row level security;
alter table public.test_days enable row level security;
alter table public.test_results enable row level security;

create policy profiles_read on public.profiles for select to authenticated using (id = auth.uid() or public.shares_team(id) or public.is_global_admin());
create policy profiles_update_own on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy teams_read on public.teams for select to authenticated using (public.is_team_member(id) or public.is_global_admin());
create policy teams_update on public.teams for update to authenticated using (public.is_team_admin(id)) with check (public.is_team_admin(id));

create policy memberships_read on public.team_memberships for select to authenticated using (public.is_team_member(team_id) or public.is_global_admin());

create policy athletes_read on public.athletes for select to authenticated using (public.can_access_athlete(id));
create policy athletes_update on public.athletes for update to authenticated using (public.can_access_athlete(id)) with check (public.can_access_athlete(id));

create policy team_athletes_read on public.team_athletes for select to authenticated using (public.is_team_member(team_id));
-- Adding an existing athlete to a second team: admin of the new team, and the
-- athlete already visible through one of the admin's other teams.
create policy team_athletes_insert on public.team_athletes for insert to authenticated with check (public.is_team_admin(team_id) and public.can_access_athlete(athlete_id));
create policy team_athletes_delete on public.team_athletes for delete to authenticated using (public.is_team_admin(team_id));

create policy measurements_read on public.athlete_measurements for select to authenticated using (public.can_access_athlete(athlete_id));
create policy measurements_insert on public.athlete_measurements for insert to authenticated with check (public.can_access_athlete(athlete_id) and public.has_measurement_consent(athlete_id) and recorded_by = auth.uid());
create policy measurements_update on public.athlete_measurements for update to authenticated using (public.can_access_athlete(athlete_id)) with check (public.can_access_athlete(athlete_id) and public.has_measurement_consent(athlete_id));
create policy measurements_delete on public.athlete_measurements for delete to authenticated using (public.can_access_athlete(athlete_id));

create policy test_days_read on public.test_days for select to authenticated using (public.can_see_test_day(id));
create policy test_days_insert on public.test_days for insert to authenticated with check (public.is_team_member(team_id) and created_by = auth.uid());
create policy test_days_update on public.test_days for update to authenticated using (public.is_team_member(team_id)) with check (public.is_team_member(team_id));
create policy test_days_delete on public.test_days for delete to authenticated using (public.is_team_admin(team_id));

create policy results_read on public.test_results for select to authenticated using (public.can_access_athlete(athlete_id));
create policy results_insert on public.test_results for insert to authenticated with check (public.can_record_result(test_day_id, athlete_id) and recorded_by = auth.uid());
create policy results_update on public.test_results for update to authenticated using (public.can_record_result(test_day_id, athlete_id)) with check (public.can_record_result(test_day_id, athlete_id) and recorded_by = auth.uid());
create policy results_delete on public.test_results for delete to authenticated using (public.can_record_result(test_day_id, athlete_id));

-- ============================================================
-- 202610070002_programming.sql
-- ============================================================
-- Spenst: the year plan, team sessions with variants, and the athlete's log.
--
-- Apply after 202610070001_initial.sql. Not yet applied anywhere.
--
-- Design: docs/athletes-and-programming.md. In short:
--   * Each team has a season plan: phases and blocks laid over a run of weeks,
--     each with a focus and notes, plus labels on single weeks. Sessions are
--     not owned by a period; they sit on dates in the team's calendar.
--   * The whole team trains the same sessions. A session's content (sections
--     → exercise slots → set groups, with easier/harder variants per slot) is
--     one JSON document, checked by parseSessionContent in lib/training.ts.
--   * Which variant an athlete trains is chosen in the session itself; the
--     log records the exercise actually done. Nothing is stored per athlete.
--   * Built-in exercises live in code (lib/exercise-library.ts) under
--     permanent `builtin:` keys; this table holds only a team's own. Slots and
--     logs refer to exercises by text key, never by FK.
--   * Athletes get accounts: athletes.profile_id links an athlete record to a
--     login, and from there they read their team's plan and published
--     sessions and write their own log.

do $$ begin create type public.session_status as enum ('draft', 'published'); exception when duplicate_object then null; end $$;
do $$ begin create type public.workout_status as enum ('in_progress', 'completed', 'skipped'); exception when duplicate_object then null; end $$;
do $$ begin create type public.exercise_modality as enum ('strength', 'power', 'olympic', 'plyometric', 'sprint', 'med-ball', 'conditioning', 'prep', 'isometric'); exception when duplicate_object then null; end $$;
do $$ begin create type public.period_kind as enum ('training', 'competition', 'break'); exception when duplicate_object then null; end $$;
do $$ begin create type public.velocity_zone as enum ('absolute-strength', 'accelerative-strength', 'strength-speed', 'speed-strength'); exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Athlete accounts

alter table public.athletes add column profile_id uuid unique references public.profiles(id) on delete set null;

create or replace function public.is_own_athlete(target_athlete_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.athletes where id = target_athlete_id and profile_id = auth.uid())
$$;

-- Signed in as an athlete rostered on the team.
create or replace function public.is_rostered_on(target_team_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from public.team_athletes roster
    join public.athletes athlete on athlete.id = roster.athlete_id
    where roster.team_id = target_team_id and athlete.profile_id = auth.uid()
  )
$$;

-- Coach or athlete: anyone who belongs to the team.
create or replace function public.can_see_team(target_team_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_team_member(target_team_id) or public.is_rostered_on(target_team_id)
$$;

create policy athletes_read_self on public.athletes for select to authenticated using (profile_id = auth.uid());
create policy teams_read_rostered on public.teams for select to authenticated using (public.is_rostered_on(id));
create policy team_athletes_read_self on public.team_athletes for select to authenticated using (public.is_own_athlete(athlete_id));
create policy results_read_self on public.test_results for select to authenticated using (public.is_own_athlete(athlete_id));
create policy measurements_read_self on public.athlete_measurements for select to authenticated using (public.is_own_athlete(athlete_id));
create policy test_days_read_self on public.test_days for select to authenticated using (
  -- Qualified on purpose: a bare `id` here would bind to test_results.id.
  exists(select 1 from public.test_results result where result.test_day_id = test_days.id and public.is_own_athlete(result.athlete_id))
);

-- ---------------------------------------------------------------------------
-- The year plan

create table public.seasons (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 80),
  starts_on date not null check (extract(isodow from starts_on) = 1),
  weeks smallint not null default 52 check (weeks between 4 and 60),
  throughline text not null default '',
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Phases and blocks. Periods on one level of a season must not overlap; the
-- builder refuses it (overlapsOnLevel in lib/season.ts) and so does the
-- exclusion constraint below.
create extension if not exists btree_gist;
create table public.periods (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete cascade,
  -- Text, not an enum: the exclusion constraint needs it in a GiST index,
  -- and btree_gist cannot index an enum.
  level text not null check (level in ('phase', 'block')),
  kind public.period_kind not null default 'training',
  title text not null check (char_length(trim(title)) between 1 and 80),
  starts_on date not null check (extract(isodow from starts_on) = 1),
  weeks smallint not null check (weeks between 1 and 60),
  emphasis public.velocity_zone,
  focus text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  exclude using gist (season_id with =, level with =, daterange(starts_on, starts_on + weeks * 7) with &&)
);

create table public.week_notes (
  season_id uuid not null references public.seasons(id) on delete cascade,
  week_start date not null check (extract(isodow from week_start) = 1),
  label text not null check (char_length(trim(label)) between 1 and 60),
  primary key (season_id, week_start)
);

-- ---------------------------------------------------------------------------
-- Exercises and sessions

create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 80),
  modality public.exercise_modality not null,
  -- The metrics vocabulary of lib/training.ts.
  metrics text[] not null check (metrics <@ array['reps', 'load', 'velocity', 'power', 'contacts', 'height', 'distance', 'time', 'rpe']::text[] and cardinality(metrics) > 0),
  unilateral boolean not null default false,
  velocity_metric text check (velocity_metric in ('mean', 'peak')),
  cue text not null default '',
  created_by uuid not null references public.profiles(id),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((velocity_metric is null) = not ('velocity' = any(metrics)))
);

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  scheduled_on date,
  title text not null default 'Session' check (char_length(trim(title)) between 1 and 80),
  status public.session_status not null default 'draft',
  content jsonb not null default '{"sections": []}'::jsonb check (jsonb_typeof(content -> 'sections') = 'array'),
  updated_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- The athlete's log

-- One athlete doing one session on one day; `session_id` is null for
-- training outside the plan.
create table public.workouts (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  session_id uuid references public.sessions(id) on delete set null,
  performed_on date not null,
  status public.workout_status not null default 'in_progress',
  readiness smallint check (readiness between 1 and 5),
  session_rpe smallint check (session_rpe between 1 and 10),
  duration_minutes smallint check (duration_minutes between 1 and 600),
  note text not null default '',
  logged_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index workouts_once_per_session on public.workouts(athlete_id, session_id) where session_id is not null;

-- Actuals per set, in the vocabulary the prescription used. `slot_id` points
-- into the session's content; `exercise_key` is what was actually done — the
-- variant, if the athlete trained one — and keeps the set readable even if
-- the slot is later edited away.
create table public.set_logs (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null references public.workouts(id) on delete cascade,
  slot_id uuid not null,
  exercise_key text not null check (char_length(exercise_key) between 3 and 80),
  variant_level smallint not null default 0 check (variant_level between -1 and 1),
  set_index smallint not null check (set_index between 1 and 99),
  side public.result_side not null default 'both',
  reps smallint check (reps between 0 and 999),
  load_kg numeric(6,2) check (load_kg >= 0),
  velocity numeric(5,3) check (velocity > 0 and velocity < 10),
  power numeric(7,1) check (power > 0),
  contacts smallint check (contacts between 0 and 999),
  height_cm numeric(5,1) check (height_cm >= 0),
  distance_m numeric(7,2) check (distance_m >= 0),
  time_s numeric(7,2) check (time_s >= 0),
  rpe numeric(3,1) check (rpe between 1 and 10),
  completed boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workout_id, slot_id, set_index, side)
);

create index idx_seasons_team on public.seasons(team_id, starts_on desc);
create index idx_periods_season on public.periods(season_id, starts_on);
create index idx_exercises_team on public.exercises(team_id) where archived_at is null;
create index idx_sessions_team_date on public.sessions(team_id, scheduled_on);
create index idx_workouts_athlete on public.workouts(athlete_id, performed_on desc);
create index idx_set_logs_workout on public.set_logs(workout_id);

create trigger seasons_touch before update on public.seasons for each row execute function public.touch_updated_at();
create trigger periods_touch before update on public.periods for each row execute function public.touch_updated_at();
create trigger exercises_touch before update on public.exercises for each row execute function public.touch_updated_at();
create trigger sessions_touch before update on public.sessions for each row execute function public.touch_updated_at();
create trigger workouts_touch before update on public.workouts for each row execute function public.touch_updated_at();
create trigger set_logs_touch before update on public.set_logs for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Access helpers

create or replace function public.season_team(target_season_id uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select team_id from public.seasons where id = target_season_id
$$;

create or replace function public.can_read_workout(target_workout_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from public.workouts
    where id = target_workout_id and (public.is_own_athlete(athlete_id) or public.can_access_athlete(athlete_id))
  )
$$;

-- ---------------------------------------------------------------------------
-- Grants

revoke all on public.seasons, public.periods, public.week_notes, public.exercises, public.sessions, public.workouts, public.set_logs from anon, authenticated;
revoke all on function public.is_own_athlete(uuid), public.is_rostered_on(uuid), public.can_see_team(uuid), public.season_team(uuid), public.can_read_workout(uuid) from public, anon;

grant select, insert, update, delete on public.seasons, public.periods, public.week_notes to authenticated;
grant select, insert, update on public.exercises to authenticated;
grant select, insert, update, delete on public.sessions to authenticated;
grant select, insert, update, delete on public.workouts, public.set_logs to authenticated;
grant execute on function public.is_own_athlete(uuid), public.is_rostered_on(uuid), public.can_see_team(uuid), public.season_team(uuid), public.can_read_workout(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Policies: coaches plan, the whole team reads, athletes write their own log.

alter table public.seasons enable row level security;
alter table public.periods enable row level security;
alter table public.week_notes enable row level security;
alter table public.exercises enable row level security;
alter table public.sessions enable row level security;
alter table public.workouts enable row level security;
alter table public.set_logs enable row level security;

create policy seasons_read on public.seasons for select to authenticated using (public.can_see_team(team_id));
create policy seasons_insert on public.seasons for insert to authenticated with check (public.is_team_member(team_id) and created_by = auth.uid());
create policy seasons_update on public.seasons for update to authenticated using (public.is_team_member(team_id)) with check (public.is_team_member(team_id));
create policy seasons_delete on public.seasons for delete to authenticated using (public.is_team_admin(team_id));

create policy periods_read on public.periods for select to authenticated using (public.can_see_team(public.season_team(season_id)));
create policy periods_write on public.periods for all to authenticated using (public.is_team_member(public.season_team(season_id))) with check (public.is_team_member(public.season_team(season_id)));

create policy week_notes_read on public.week_notes for select to authenticated using (public.can_see_team(public.season_team(season_id)));
create policy week_notes_write on public.week_notes for all to authenticated using (public.is_team_member(public.season_team(season_id))) with check (public.is_team_member(public.season_team(season_id)));

create policy exercises_read on public.exercises for select to authenticated using (public.can_see_team(team_id));
create policy exercises_insert on public.exercises for insert to authenticated with check (public.is_team_member(team_id) and created_by = auth.uid());
create policy exercises_update on public.exercises for update to authenticated using (public.is_team_member(team_id)) with check (public.is_team_member(team_id));

-- Athletes see a session once it is published; coaches always.
create policy sessions_read on public.sessions for select to authenticated using (public.is_team_member(team_id) or (status = 'published' and public.is_rostered_on(team_id)));
create policy sessions_insert on public.sessions for insert to authenticated with check (public.is_team_member(team_id) and updated_by = auth.uid());
create policy sessions_update on public.sessions for update to authenticated using (public.is_team_member(team_id)) with check (public.is_team_member(team_id) and updated_by = auth.uid());
create policy sessions_delete on public.sessions for delete to authenticated using (public.is_team_member(team_id));

create policy workouts_read on public.workouts for select to authenticated using (public.is_own_athlete(athlete_id) or public.can_access_athlete(athlete_id));
create policy workouts_insert on public.workouts for insert to authenticated with check ((public.is_own_athlete(athlete_id) or public.can_access_athlete(athlete_id)) and logged_by = auth.uid());
create policy workouts_update on public.workouts for update to authenticated using (public.is_own_athlete(athlete_id) or public.can_access_athlete(athlete_id)) with check (public.is_own_athlete(athlete_id) or public.can_access_athlete(athlete_id));
create policy workouts_delete on public.workouts for delete to authenticated using (public.is_own_athlete(athlete_id) or public.can_access_athlete(athlete_id));

create policy set_logs_read on public.set_logs for select to authenticated using (public.can_read_workout(workout_id));
create policy set_logs_write on public.set_logs for all to authenticated using (public.can_read_workout(workout_id)) with check (public.can_read_workout(workout_id));

-- ============================================================
-- 202610070004_ovr_imports.sql
-- ============================================================
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

-- ============================================================
-- 202610070005_test_batteries.sql
-- ============================================================
-- Spenst: test batteries — which tests a team's power profile is made of.
--
-- Apply after 202610070004_ovr_imports.sql. Not yet applied anywhere.
--
-- The built-in batteries live in code (lib/power-profile.ts, keys
-- `builtin:…`); "Spenst 7" is the default. A team can make its own, and picks
-- the one it tests on as a team setting. The battery sets the tests on a test
-- day, the order of the radar, the leaderboard lists and the squad bests.

-- The battery the team tests on: a built-in key, or the id of one of the
-- team's own. One the app cannot find falls back to the default.
alter table public.teams add column battery_key text not null default 'builtin:spenst-7'
  check (char_length(battery_key) between 3 and 80);

-- Team settings are for the team's admins, like the name and the logo.
grant update (battery_key) on public.teams to authenticated;

create table public.test_batteries (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 60),
  description text not null default '' check (char_length(description) <= 300),
  -- Test keys from the catalogue in code, in radar order.
  test_keys text[] not null check (cardinality(test_keys) between 1 and 20),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_test_batteries_team on public.test_batteries(team_id);
create trigger test_batteries_touch before update on public.test_batteries for each row execute function public.touch_updated_at();

revoke all on public.test_batteries from anon, authenticated;
grant select, insert, update, delete on public.test_batteries to authenticated;
alter table public.test_batteries enable row level security;

-- Any coach on the team can make and change batteries; athletes on the roster
-- can see what they are tested on.
create policy test_batteries_read on public.test_batteries for select to authenticated using (public.is_team_member(team_id) or public.is_rostered_on(team_id));
create policy test_batteries_insert on public.test_batteries for insert to authenticated with check (public.is_team_member(team_id) and created_by = auth.uid());
create policy test_batteries_update on public.test_batteries for update to authenticated using (public.is_team_member(team_id)) with check (public.is_team_member(team_id));
create policy test_batteries_delete on public.test_batteries for delete to authenticated using (public.is_team_member(team_id));

-- ============================================================
-- 202611130001_delete_athlete.sql
-- ============================================================
-- Spenst: deleting an athlete for good.
--
-- Until now an athlete could only be taken off a team (team_athletes_delete),
-- which leaves the athlete row, their results, measurements and OVR rows in
-- the database with nobody able to see them. Deleting is the privacy-minded
-- answer when an athlete leaves: everything about them goes, by the
-- `on delete cascade` on every table that references public.athletes.
--
-- Only an admin of EVERY team the athlete is on may delete them, so one
-- team's admin cannot wipe history another team still uses — they can only
-- take the athlete off their own team. Files in the ovr-exports bucket are
-- not touched: an export holds the whole squad, not one athlete.

create or replace function public.delete_athlete(target_athlete_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'You must be signed in'; end if;
  if not exists (select 1 from public.team_athletes where athlete_id = target_athlete_id) then
    raise exception 'No such athlete on your teams';
  end if;
  if exists (
    select 1 from public.team_athletes
    where athlete_id = target_athlete_id and not public.is_team_admin(team_id)
  ) then
    raise exception 'Only an admin of every team the athlete is on can delete them';
  end if;
  delete from public.athletes where id = target_athlete_id;
end;
$$;

revoke all on function public.delete_athlete(uuid) from public, anon;
grant execute on function public.delete_athlete(uuid) to authenticated;

notify pgrst, 'reload schema';

-- ============================================================
-- 202611130002_matches_and_session_slots.sql
-- ============================================================
-- Spenst: matches on the team calendar, and an AM/PM slot for sessions
-- (decision 24, issue #5).
--
--   * A match is a calendar item, like a session: it sits on a date and is
--     owned by no period, so moving a block never orphans one. The plan labels
--     every day by the nearer match (MD-3, MD, MD+1) — computed in the app,
--     never stored.
--   * Coaches on the team read and write matches; athletes rostered on the
--     team read them (no athlete screen yet).
--   * A session may sit in the morning or the afternoon slot of its day, for
--     the days the team trains twice. Null means “any time”.

-- ---------------------------------------------------------------------------
-- Sessions: the slot

alter table public.sessions
  add column slot text check (slot in ('am', 'pm'));

-- ---------------------------------------------------------------------------
-- Matches

create type public.match_kind as enum ('league', 'cup', 'friendly', 'playoff');

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  played_on date not null,
  -- Local kick-off time; null when not yet known.
  kick_off time,
  opponent text not null check (char_length(trim(opponent)) between 1 and 80),
  home boolean not null default true,
  kind public.match_kind not null default 'league',
  -- A decisive match: something to taper towards.
  priority boolean not null default false,
  note text not null default '' check (char_length(note) <= 500),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_matches_team_date on public.matches(team_id, played_on);
create trigger matches_touch before update on public.matches for each row execute function public.touch_updated_at();

revoke all on public.matches from anon, authenticated;
grant select, insert, delete on public.matches to authenticated;
-- Who made a match, and for which team, never changes.
grant update (played_on, kick_off, opponent, home, kind, priority, note) on public.matches to authenticated;

alter table public.matches enable row level security;

create policy matches_read on public.matches for select to authenticated using (public.can_see_team(team_id));
create policy matches_insert on public.matches for insert to authenticated with check (public.is_team_member(team_id) and created_by = auth.uid());
create policy matches_update on public.matches for update to authenticated using (public.is_team_member(team_id)) with check (public.is_team_member(team_id));
create policy matches_delete on public.matches for delete to authenticated using (public.is_team_member(team_id));

-- ---------------------------------------------------------------------------
-- Moving several sessions at once (a multi-selection dragged to another day)
-- is one statement, so either every session moves or none does. Security
-- invoker: the sessions policies decide, exactly as for a single update.
-- `moves` is `[{ "id": uuid, "scheduled_on": "YYYY-MM-DD" | null, "slot": "am" | "pm" | null }]`.

create or replace function public.move_sessions(moves jsonb) returns void
language sql security invoker set search_path = public as $$
  update public.sessions session
  set scheduled_on = (move ->> 'scheduled_on')::date,
      slot = move ->> 'slot',
      updated_by = auth.uid()
  from jsonb_array_elements(moves) move
  where session.id = (move ->> 'id')::uuid
$$;

revoke all on function public.move_sessions(jsonb) from public, anon;
grant execute on function public.move_sessions(jsonb) to authenticated;

-- ============================================================
-- 202611140001_result_details.sql
-- ============================================================
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

-- Make the new schema visible to PostgREST immediately after a manual SQL Editor run.
notify pgrst, 'reload schema';
