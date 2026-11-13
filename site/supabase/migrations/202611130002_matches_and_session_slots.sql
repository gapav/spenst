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
