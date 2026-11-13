---
id: 0004
title: Match days in the team calendar, with MD labels and congested weeks
status: spec
created: 2026-11-13
depends-on: []
decisions: [20]
migrations: [new: <next after the latest in site/supabase/migrations>_matches.sql]
---

## Why

Team-sport S&C plans the week around the match. The S&C Learning Path (see
`docs/learning-path.md`) asks for this directly:

- **Step 26:** build Case H's normal match week, MD+1 to MD, with a reason
  for each day.
- **Step 31:** plan the congested week, Saturday → Wednesday → Saturday.
- **Steps 30–33:** make the annual plan, with the busy periods visible.

Spenst cannot do this today. Sessions sit on dates, but the calendar has no
concept of a match. The coach has to work out MD-3 in their head and fake
congested weeks with week labels. `docs/athletes-and-programming.md` already
lists “match days in the season plan” under coach tools.

## Scope

**In:**

- **A `matches` table**, one row per match:
  - team, date, optional kick-off time, opponent (free text),
  - home or away,
  - kind: league, cup, friendly or play-off,
  - a `priority` flag for decisive matches (a taper target),
  - a short note.
- **RLS:**
  - Team coaches read and write (`is_team_member`).
  - Rostered athletes only read (`can_see_team`).
  - Inserts check `created_by = auth.uid()`.
  - Use the same grant pattern as `sessions`.
- **A pure function in `lib/season.ts`** (or a new `lib/match-days.ts`), with
  tests:
  - `matchDayLabel(date, matches)` returns the label for a date, such as
    `MD`, `MD-3`, `MD+1`, or `null` far from any match.
  - `matchesInWeek(weekStart, matches)` lists the matches in a week.
  - `isCongestedWeek(weekStart, matches)` is true when there are two or more
    matches in seven days, or fewer than 72 hours between two matches.
  - Make the 72-hour limit a named constant.
- **Season plan (`/plan`):**
  - Matches show on the timeline's week columns. Mark priority matches.
  - Mark congested weeks so a coach sees them across the year.
  - Add a match from the week panel, and edit or delete it there.
- **Week view in the week panel:**
  - Seven day columns, Monday to Sunday.
  - Matches and sessions on their days, with each day's MD label.
  - This is where the Step 26 and Step 31 work happens.
- **Session builder:** the session's MD label shows beside its date.
- **Demo data:** matches for the demo senior team, including one two-match
  week.

**Out:**

- Results, scores and match statistics.
- Match minutes or GPS. Match load belongs in 0006/0007.
- Importing fixtures from a federation or league API.
- Moving sessions automatically when a match moves.
- Copying a week aligned to MD labels. That is a possible follow-up to 0005.

## Done when

- [ ] `npx vitest run` covers `matchDayLabel`, `matchesInWeek` and
      `isCongestedWeek`. The tests include a Saturday-only week, a
      Wednesday + Saturday week, a Sunday match followed by a Wednesday
      match, and a date with no match within 7 days.
- [ ] In demo mode, `/plan` shows the demo team's matches on the timeline.
      The two-match week is marked as congested (screenshot).
- [ ] In the week panel of a match week, the seven days show the right MD
      label on each day, with the sessions and the match on their days
      (screenshot).
- [ ] A coach can add, edit and delete a match. In demo mode nothing is
      saved, and the UI still updates optimistically.
- [ ] The session builder shows the MD label next to the date.
- [ ] `npm run lint`, `npm test` and `npm run build` pass.
- [ ] The migration follows `.claude/rules/supabase.md`: RLS on,
      revoke/grant, helper-based policies, a pending row in `DEPLOYMENT.md`.

## Manual steps

- [ ] Apply the new migration to the dev project in the Supabase SQL editor.
      Update the ledger.

## Notes and open questions

- **Label rule in a two-match week.** A date can be both MD+1 after one match
  and MD-3 before the next. Proposal: label each date by the **nearer**
  match, and show the other one in the tooltip (“MD+1 · MD-3”).
  - If the distances are equal, prefer the next match (MD-n). The
    preparation for the next match decides the session.
  - This is the convention in the match-day microcycle literature. Confirm
    it with the maintainer before building.
- **Matches are calendar items, not periods.** They sit on dates, like
  sessions, so moving a block never orphans one (the same rule as in
  `.claude/rules/season.md`).
- **Case H for a manual check.** League matches on Saturdays, September–April.
  Wednesday + Saturday weeks in one October week and one February week
  (`docs/learning-path.md`).

## Log

- 2026-11-13 spec written, from the Learning Path review.
