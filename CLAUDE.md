# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository layout

All application code lives in `site/`. At the root:

- `DEPLOYMENT.md` — environments, and the **migration ledger** (which
  migration is applied where).
- `docs/` — `product.md` (the brief), `decisions.md` (numbered, append-only,
  cited as “decision 17”, with the open questions), and working design
  documents (programming and athletes; visualization backlog) — read the
  relevant one before building those features.
- `work/` — one file per change, conventions in `work/README.md`; ideas in
  `work/backlog.md`. `/spec` writes an item, `/ship` finishes one.
- `.claude/rules/` — notes for one area each, loaded when you open its files.
- `site/AGENTS.md` (aliased by `site/CLAUDE.md`) — the working rules.

Spenst is a **separate product** from Grep (`~/code/plannr`): its own Supabase
project, accounts, teams and exercise library, and no data shared between them.
It deliberately shares Grep's stack, versions, design tokens, shell and
data-layer pattern, copied as code. When something is copied from Grep it says
so in a comment; keep the *visual* layer (tokens, shell, primitives) in step
with Grep, but never couple the two apps' data or deployments.

The S&C knowledge behind the domain lives in the maintainer's Obsidian vault,
`~/Library/Mobile Documents/iCloud~md~obsidian/Documents/S&C`. Its `wiki/` is
the first source for an S&C claim (start at `wiki/index.md`, follow
`[[links]]`, cite pages); the `sc-researcher` agent reads it without filling
the session. Never copy anything from `raw/` (copyrighted sources) or
`wiki/athlete/` (the maintainer's own data) into this repo; settings deny
reading both.

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
  migration has been applied, and treat shipped migrations as immutable — the
  ledger in `DEPLOYMENT.md` says which have shipped.
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
  The export format is unconfirmed; see the open questions in `docs/decisions.md`.
- `leaderboard.ts` — ranks per test (ties share a place). No points.

### Year plan, programming and OVR import

The details load from `.claude/rules/` when you open those files. What holds
everywhere:

- **Year plan** (`lib/season.ts`, `/plan`): one plan per team and one set of
  sessions for the whole team — no per-athlete programs. Sessions sit on
  dates, not inside periods. → `season.md`
- **Programming** (`lib/training.ts`, `lib/exercise-library.ts`): one metric
  vocabulary for exercises, targets and logs; a session's content is one JSON
  document edited only through `lib/training.ts`; built-in exercise keys are
  permanent. Easier/harder **variants are an in-session choice**, never an
  athlete setting. → `programming.md`
- **OVR import** (`lib/xlsx.ts`, `lib/ovr-import.ts`, `/testing/import`):
  every export holds the whole history, so an import is a comparison, and
  every rep, jump and split is kept in `ovr_rows`. → `ovr-import.md`
- **The provider and demo data** → `provider.md`; **migrations** → `supabase.md`.

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
