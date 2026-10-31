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
