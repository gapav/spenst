Closes #

<!-- Adapted from Grep's template. Spenst has no hosting yet, so merging
     deploys nothing; the database is what has to be in step (decision 21). -->

## What changed

## Done when

<!-- The issue's "Done when" lines. Tick what is proven and put the evidence
     beside it: the command and its result line, the test name, the screenshot.
     Say why for any line left open. -->

- [ ]

## Checks

<!-- From site/: npm run lint, npm test, npm run build — the result line of
     each. What spec-reviewer (and db-reviewer, for site/supabase/) found, and
     what was fixed. -->

## Before merging

<!-- Every step that must happen before the merge, in order — or write
     "Nothing." Migrations are applied from a local session with
     `npm run db:push` (it backs up first); paste its closing `db:status`. -->

- [ ] Migration `site/supabase/migrations/…sql` applied with `npm run db:push` (one line per file, in order)
