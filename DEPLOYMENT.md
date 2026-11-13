# Deploying Spenst

**Status, 13 November 2026: not deployed.** There is a development Supabase
project (#4) and no hosting. The code is on GitHub, in the public
repository `gapav/spenst`; the Supabase project is not connected to it.

## Environments

| Environment | How | Data | State |
|---|---|---|---|
| Demo | `npm run dev` (port 3001) with no `site/.env.local` | Generated squads, nothing saved | Works |
| Development | `site/.env.local` pointing at the dev Supabase project | Real | Set up 13 November 2026 (#4) |
| Production | — | Real | Not set up |

Only the Supabase URL and publishable key are configured, both
`NEXT_PUBLIC_*` (`site/.env.example`). There are no server-side secrets yet.

## Proposed, not decided

The same shape as Grep (`~/code/plannr/DEPLOYMENT.md`), as separate projects
that share nothing with Grep (decision 10): a private GitHub repository,
Vercel for the app, Supabase for the database, auth and storage. The Claude
connector (#2) needs a server runtime, which a Vercel route handler provides.

## Migration ledger

`npm run db:push` keeps the `dev` column in step with the project's own
history (`supabase_migrations.schema_migrations`), which is the real record;
see “Applying migrations” below. Each cell is `applied`, `pending` or
`unknown`.

An `applied` migration is immutable: write a new forward migration instead.
A hook (`.claude/hooks/protect-applied-migrations.sh`) refuses edits to
`applied` files and asks first for `unknown` ones or files missing from the
table.

| Migration | dev | prod |
|---|---|---|
| `202610070001_initial.sql` | applied | pending |
| `202610070002_programming.sql` | applied | pending |
| `202610070004_ovr_imports.sql` | applied | pending |
| `202610070005_test_batteries.sql` | applied | pending |
| `202611130001_delete_athlete.sql` | applied | pending |
| `202611130002_matches_and_session_slots.sql` | applied | pending |

There is no `202610070003`: the plan's list of migrations to apply skipped it.
All four went into the development project on 13 November 2026, in one paste
of `site/supabase/bootstrap.sql` (see below).

## A new project in one paste

`site/supabase/bootstrap.sql` is every migration concatenated in filename
order, so an **empty** project is built with one paste into the SQL editor.
It is generated, copied from Grep's `prod_bootstrap.sql`: run
`npm run db:bootstrap` after adding a migration, and `npm test` fails if the
checked-in file has drifted. `site/supabase/migrations/` stays the source of
truth, and the ledger above records each file as `applied` after a paste.

Never run it against a project that already holds the schema: it is for an
empty project only. A project that has it takes later migrations one file at
a time.

It writes no Supabase migration history
(`supabase_migrations.schema_migrations`), so a project built from it must
be baselined (`npm run db:baseline -- <newest version it held>`) before
`db:push` will touch it. An empty project needs no paste at all: `db:push`
builds it and writes the history. Keep the project's GitHub integration
unconnected, or its automatic deploy would race `db:push`.

## Applying migrations

Since decision 21 the agent applies migrations, with one script,
`site/scripts/db.sh` (adapted from Grep's `scripts/migrate.sh`), from `site/`:

```bash
npm run db:status                    # applied and pending migrations
npm run db:push                      # back up, dry-run, apply what is pending
npm run db:baseline -- 202610070005  # mark migrations already in the schema applied
npm run db:backup                    # dump public and auth users into backups/
npm run db:sql -- "select …"         # one query, in a transaction
```

`db:push` refuses, and applies nothing, when the history is empty but
`public` has tables (baseline first), when a file is older than the newest
applied migration, or when the project has a version this checkout lacks.
Every push first writes a checksummed backup to `backups/` (gitignored), so
there is always one from just before a schema change. It is `pg_dump` of the
`public` schema and of `auth.users`/`auth.identities` — not Storage files.

**The connection** is `site/.env.db` (gitignored; template
`site/.env.db.example`), set up once by the maintainer:

1. Supabase dashboard → **Connect** (top bar) → **Session pooler**, copy the
   URI. Not the Direct connection (IPv6-only) or the Transaction pooler
   (port 6543).
2. `cp site/.env.db.example site/.env.db` and paste it as `SUPABASE_DB_URL`,
   with `[YOUR-PASSWORD]` replaced by the database password (Project
   Settings → Database → Reset database password, if it is lost).

The script hands the password to the tools through `PGPASSWORD`, never on a
command line. Agents are denied reading the file.

It needs `psql`/`pg_dump` 17 (`brew install postgresql@17`) and the
Supabase CLI (`brew install supabase/tap/supabase`).
