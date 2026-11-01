---
paths:
  - "site/lib/season.{ts,test.ts}"
  - "site/components/season-{plan,timeline}.tsx"
  - "site/app/plan/page.tsx"
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
