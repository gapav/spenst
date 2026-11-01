# Deploying Spenst

**Status, 31 October 2026: not deployed.** There is no Supabase project yet
(work item 0003), no hosting, and the repository has no remote. Spenst runs
only in demo mode.

## Environments

| Environment | How | Data | State |
|---|---|---|---|
| Demo | `npm run dev` with no `site/.env.local` | Generated squads, nothing saved | Works |
| Development | `site/.env.local` pointing at the dev Supabase project | Real | Not set up (0003) |
| Production | — | Real | Not set up |

Only the Supabase URL and publishable key are configured, both
`NEXT_PUBLIC_*` (`site/.env.example`). There are no server-side secrets yet.

## Proposed, not decided

The same shape as Grep (`~/code/plannr/DEPLOYMENT.md`), as separate projects
that share nothing with Grep (decision 10): a private GitHub repository,
Vercel for the app, Supabase for the database, auth and storage. The Claude
connector (0001) needs a server runtime, which a Vercel route handler provides.

## Migration ledger

The maintainer applies migrations by hand in the Supabase SQL editor. Update
this table whenever one is applied. Each cell is `applied`, `pending` or
`unknown`.

An `applied` migration is immutable: write a new forward migration instead.
A hook (`.claude/hooks/protect-applied-migrations.sh`) refuses edits to
`applied` files and asks first for `unknown` ones or files missing from the
table.

| Migration | dev | prod |
|---|---|---|
| `202610070001_initial.sql` | unknown | unknown |
| `202610070002_programming.sql` | unknown | unknown |
| `202610070004_ovr_imports.sql` | unknown | unknown |
| `202610070005_test_batteries.sql` | unknown | unknown |

There is no `202610070003`: the plan's list of migrations to apply skipped it.
As of 8 October the plan listed all four as still to be applied to a new
project; they stay `unknown` until confirmed.
