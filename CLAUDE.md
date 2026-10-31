# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository layout

All application code lives in `site/`. The repo root holds `README.md` and
`IMPLEMENTATION_PLAN.md` (product brief, decisions, open questions, checklist),
and `docs/` holds working design documents (programming and athletes;
visualization backlog) — read the relevant one before building those features.
`site/AGENTS.md` (aliased by `site/CLAUDE.md`) holds the working rules.

Spenst is a **separate product** from Grep (`~/code/plannr`): its own Supabase
project, accounts, teams and exercise library, and no data shared between them.
It deliberately shares Grep's stack, versions, design tokens, shell and
data-layer pattern, copied as code. When something is copied from Grep it says
so in a comment; keep the *visual* layer (tokens, shell, primitives) in step
with Grep, but never couple the two apps' data or deployments.

## Commands

Run everything from `site/` with `npm`:

```bash
npm run dev            # next dev
npm run build          # next build --webpack (Webpack is deliberate, as in Grep)
npm run lint           # eslint (flat config)
npm test               # vitest run
npx vitest run lib/power-profile.test.ts     # single file
npx vitest run -t "tags from 3%"             # single test by name
```

## Hard rules

- **Never mutate a database.** No `supabase db push/reset/start`, no applying
  migrations. The user applies SQL by hand in the Supabase dashboard. Change the
  schema only by adding files to `site/supabase/migrations/`, never claim a
  migration has been applied, and treat shipped migrations as immutable.
- **This is Next.js 16.** Page props use the generated `PageProps<"/route">` /
  `LayoutProps<"/">` types. Read `site/node_modules/next/dist/docs/` before
  changing framework code.
- **Athlete data is privacy-minimized.** Names are “Firstname L.”
  (`minimizeAthleteName` and the `minimize_athlete_name` trigger), birth dates
  are stored to the month, and height/sitting height/body mass only with
  `measurement_consent` — withdrawing it deletes them. Do not widen this
  without an explicit instruction. Athletes are 14 and up (from the year they
  turn 14, enforced by `enforce_minimum_age`); many are minors.
- **Never write a colour in a component.** Use a token. `lib/theme-tokens.test.ts`
  fails on literals and checks contrast in both themes. A new colour is a token
  on `:root` and in the dark block.
- **The UI is in English**, formatted as `en-GB` ("6 Oct", "1.23 s",
  "1,513 W", metric units). Typed decimals accept a comma as well as a point.
  Use typographic quotes and apostrophes (“ ” ’) in copy.
- Keep secrets out of `NEXT_PUBLIC_*`. There are no server-side secrets yet.

## Architecture

### Same shape as Grep

- `components/app-provider.tsx` is the whole state and data layer, read
  through `useSpenst()`. Pages are thin client components.
- Mutations: optimistic `setState` → `persist(() => supabase…)`, rolled back
  on failure.
- **Demo mode:** with no `NEXT_PUBLIC_SUPABASE_URL` /
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, the Supabase client is `null`, the
  provider seeds from `lib/demo-data.ts`, and `persist(null)` is a no-op. Every
  new mutation must handle that branch.
- **Security lives in Postgres.** The browser talks to PostgREST directly; RLS
  and grants are the boundary. Policies are built from the helpers in the
  initial migration (`is_team_member`, `can_access_athlete`,
  `can_record_result`, `can_see_test_day`, `has_measurement_consent`).
  Multi-row writes that must be atomic are RPCs (`create_team`, `add_athlete`).

### The domain (all pure, all tested, all in `lib/`)

