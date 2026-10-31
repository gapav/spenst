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
