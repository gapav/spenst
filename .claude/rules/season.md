---
paths:
  - "site/lib/{season,planning,match-days}.{ts,test.ts}"
  - "site/components/season-{plan,timeline}.tsx"
  - "site/components/{week-planner,session-drawer}.tsx"
  - "site/app/plan/**"
---

# The year plan (`lib/season.ts`, `/plan`)

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
- **Planning is day by day (decision 24).** `components/week-planner.tsx`:
  every week is a Monday–Sunday strip with “+” per day (session, copy of…,
  paste, match); block views *Weeks / Calendar / Progression*. The pure parts
  are in `lib/planning.ts` (copying, paste offsets, week summaries, the
  exercise × week matrix) and `lib/match-days.ts` (MD labels: the nearer
  match wins, a tie goes to MD-n; congestion at ≤ 72 h).
- **Copies are independent.** `copySessions` clones content with new ids
  (`cloneContent`); nothing links a copy to its source. Every planner action
  offers an undo; multi-moves go through the `move_sessions` RPC so they are
  atomic.
- **Matches are calendar items** (`matches`, like sessions: on dates, owned
  by no period). Athletes may read them; there is no athlete screen yet.
- **The builder opens in a drawer** from `/plan`: `app/plan/@drawer/(.)sessions/[sessionId]`
  intercepts the soft navigation; a reload gets the full page. Escape is
  layered — a modal or menu marks it handled (`preventDefault`), the planner
  clears its selection in the capture phase, and only then does the plan
  close its panel.
