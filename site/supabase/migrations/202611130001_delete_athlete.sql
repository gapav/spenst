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
