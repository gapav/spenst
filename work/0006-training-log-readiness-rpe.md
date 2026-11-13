---
id: 0006
title: Training log — readiness, session RPE and sets, on the athlete's phone and by the coach
status: spec
created: 2026-11-13
depends-on: []
decisions: [20]
migrations: [maybe: <next after the latest in site/supabase/migrations>_workout_logging.sql]
---

## Why

Monitoring needs data. The S&C Learning Path's Step 34 (`docs/learning-path.md`)
and task 6 of the central case ask for:

- the smallest monitoring system,
- three rules in the form “if X, then I change Y”.

Both depend on the readiness, session RPE and logged sets that Spenst does
not collect yet.

The schema already has the tables (`workouts` with `readiness` 1–5,
`session_rpe` 1–10 and `duration_minutes`; `set_logs` with every metric of the
vocabulary), with RLS for coaches and athletes. No screen writes to them.
`docs/athletes-and-programming.md` designs “the athlete's phone” and puts it
first among the logging surfaces (decision 3 of that document).

The maintainer also needs **coach entry**. The cases in the Learning Path are
test athletes without accounts, and the maintainer logs his own training as
coach of his own test team. The design document already says “the rack
tablet and coach logging reuse the same player later”. This item builds the
player once and uses it in both places.

## Scope

**In:**

- **The session player (one component, two places).**
  - It follows the sketch in `docs/athletes-and-programming.md`.
  - Readiness (1–5) before the session.
  - For each slot: the athlete's variant, chosen on the spot (easier,
    standard or harder; the log records the exercise done).
  - Prefilled targets, then one tap to confirm each set or edit the actuals.
  - Rest timer, and cue text.
  - After the session: session RPE (1–10) and duration, which give the
    session load = RPE × minutes (Foster et al. 2001).
  - “Skipped” and “pain”, each with a reason.
- **Athlete surface:** `/today` for a signed-in athlete. It shows the
  published sessions of their teams for today and the next days, and opens
  the player.
- **Coach surface:** on the athlete page, “Log a session for this athlete”
  opens the same player. `logged_by` is the coach.
- **History on the athlete page.** Here the athlete page is the
  coach-facing view that already exists, not the athlete's own signed-in
  screen.
  - A list of workouts: date, session, readiness, session RPE, duration and
    load.
  - Prescribed against actual for each slot.
  - A simple weekly load chart.
  - Follow the dataviz rules in the design system: tokens only, a hover
    layer, a table view.
- **Offline-first logging is in scope only if it is small.** Otherwise it
  becomes a follow-up, and this item logs online.

**Out:**

- Monitoring rules and flags (0007).
- OVR velocity matched to logged sets. Typing one number per set stays
  possible, as designed.
- Guardian accounts. Athletes are 14 and up and consent themselves (the
  athletes document, decision 2).
- The gym TV board and compliance reports. Those are later coach tools.

## Done when

- [ ] Pure functions in `lib/` with tests:
  - building a log from a resolved session,
  - session load (RPE × minutes),
  - weekly totals,
  - prescribed compared with actual for one slot.
- [ ] In demo mode, a coach opens the demo athlete, logs a session with
      readiness, three sets and session RPE. It shows in the history
      (screenshot).
- [ ] As a signed-in athlete on the dev project, `/today` shows a published
      session. Logging it writes `workouts` and `set_logs` rows, which the
      coach sees.
- [ ] An athlete cannot see another athlete's log: an RLS check, as a test in
      the pgTAP suite if it exists by then, or as a written manual check.
- [ ] `npm run lint`, `npm test` and `npm run build` pass.

## Manual steps

- [ ] If the schema changes (for example, a `pain` reason or `skipped` per
      slot), apply the migration and update the ledger.
- [ ] Create an athlete account on the dev project to test `/today`.

## Notes and open questions

- **Readiness 1–5 is one number.** The curriculum's monitoring rules often
  use a jump or a bar-speed check as readiness: a CMJ against the athlete's
  baseline, or warm-up bar speed against a baseline.
  - Proposal: keep readiness 1–5 here.
  - Let 0007 read jump and velocity readiness from OVR rows and test results.
- The `workouts` and `set_logs` columns already exist. Check them against the
  player before adding a migration. A migration may not be needed.

## Log

- 2026-11-13 spec written, from the Learning Path review.
