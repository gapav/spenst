# Spenst — Product brief, implementation plan and checklist

Spenst is a separate app from Grep, in the same design family: physical
testing, a power profile, and a season plan of shared team sessions with
individual variants and kilos, for youth and adult team-sport squads. Built for
Norwegian handball clubs and the gear they can actually afford: OVR Sprint
gates and a single OVR Velocity bar sensor. The name is the Norwegian word for explosiveness, the
quality the profile measures.

This file records the product thinking behind the template, the decisions it
encodes, and the questions that are still open. `CLAUDE.md` describes the code.

Two working documents sit beside it in `docs/`:

- `docs/athletes-and-programming.md` — the training model as built: one
  season plan per team, variants chosen in the session, every OVR rep kept
  with one OVR, the prescription vocabulary, and the athlete's phone still to
  build.
- `docs/visualization-ideas.md` — the backlog of graphs and diagrams, led by
  the profile emblem.

## Where this came from

A design conversation about an S&C app for athletes and coaches, and David
Ballou's talk on Alabama's power profile (Summer Strong 2019). The
conversation established:

- **Data capture is already solved.** OVR Connect records sprint splits and
  per-rep bar velocity and power, and has a coach mode with rosters and live
  leaderboards. Spenst's value is in interpreting and programming, not in capture.
- **OVR can produce a Ballou-style power profile.** OVR Velocity reports peak
  power per rep, which is what Ballou ranks on. Sprints give time rather than
  power, and that is a valid measure. The battery is about seven power tests
  from OVR Velocity and two or three time-based tests from OVR Sprint, kept as
  measured — no 0–10 scores and no total (decision 17).
- **Youth and adult share one data model.** The tests and workflow are the
  same; the interpretation switches on the athlete's profile. Youth adds
  maturity estimation and no max testing by default. Adults add readiness.
- **The gap in the market** is Ballou's method as the default (not a blank
  canvas), youth handling the American tools ignore, Norwegian club reality
  (several teams per coach, players moving between squads), and a low price
  point thanks to cheap devices.

From Ballou's talk, the parts Spenst encodes:

| Ballou | Spenst |
|---|---|
| 10 exercises, each 0–10, summed to 100 | **Not adopted** (decision 17): values as measured, the change since last time, and the place in the squad (`profileFor`) |
| Poor / below average / average / above average / elite | **Not adopted** (decision 17): no tiers, no labels on athletes |
| Spider chart per athlete | `PowerRadar`, each spoke spanning the squad (weakest → best), dashed at the squad median |
| Split squat jump L/R, ratio 1.0; tag ≥3%, >10% "something is coming" | `asymmetry()`, `ASYMMETRY_TAG_PERCENT`, `ASYMMETRY_HIGH_PERCENT` |
| Body weight + bar entered for jump power | `correctJumpPower` (bar-only power × (body + bar) / bar) |
| Leaderboard: 10 points for 1st … 1 for 10th | Ranks per test with the gap to first; **no points or totals** (decision 17) |
| VBT zones | `VELOCITY_ZONES` — a frame for a block's emphasis, not per-lift numbers |
| Green/red reps; bump at 1.05 on a 0.90 day; hold if not all green | `repLight`, `setVerdict` — optional live feedback at the one OVR rack |
| Never below 0.3 m/s with inefficient lifters | `VELOCITY_FLOOR` |
| "Apples to apples": norms from your own device | No norms at all until there is far more data; comparisons stay within the squad |

## Decisions the template makes

Each of these is easy to reverse. They are listed so the reasoning is not lost.

1. **Athletes are independent of teams** and rostered through `team_athletes`.
   One history per athlete when a youth player also trains with the seniors.
   The conversation asked which model fits the club better and did not get an
   answer, so this needs confirming.
2. **Two batteries.** Youth (8 tests: 5 m, 10 m, 505, CMJ, squat jump, split
   squat jump, broad jump, med ball throw) and adult (10 tests: 5 m, 10 m, 505,
   speed squat, trap bar jump, squat jump, split squat jump, hang clean, push
   press, bench). The battery follows the athlete's age (adult from 18), not
   their team.
3. ~~Youth power is scored per kilo~~ — superseded by decision 17: nothing is
   scored. Body mass stays available (with consent) for reading power per kilo.
4. **Privacy-minimized like Grep.** Names stored as “Firstname L.” (trigger),
   birth month only (half a month of error against a ±1 year model),
   measurements only with consent, and withdrawing consent deletes them.
5. ~~Norms are placeholders until there is data~~ — superseded by decision 17:
   no norms, seeded or derived.
6. **Maturity uses Moore et al. (2015)**, shown as a band with ±1 year, never
   ranked on.
7. **The test catalogue lives in code** (`lib/power-profile.ts`), not the
   database. Results reference it by `test_key`. Move it to a table once clubs
   need custom tests.
8. **One value per athlete, test and side per test day**: the best of 2–3
   trials. Trials are not stored yet.
9. **The signature colour is lime.** Everything else is Grep's palette,
   verbatim. Grep's signature is apricot.
10. **Spenst is a separate app from Grep** (decided 7 October 2026). The two do
    different jobs: Grep plans team sessions on the court with the coaching
    staff; Spenst tests athletes and programs and tracks their individual
    training, with athletes as users. So Spenst has its own Supabase project,
    accounts, teams, athletes and exercise library, and reads nothing from
    Grep. What they share is the look (tokens, type, shell) and the
    engineering patterns, copied as code rather than linked.
