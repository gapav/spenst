# Data scripts

The SQL files here are data, not migrations (decision 23): `npm run db:push`
never runs them, and they change no schema. Each one is generated from a typed,
tested template in `lib/season-templates/` (never edit the SQL by hand):

- `npm run data:season-template` writes a season's phases, week notes and
  matches for an existing team. The script names the team and season in its
  header and refuses to run unless it finds exactly that season.
- `npm run data:team-seed` writes a whole test team: the team, a season
  copied from another team's live season, athletes, measurements, test days,
  blocks and sessions. It only adds, and refuses to run if the team exists.

A one-off backfill (`202611140001-backfill-result-details.sql`) is the
exception: written by hand, it says in its header which migration it follows
and which rule in `lib/` it mirrors, and only fills what is empty.

The maintainer runs one once, after a backup, from `site/`:
`npm run db:backup`, then `npm run db:sql -- -f supabase/data/<file>.sql`.
Each script is one transaction and gives the same result when run twice.
(`db:sql` wraps the file in a transaction of its own, so psql warns that one
is already in progress; the warnings are harmless.)
