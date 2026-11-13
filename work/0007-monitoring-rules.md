---
id: 0007
title: Monitoring rules — “if X, then I change Y”, with flags the coach sees
status: spec
created: 2026-11-13
depends-on: [0006]
decisions: [20]
migrations: [new: <next after the latest in site/supabase/migrations>_monitoring_rules.sql]
---

## Why

The S&C Learning Path (`docs/learning-path.md`) asks for these rules in the
central case:

- **Task 6:** “Three monitoring rules in the form: if X, then I change Y”.
- **Step 34:** “The smallest monitoring system that you will continue to
  use … the number or trend that changes the plan”.

Its pass checklists add two conditions:

- each measure must change a decision,
- each action limit must be larger than the typical error of the measure.

Today these rules can live only as text in the vault. In Spenst they can be
checked against real data, and they become flags that the coach sees on the
overview and the athlete page.

## Scope

**In:**

- **A rule, owned by a team:**
  - a **measure**,
  - a **comparison**,
  - a **threshold**,
  - a **window**,
  - an **action** (free text, for example “Remove the plyometrics today”),
  - an on/off switch.
- **Measures, from data Spenst has or 0006 adds:**
  - readiness 1–5 (latest),
  - session RPE,
  - session load (RPE × minutes) for a week,
  - the change in weekly load from the previous week,
  - a test result from a test day (for example, CMJ) against the athlete's
    baseline,
  - the best velocity on a fixed warm-up load from OVR rows, against the
    athlete's baseline,
  - pain reported in a log.
- **Comparisons:**
  - below or above an absolute value,
  - a percentage change from the baseline,
  - a change from the baseline in units of the **typical error** of the
    measure.
  - The baseline is the athlete's own mean over a window that the coach sets,
    for example the last 4 test days.
- **Typical error:**
  - The coach enters the typical error of each measure for the team.
  - Spenst also offers a computed value from repeated test days, when it has
    enough data.
  - Show the default value with its source, and do not invent one.
- **Guard:** an absolute or percentage threshold that is smaller than the
  typical error shows a warning while the coach edits the rule: “This rule
  will fire on noise.” This is the pass criterion of Step 34.
- **Evaluation:**
  - A pure function `evaluateRules(rules, athleteData, asOf)` in `lib/`
    returns the rules that fire, with the numbers.
  - Show them as flags on the overview and the athlete page, beside the
    existing asymmetry flags.
- **A rule template list from the curriculum, each fully editable:**
  - “CMJ below the baseline by more than 1 × typical error → reduce jump
    volume today”,
  - “Readiness 1–2 → change the session”,
  - “Pain reported → coach contact before the next session”.

**Out:**

- **The acute:chronic workload ratio.** Do not compute it, and do not offer
  it as a measure. The curriculum teaches it critically: Impellizzeri et al.
  (2020) set out its conceptual and statistical problems, and the wiki
  [[Athlete Monitoring]] page covers the debate.
- Automatic changes to sessions. A flag tells the coach; the coach decides.
- Notifications by push or email.
- Hormone or blood markers. The curriculum's primer explains why they are
  poor daily markers.

## Done when

- [ ] `evaluateRules` has tests for:
  - each comparison type,
  - a baseline with too little data (no flag, and a reason),
  - a threshold smaller than the typical error (the warning),
  - pain.
- [ ] In demo mode, the demo athlete has data that fires one rule. The flag
      shows on the overview and the athlete page, with the numbers and the
      action text (screenshot).
- [ ] The rule editor shows the noise warning for a threshold below the
      typical error (screenshot).
- [ ] A rostered athlete can see their own flags, or cannot. Decide which
      before building, and test it.
- [ ] `npm run lint`, `npm test` and `npm run build` pass. The migration
      follows `.claude/rules/supabase.md`.

## Manual steps

- [ ] Apply the migration and update the ledger.

## Notes and open questions

- **Can athletes see their flags?** Proposal: no in this item. Flags are a
  coach tool, and an athlete aged 14–17 can read a flag as a judgement
  (decision 17 removed labels on athletes for this reason).
- **Where the typical error lives.** Proposal: a team setting for each test
  key and for the readiness and velocity measures.
- Read [[Athlete Monitoring]] and
  [[Recovery and Performance in Sport - Consensus Statement (Kellmann 2018)]]
  in the vault wiki through the `sc-researcher` agent before writing the
  template texts.

## Log

- 2026-11-13 spec written, from the Learning Path review.
