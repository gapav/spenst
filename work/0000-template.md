---
id: 0000
title: The template — everything built before work items
status: done
created: 2026-10-07
depends-on: []
decisions: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]
migrations: [202610070001_initial.sql, 202610070002_programming.sql, 202610070004_ovr_imports.sql, 202610070005_test_batteries.sql]
---

## Why

The record of what existed when `IMPLEMENTATION_PLAN.md`'s checklist was
split into work items (31 October 2026). Closed; later work is new items.

## Done

- [x] Next.js 16 + Tailwind 4 + Supabase scaffold on Grep's stack and versions.
- [x] Grep's design system: tokens, DM Sans, shell, sidebar, drawer, bottom
      nav, theme switch (light/dark/system), page headings, segments, cards.
- [x] Demo mode with generated squads (15-year-old girls, a senior men's team).
- [x] Power profile: catalogue and batteries; values, change since last test, place in the squad. Scoring, tiers, norms and totals removed (decision 17).
- [x] Athlete profile: spider chart, test table, asymmetry, COD deficit, maturity.
- [x] Testing: test days read from the OVR export as charts; typed entry only for tape and My Jump tests.
- [x] Leaderboard: each test ranked, with the gap to first. No points.
- [x] Overview: latest test day, asymmetry flags, squad bests.
- [x] Initial migration: schema, RLS helpers, policies, grants, RPCs, privacy triggers.
- [x] Vitest coverage for all of `lib/` and the theme tokens.
- [x] Programming vocabulary (`lib/training.ts`): metrics, set groups,
      pairing, summaries, %1RM resolution, and a defensive JSON parser.
- [x] Built-in S&C library: 53 exercises across nine modalities, with easier/harder ladders.
- [x] Session builder: sections, exercise picker, set groups and ramps, A1/A2
      pairing, velocity-based autoregulation, cues, per-side work, and
      easier/harder variants with library suggestions.
- [x] Season plan: interactive season timeline with phases, blocks (velocity-zone
      emphasis), throughline, week labels and sessions; period and week
      panels with Ballou's week-by-week table; bulk publish per period.
- [x] ~~Athlete levels~~ — dropped 7 Oct 2026: the variant is an in-session choice, not an athlete setting.
- [x] ~~Velocity as calibration~~ — removed 8 Oct 2026 (decision 15).
- [x] OVR import: upload the Connect export, match names and exercises, see
      what is new per date, import; file kept in storage, undo per import.
      Migration `202610070004_ovr_imports.sql`.
- [x] Every OVR row kept (`ovr_rows`), with an OVR data card per athlete:
      a trend of the best of each day and every rep of every session.
- [x] Migration `202610070002_programming.sql`: seasons, periods and week
      notes, team sessions, team-made exercises, athlete exercise levels,
      athlete accounts (`athletes.profile_id`), workouts and set logs, with RLS
      for coaches and athletes.

## Log

- 2026-10-31 closed when the checklist moved to `work/`. The plan's “Next”
  line “OVR importer, once the export format is known” was not carried over:
  the importer is built (above), and confirming the format is the open
  question in `docs/decisions.md`.
