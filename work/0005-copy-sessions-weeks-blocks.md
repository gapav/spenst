---
id: 0005
title: Copy a session, a week or a block — within a team and between teams
status: spec
created: 2026-11-13
depends-on: []
decisions: [20]
migrations: [new: <next after the latest in site/supabase/migrations>_copy_sessions.sql]
---

## Why

Planning is mostly variation on what already exists. The backlog lists
“Faster planning: duplicate a session, copy a week or block (also between
teams)”. The S&C Learning Path (`docs/learning-path.md`) needs it now:

- **Step 27:** rebuild the Step 26 week in two versions (high/low with
  consolidated high days, and microdosed). Today that means building every
  session three times by hand.
- **Steps 29 and 33:** put a 6-week block into the annual plan, and repeat
  similar blocks across the year.
- **Case S compared with Case H:** the maintainer uses one test team for each
  case. Copying a week between teams is how the two athletes are compared on
  the same structure.

## Scope

**In:**

- **Duplicate a session.** Copy it to a date in the same team. The copy is
  always a `draft`, its title gets “ (copy)”, and every id inside
  `content` (sections, slots, set groups) is new.
- **Copy a week.** Copy all sessions of a week to another week, in the same
  team or in another team the coach is on. Each session keeps its weekday.
  The week label (`week_notes`) can go too.
- **Copy a block.** Copy a period, with its sessions and week labels, to a
  target Monday in a season of the same team or another team.
  - Run the usual overlap check (`overlapsOnLevel` and the exclusion
    constraint).
  - A blocked copy explains why and changes nothing.
- **Between teams:**
  - Team-made exercises (uuid ids in `content`) do not exist in the target
    team.
  - Copy each missing team exercise into the target team once, and rewrite
    its id in the copied content.
  - Built-in exercises (`builtin:<key>`) copy as they are.
- **One RPC for each copy kind, or one RPC with a mode.**
  - Make it `security invoker`, so RLS decides. The coach must be a member
    of both teams.
  - It is atomic: everything is copied or nothing is
    (`.claude/rules/supabase.md`).
  - Id regeneration in the content can happen in a pure `lib/` function
    before the call, with tests. The builder decides.
- **Entry points:**
  - “Duplicate” in the session builder.
  - “Copy week to…” in the week panel.
  - “Copy block to…” in the period panel.
  - Each opens a small dialog that asks for the target team, season and date.
- **Demo mode:** the copy shows in the UI and is not saved, as in every
  mutation.

**Out:**

- Progressions across weeks (for example, “+2.5 kg each week”). That is a
  follow-up.
- A copy that keeps MD labels when the target week has its matches on other
  days. That follow-up depends on 0004.
- Copying test days, results or logs. Only plans copy.
- Templates or a shared library between coaches who are not on the same
  team.

## Done when

- [ ] Tests for the pure part, under `npx vitest run`:
  - every content id is new,
  - team exercise ids are rewritten through a mapping,
  - built-in keys are unchanged,
  - `parseSessionContent` round-trips the copy.
- [ ] In demo mode, duplicating a session gives a draft on the chosen date
      with “(copy)” in the title (screenshot).
- [ ] Copying a week to an empty week puts every session on the same
      weekday, as a draft (screenshot of the week panel).
- [ ] Copying a block onto an overlapping block is refused with a message,
      and nothing changes.
- [ ] Copying a week to another team copies a team-made exercise once, and
      the copied sessions open in the builder with that exercise resolved.
- [ ] `npm run lint`, `npm test` and `npm run build` pass. The RPC follows
      `.claude/rules/supabase.md`, with a pending ledger row.

## Manual steps

- [ ] Apply the migration with the RPC(s) to the dev project. Update the
      ledger.

## Notes and open questions

- **A target week that already has sessions.** Add the copies beside them
  (proposed), or ask to replace? Replacing deletes sessions, which can have
  logs (`workouts.session_id` is `on delete set null`). Propose “add beside”
  only, with no replace in this item.
- **Step 27's two versions.** The maintainer can copy the week into a second
  season of the same team (a sandbox season) or into empty weeks. Check that
  a team can have more than one season. If not, raise it before building.
- Remove the “Faster planning” line from `work/backlog.md` when this item
  is agreed. Progressions stay as a backlog line.

## Log

- 2026-11-13 spec written, from the Learning Path review.