11. **Athletes are 14 and up**, from the year they turn 14 (decided 7 October
    2026). Counted by birth year like Norwegian age classes, so a whole J14
    squad can join in January; enforced by `enforce_minimum_age` in the
    database and `meetsMinimumAge` in `lib/roster.ts`. Age class also decides
    battery (senior from the year they turn 18). Athletes have
    their own accounts and consent for themselves; no guardian accounts.
12. **Any coach on a team plans for it** (an S&C coach on several teams plans
    each; copying sessions between teams is the planned shortcut), and **the
    athlete's phone is the first logging surface**, with velocity typed as one
    number per reading in v1. Design in `docs/athletes-and-programming.md`.
13. **One year plan per team, same sessions for every athlete, variants
    instead of individual programs** (decided 7 October 2026). The team's
    season is laid out in phases and blocks on an interactive timeline, after
    Ballou's yearly overview; sessions are placed on dates in it. Exercises can
    offer an easier and a harder variant, chosen in the session by the athlete
    with the coach — not stored as an athlete setting (revised the same day).
    This replaces the per-athlete programs, pods
    and overrides of the first design.
14. **The app is in English** (decided 7 October 2026), formatted en-GB.
    Norwegian context stays where it is domain fact — age classes, the age of
    digital consent, Skadefri — but the UI, demo content and database messages
    are English.
15. ~~One OVR: velocity as a calibration tool~~ — **removed 8 October 2026**:
    anchor lifts, load–velocity profiles, spot checks and "load from profile"
    were built from a discussion the user shared, not asked for. Velocity
    stays as a target in the session builder, with the optional bar-speed
    rule; every OVR rep stays in `ovr_rows`.
16. **Test data arrives by OVR export** (decided 7 October 2026). Coaches
    upload the OVR Connect .xlsx; the file is stored as uploaded (private,
    coaches only) and read in the browser into test days and OVR rows. Exports always contain the full history, so imports compare and
    write only what is new; values typed by hand win unless the coach chooses
    to replace them. Typing results in stays possible. **Every row is kept**
    (decided the same day): each rep, jump and split of a rostered athlete,
    with every column OVR writes — training included — in `ovr_rows`, shown on
    the athlete page. Rows for people not on a roster stay only in the file.
17. **No scores, tiers or labels on athletes** (decided 7 October 2026). There
    is not nearly enough data to score anyone 0–10 against a norm or call them
    elite — no published norms fit this equipment, and one club's squads would
    take years to build their own. Results are kept and shown as measured, with
    the change since the athlete's previous test and their place in the squad.
    No 100-point total, no tier names, no leaderboard points. The radar spans
    each test's squad range (weakest → best), labelled as a picture of the squad.
18. **Test batteries are a team setting** (decided 8 October 2026). Built-ins
    live in code — **Spenst 7** is the default (5 m sprint with a 1 m run-in,
    CMJ, trap bar jump, split squat jump, standing broad jump, push press,
    bench press for speed), with Senior 10 and Youth 8 kept as presets. Any
    coach can make the team's own (`test_batteries`); a team admin picks the
    one in use (`teams.battery_key`). The battery sets a test day's tests, the
    radar order, the leaderboard lists and the squad bests; results are kept
    whichever is in use. Batteries no longer follow the athlete's age.

## Open questions

- [ ] **OVR export.** Does OVR Connect export CSV, or offer an API? What are
      the columns? Can body mass be entered per exercise? (This decides whether
      `correctJumpPower` is needed at all.) Check in the app or with support
      before building an importer.
- [ ] **Athlete–team model.** Confirm decision 1 against how the club actually works.
- [ ] **Ranking groups.** Ballou ranks within skill / mid-skill / power groups.
      For handball: by position, or not at all for youth?
- [ ] **20 m sprint** (with 5 and 10 m splits) and **RSI from drop jumps** —
      both in the original battery discussion, neither in the catalogue yet.
- [ ] **The name.** "Spenst" is Norwegian; the app is now English.
- [ ] **Pro agility (5-10-5) or 505?** The sample export ran pro agility; the
      battery has the 505. They are different tests.
- [ ] **Peak or average power** for the power profile: Peak Power is used, as
      Ballou ranks on it; check against real exports.
- [ ] **OVR multi-split sprints and jumps:** the importer assumes Distance is
      per split and Total Time is cumulative (true for the single-split
      sample); confirm with a 0–5–10 m export and a Jump sheet with data.

## Checklist

### Done in the template

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

### Next

- [ ] Apply the four migrations (0001, 0002, 0004, 0005), in order, to a new Supabase project (by hand) and smoke-test with a real login.
- [ ] pgTAP RLS suite (`supabase/tests/rls.test.sql`), Grep-style.
- [ ] Athlete management: add via `add_athlete`, add an existing athlete to a second team, consent toggle, measurements form.
- [ ] Onboarding from `/admin` (port Grep's `auth-link` route) and password reset.
- [ ] OVR importer, once the export format is known.
- [ ] Profile history: a test's trend across test days, and Ballou's "two categories" ceiling as context.

- [ ] Faster planning: duplicate a session, copy a week or block (also between teams), progressions.

### Later

- [ ] The athlete's phone and coach tools — see the build order in
      `docs/athletes-and-programming.md`.
- [ ] Graphs and diagrams — see `docs/visualization-ideas.md`, starting with
      the profile emblem.
- [ ] Sprint force–velocity profile (Samozino) when more gates or video splits are available.
