---
paths:
  - "site/supabase/**"
---

# Migrations

- **A new file for every change**: `site/supabase/migrations/YYYYMMDDNNNN_name.sql`,
  after the latest. Check the ledger in `DEPLOYMENT.md` before touching an
  existing file — `applied` ones are immutable (a hook enforces it); write a
  forward migration instead.
- **Runs top to bottom in the Supabase SQL editor**, by hand. No CLI, no
  `supabase db …`, no `psql`.
- **Every new table**: `enable row level security`, then
  `revoke all … from anon, authenticated` and grant `authenticated` only the
  verbs it needs (column-level `grant update (…)` where only some columns may
  change).
- **Policies are `to authenticated` and built from the helpers**:
  `is_team_member`, `can_access_athlete`, `can_record_result`,
  `can_see_test_day`, `has_measurement_consent` (initial migration),
  `is_own_athlete`, `is_rostered_on`, `can_see_team` (programming). Inserts
  check ownership too (`created_by = auth.uid()`). Write a new helper rather
  than inlining a membership query in a policy.
- **Helpers** are `language sql stable security definer set search_path =
  public`, with `revoke all on function … from public, anon` and
  `grant execute … to authenticated`. RPCs that should obey RLS are
  `security invoker` (`import_ovr_rows`).
- **Atomic multi-row writes are RPCs** (`create_team`, `add_athlete`), not
  several client calls.
- **Privacy triggers stay intact**: `minimize_athlete_name`,
  `enforce_minimum_age`, and the consent-withdrawn trigger that deletes
  measurements. A new table holding athlete data gets the same minimisation.
- **Mirror the shape in the app**: types in `lib/types.ts`, loading and
  mutations in `components/app-provider.tsx` (with the demo branch), demo
  rows in `lib/demo-data.ts`.
- **Hand off**: add a `pending` row to the ledger in `DEPLOYMENT.md`, and end
  by naming the exact file(s) the maintainer must apply, in order. Never say
  a migration is applied.
