# Decisions

Numbered and append-only. Code, docs and work items cite them by number
(“decision 17”), so a number is never reused or renumbered. To change one, add
a new decision and strike the old one through with a pointer to it. Record
only what the maintainer decided; a proposal waits under open questions or in
a work item. The next number is **21**.

Each of the first eighteen is easy to reverse. They are listed so the
reasoning is not lost.

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
19. **Spenst's dev server runs on port 3001** (decided 1 November 2026), so
    Grep keeps 3000, where its dev project's sign-in redirects point. The
    port is pinned in `site/package.json`, so a taken port fails instead of
    moving.
20. **Spenst is the workspace for the S&C Learning Path's build tasks**
    (decided 13 November 2026). The maintainer builds the sessions, weeks,
    blocks, season plans and monitoring rules of the curriculum's adult track
    in Spenst, one test team per case. Spenst grows what those tasks need
    (work items 0004–0008); `docs/learning-path.md` has the context. No
    programming for athletes under 14: the minimum-age rule stays as it is.
21. **The agent applies migrations** (decided 13 November 2026), replacing
    “the maintainer pastes SQL in the dashboard”, which was too much
    friction. Every database change goes through `site/scripts/db.sh`
    (`npm run db:*`, adapted from Grep's `scripts/migrate.sh`): it backs up
    first, dry-runs, pushes with the Supabase CLI and keeps the project's
    own migration history; the connection is in the gitignored
    `site/.env.db`, which agents never read. Raw `supabase db …`, `psql` and
    `supabase start` stay denied. Shipped migrations stay immutable.
22. **Work lives on the GitHub board, not in `work/`** (decided 13 November
    2026), as in Grep (its decision 1). Each change is an issue on the
    project “Spenst” (Backlog → Ready → In progress → In review → Done),
    specced in the shape of `.github/ISSUE_TEMPLATE/work.yml`. An issue
    labelled `agent` is built by Claude in Actions
    (`.github/workflows/claude.yml`) and comes back as a pull request; a
    change built locally goes through `/ship` to a pull request too. The PR
    carries what a work file used to: the ticked “Done when” lines, the
    checks and the steps before merging. `work/` is retired: work items
    0001–0008 became issues #2–#9 (item N is issue N + 1) and the backlog
    became #10–#17; references to an item number before this decision mean
    that issue.

## Open questions

Waiting on an answer from the club, OVR or real data. An answer becomes a
numbered decision above.

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