- `power-profile.ts` — test catalogue (`TESTS`); **test batteries**
  (`BUILTIN_BATTERIES`, default `Spenst 7`, `batteryFor(team, customBatteries)`
  — a team setting, `teams.battery_key`, with a team's own in
  `test_batteries`, migration `202610070005`); and
  **values, not scores**: `valueHistory` / `latestValues`, `squadValues`,
  `profileFor` (latest, previous, change, share of the squad's best, place in
  the squad, position in the squad's range). **No 0–10 scores, tiers, norms or
  totals — decided; do not reintroduce them without an explicit instruction.**
  Everything that lists tests (test day, radar, leaderboard, squad bests) takes
  the team's battery; `populationFor` is only for maturity and labels now.
- `squad.ts` — selectors pages use: `summarizeSquad` (every athlete against the
  squad given), `asymmetryFlags`, `testDayProgress`.
- `asymmetry.ts` — split squat jump L/R (Ballou's 3% / 10%).
- `maturity.ts` — decimal age from birth month, Moore 2015 maturity offset.
- `vbt.ts` — velocity zones, rep lights, set verdicts. (No load–velocity profiling or spot checks: removed, decision 15.)
- `ovr.ts` — corrections for OVR exports (bar-only jump power, alternating reps).
  The export format is unconfirmed; see the plan.
- `leaderboard.ts` — ranks per test (ties share a place). No points.

### The year plan (`lib/season.ts`, `/plan`)

- **One plan per team, one set of sessions for the whole team.** No per-athlete
  programs. A `Season` is a run of weeks; `Period`s are week-aligned spans on
  two levels — `phase` (makro: training / competition / break) and `block`
  (meso, optionally with a velocity-zone `emphasis`) — each with a `focus` and
  `notes`; `WeekNote`s label single weeks; the season's `throughline` is
  Ballou's "speed strength in all phases" line.
- Periods on one level never overlap (`overlapsOnLevel`, enforced again by an
  exclusion constraint). Sessions are **not** owned by a period: they sit on
  dates in the team's calendar, so moving a block never orphans one.
- The timeline (`components/season-timeline.tsx`) is a CSS grid of week
  columns. Mouse drags across free weeks to create; touch taps (a drag must
  scroll the year); keyboard uses “New phase” / “New block”.

### Variants

- A slot can offer an easier (−1) and a harder (+1) **variant**: another
  exercise, with the slot's prescription or its own. `resolveSlot(slot, level)`
  says what that variant prescribes; it falls back to the slot as written.
- **Which variant is an in-session choice**, made by the athlete with the coach
  on the day — not an athlete setting. Nothing is stored per athlete; the log
  records the exercise actually done. Planning views show slots as written.
- The library suggests natural ladders (`suggestedVariants` from the
  `easier` / `harder` keys in `lib/exercise-library.ts`).

### OVR import (`lib/xlsx.ts`, `lib/ovr-import.ts`, `/testing/import`)

- Nearly all test data arrives as an **OVR Connect export**: one .xlsx with
  Velocity (row per rep), Jump (row per jump) and Sprint (row per split)
  sheets. Every cell is text, columns are found by header, and **every export
  holds the whole history** — so an import is a comparison: `planImport`
  marks each value new / same / differs against what is stored, and only new
  values go in by default. Importing the same file twice is a no-op.
- `lib/xlsx.ts` is a minimal reader (fflate + DOMParser), parsed in the
  browser before anything is uploaded.
- Power tests take the best rep's **Peak Power**; sprints the fastest Total
  Time at a cumulative distance (OVR's Distance is per split — Speed is
  Distance / Split Time). Training reps feed no test, but are kept as rows.
- **One-leg tests are alternating reps**: one OVR exercise, sets of 8, reps
  1, 3, 5, 7 the starting leg (`firstLeg` on the mapping, default left = left
  foot forward). `legsOf` assigns legs and stores `side` on each `ovr_rows` row;
  `alternatingIssues` flags sets that are not exactly 8 reps (one missed rep
  swaps every leg after it). An exercise per leg ("… - L") still works via `side`.
- Names: OVR's (often full) names are minimised and matched to the roster;
  matches are remembered in `test_imports.summary`, coaches only, like the file.
- **Every row is kept**, not just the best values: `ovrRows` turns each rep,
  jump and split of a matched athlete into an `ovr_rows` row with every column
  (unknown future columns go to `extra` jsonb). `row_key` (sheet|date|exercise|
  set|rep#occurrence) makes the full-history export idempotent; `checksum`
  catches rows OVR changed. The `import_ovr_rows` RPC (security invoker, so RLS
  applies) adds new keys, updates changed ones, and leaves the rest untouched.
  `mergeOvrRows` is the same rule in JS for demo mode and tests.
- `ovr_rows` is **not** in `loadPrivateData` — a season of reps is too much.
  `loadOvrRows(athleteId)` pages it in on demand; `ovrRowsVersion` bumps after
  an import or undo. Shown by `components/athlete-ovr-data.tsx` (trend +
  every rep of every session); `lib/ovr-data.ts` holds the reading helpers.
- **Test days are read, not typed, for OVR tests.** `components/test-results.tsx`
  draws the squad as ranked dot strips (attempts small, the best large, left/right
  joined, the gap to first beside each), with a metric switch, tooltips, per-athlete
  attempt charts and a table view. Attempts come from `testAttempts`
  (`lib/ovr-data.ts`) over `loadOvrRowsForDay`. Only tape and My Jump tests keep
  the typed entry rows.
- Exercise → test/lift mappings are per team (`ovr_mappings`). The raw file
  goes to the private `ovr-exports` bucket (`<team>/<import>/<file>`), and
  results/readings carry `import_id` so an import can be undone.

### Programming (`lib/training.ts`, `lib/exercise-library.ts`)

- **One vocabulary for every kind of training.** An `Exercise` declares the
  `metrics` it can be measured in; a `SetGroup` sets targets (`{ min, max }`)
  in that vocabulary; the athlete's log records actuals in the same terms.
  The builder only offers the fields an exercise's metrics allow.
- **The built-in library is code**, keyed `builtin:<key>`. Keys are permanent:
  rename freely, never delete or re-key — set logs point at them. Team-made
  exercises are rows in `exercises` (uuid ids).
- **A session's content is one JSON document** (`sessions.content`):
  sections → slots → set groups, edited only through the pure functions in
  `lib/training.ts` and read back through `parseSessionContent`, which drops
  malformed pieces rather than throwing.
- **Content saves are queued per session** in the provider
  (`editSessionContent`): the whole document goes up each time, so saves run in
  order and a slow one can never land after a newer one. Edits apply to the
  latest content via a ref, not to the render that made the callback.
- Builder fields (`components/target-field.tsx`) commit on blur from the
  input's own value, and accept "5", "6–8", "0,75–0,90"; rest takes "90" or "2:30".

A sided test stores `side = 'left' | 'right'`; everything else is `side =
'both'` in the database and `null` in the app (so the unique constraint covers
it). A sided test only counts when both legs come from the same test day.

### Styling

Tailwind v4 with Grep's tokens copied verbatim into `app/globals.css`, plus
Spenst's own below them: `--signature` (lime; Grep's is apricot), the tier ramp
`--tier-1…5` (with `-ink`, now only a sequential ramp for e.g. sprint splits) and `--tier-1…5-mark` (marks,
≥2:1 on the card), and `--chart-*`. `<html data-theme>` holds the resolved
theme, set before first paint by `themeScript` (`lib/theme.ts`, key
`spenst-theme`). The shell classes are Grep's with the prefix `spenst-`.

## Tests

Vitest + jsdom, `@/*` aliased to `site/`. Tests sit beside their modules. New
behaviour in `lib/` comes with a focused test; scale `lint`/`build` to the risk
of the change, and report any check you did not run.
