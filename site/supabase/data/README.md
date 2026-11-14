# Data scripts

The SQL files here are data, not migrations (decision 23): `npm run db:push`
never runs them, and they change no schema. A season script is generated from a
typed, tested template in `lib/season-templates/` by `npm run data:season-template`
(never edit the SQL by hand), names in its header the team and season it
targets, and refuses to run unless it finds exactly that season. A one-off
backfill (`202611140001-backfill-result-details.sql`) is written by hand, says
in its header which migration it follows and which rule in `lib/` it mirrors,
and only fills what is empty. The maintainer
runs one once, after a backup, from `site/`: `npm run db:backup`, then
`npm run db:sql -- -f supabase/data/<file>.sql`. Each script is one
transaction and gives the same result when run twice. (`db:sql` wraps the
file in a transaction of its own, so psql warns that one is already in
progress; the warnings are harmless.)
