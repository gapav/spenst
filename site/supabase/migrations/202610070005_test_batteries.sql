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
