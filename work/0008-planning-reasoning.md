---
id: 0008
title: The reasoning behind the plan — needs analysis, block review signal, the nine session questions, “why” per exercise, and a Markdown export
status: spec
created: 2026-11-13
depends-on: []
decisions: [20]
migrations: [new: <next after the latest in site/supabase/migrations>_plan_reasoning.sql]
---

## Why

A plan without its reasons cannot be checked. Every build task in the S&C
Learning Path (`docs/learning-path.md`) asks for the reason as well as the
plan, and its pass checklists mark the reason:

| Steps | Reasoning asked for |
|---|---|
| 0, 4, 36 | The needs analysis: each quality in **develop**, **maintain**, **not important now** or **limited by**, with one line of evidence or a stated assumption |
| 23–24 | Each session answers the **nine questions** |
| 29 | Each block states what it develops, what it maintains, where the deload goes, and **what in week three will make you change it** |
| 7 and all session steps | Each exercise has a reason: the adaptation, the transfer, the fatigue cost and the competency |
| 35 | Each product has a **“Compared with”** note: where Boyle, DeFranco or Ballou would do it differently, and why |

The nine questions of Step 23:
1. What is the primary adaptation?
2. What is the highest-priority exercise or method?
3. What supports it?
4. What is the correct dose?
5. What is the expected fatigue cost?
6. What is the correct order?
7. How much rest is needed?
8. How does it progress?
9. When is the quality low enough to stop or change the session?

Today the plan sits in Spenst, and the reasons sit in the maintainer's
Obsidian vault (`coach/`). That split makes the reasons hard to keep in step
with the plan. It also stops the Claude connector (0001) from marking a plan
against its reasons.

## Scope

**In:**

- **Season: the needs analysis.**
  - A structured list. Each row has a quality, a group (develop, maintain,
    not now or limited by) and a reason.
  - The quality list is free text with suggestions from the curriculum's
    library: maximal strength, speed-strength, acceleration, maximum
    velocity, change of direction, aerobic fitness, and so on.
- **Period (phase or block):**
  - A `rationale` text.
  - A `review_signal` text: “What I expect to see by week N, and what will
    make me change this.”
  - `focus` and `notes` stay as they are.
- **Session: the nine questions.**
  - Stored in the session's content JSON, for example
    `content.reasoning.{adaptation, priority, support, dose, fatigue, order,
    rest, progression, stopRule}`. That way no migration is needed for
    sessions.
  - `parseSessionContent` must keep this part, and drop it safely when it is
    malformed, with tests.
  - Each session also gets a free-text **“Compared with”** note.
  - The builder shows the questions in a collapsible panel. They are
    optional, but unanswered questions show as a count (“6 of 9 answered”).
- **Slot: a one-line “why”**, in the slot JSON, shown under the exercise in
  the builder.
- **A vault link:** an optional Obsidian link on a season and on a session.
  It opens the coach's note (the `obsidian://` URI). Store it as plain text.
  Do not read or check the vault.
- **Markdown export:**
  - “Copy as Markdown” on a season, a block, a week and a session.
  - It gives a clean text: the plan with its reasoning, sets and reps in the
    vocabulary's units, and MD labels when 0004 exists.
  - The maintainer pastes it into `coach/` in the vault.
  - The renderer is a pure `lib/` function. The Claude connector (0001) will
    reuse it to render tool output as text.

**Out:**

- Reading or writing the Obsidian vault from Spenst. The link and the export
  are one-way.
- AI-generated reasoning. Claude reviews through 0001; Spenst does not
  generate text.
- Required fields. Nothing blocks saving or publishing.

## Done when

- [ ] Tests for:
  - the content parser with `reasoning` and slot `why` (kept when valid,
    dropped when malformed),
  - the needs-analysis validation,
  - the Markdown renderer for a session, a week and a block (snapshot-style
    tests with a fixed demo session).
- [ ] In demo mode, a session shows the nine-question panel with an answer
      count, and a slot shows its “why” (screenshot).
- [ ] The season panel holds a needs analysis in four groups (screenshot).
- [ ] A block shows its rationale and its review signal in the period panel.
- [ ] “Copy as Markdown” on a week gives text that pastes into Obsidian as
      clean Markdown: headings, a table of sessions, and the reasoning
      (paste check).
- [ ] `npm run lint`, `npm test` and `npm run build` pass. The migration
      (season needs analysis, period `rationale` and `review_signal`, the
      link fields) follows `.claude/rules/supabase.md`.

## Manual steps

- [ ] Apply the migration and update the ledger.

## Notes and open questions

- **Athletes see published sessions.** Proposal: athletes see a session's
  purpose (question 1) and the slot cues. The nine questions, the
  “Compared with” note and the needs analysis stay coach-only.
- **Needs analysis at team or athlete level.** Spenst has one plan per team.
  For the Learning Path, each case is a one-athlete team, so the team level
  fits. Keep it on the season (the team level). An athlete-level version
  needs its own item, and it touches the privacy rules.
- The Markdown export must not include athlete names or measurements, only
  the plan. That keeps the vault free of athlete data from Spenst.

## Log

- 2026-11-13 spec written, from the Learning Path review.
