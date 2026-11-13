# Spenst and the S&C Learning Path

*Design, 13 November 2026. Why Spenst grows the features in issues
#5–#9, and the context a builder needs. Read this before building any of
them.*

## What the Learning Path is

The maintainer is working through a self-study curriculum in S&C: the
**S&C Learning Path**, a claude.ai artifact
(<https://claude.ai/artifact/KnW3CgkTZrKaopVDAL6yTV>). Its source lives in the
S&C vault at `tools/learning-path-source/`. The adult case data is in
`cases.py`, and the step text is in `adult_src.py`, `youth_a.py` and
`youth_b.py`.

It has two tracks:

- **Youth** (Steps 0–56): coaching young athletes.
- **Adult team-sport** (Steps 0–36): periodisation, programme design and
  session design.

Each step ends with an **Apply** task that produces something concrete, and a
**pass checklist** that another person marks.

**Decision 20:** the maintainer builds the practical products in Spenst, not
on paper. That covers sessions, weeks, blocks, season plans and monitoring
rules. Spenst must make every adult build task possible.

**Athletes under 14 stay out of Spenst.** The youth cases under 14 (Athletes A
and B, Teams T10 and T6) remain paper tasks. The minimum-age rule
(`enforce_minimum_age`) does not change.

## The cases the maintainer will enter

These people do not exist. The numbers are realistic examples, not norms. The
maintainer enters each case as a **test team with one athlete**, so each case
gets its own season plan.

### Case H: handball back, male, 24 years (the central case)

| Item | Value |
|---|---|
| Athlete | 92 kg, 4 years of gym training |
| Back squat 1RM | 140 kg |
| Countermovement jump | 42 cm |
| 10 m sprint | 1.78 s |
| Flying 20 m | 2.10 s |
| Yo-Yo IR1 | 1,600 m |
| History | Left hamstring strain 8 months ago |

**Calendar:**
- Off-season May–July, preseason August.
- League September–April, with a 2-week break at Christmas.
- Two weeks with two matches (Wednesday and Saturday): one in October, one in February.

**Normal in-season week:** team practice Monday, Tuesday and Thursday (90 min each, planned by the head coach), and a match on Saturday. Two S&C slots of 60 min, on days the S&C coach picks.

**Current programme:**
- Day 1: back squat 4×6, bench 4×6, Bulgarian split squat 3×10, Nordic 2×5.
- Day 2: power clean 5×3, RDL 3×8, pull-up 3×max, med-ball chest throw 3×5, bike 10×30 s.

### The other cases

- **Case S:** football central midfielder, female, 27 years, 60 kg. Back squat 1RM 85 kg, 10 m 1.95 s, Yo-Yo IR1 1,800 m. Match on Sunday; practice Tuesday, Wednesday and Friday. She is the contrast case.
- **Athlete C:** youth handball wing, female, 17 years, 62 kg.
  - Tests: back squat 1RM 75 kg, CMJ 32 cm, RSI 1.3, 10 m 2.00 s, flying 20 m 2.45 s.
  - Plays 4 practices and a Saturday match each week.
  - Two right ankle sprains.
  - Exams in May and December.
- **Case Y:** the maintainer's own training.

## Adult steps and what each needs from Spenst

| Steps | Task | Spenst today | Gap |
|---|---|---|---|
| 0, 36 | Six tasks for Case H: needs analysis, season outline, 6-week block, a normal week and a two-match week, two sessions, three monitoring rules | Season plan, blocks, sessions | Match days (#5), monitoring rules (#8), the needs analysis (#9) |
| 12–24 | One session for each physical quality, built with the **nine questions** of Step 23 | Session builder | Session reasoning: the nine questions (#9) |
| 25 | Concurrent training: mark where two qualities compete for recovery in one week | Sessions on dates | Week view by match day (#5), reasoning (#9) |
| 26 | A normal match week from MD+1 to MD, with a reason for each day | Sessions on dates, week labels | **Match days and MD labels (#5)** |
| 27 | The Step 26 week again in two versions (high/low, microdosed) | None | **Copy a week (#6)** |
| 28–29 | A periodisation model and a 6-week in-season block: what develops, what is kept, the deload, and what in week 3 will change the plan | Blocks with focus, notes and emphasis | Block reasoning and a review signal (#9) |
| 30–33 | Off-season and preseason, a congested week (Saturday → Wednesday → Saturday), deload/taper/detraining, the annual plan | Phases, blocks, week labels | Match days and congestion (#5), copying blocks (#6) |
| 34 | The smallest monitoring system: what to measure, how often, and the number that changes the plan | Nothing in the app; `workouts.readiness` and `session_rpe` exist, unused | **Logging (#7) and monitoring rules (#8)** |
| 35 | Compare sessions, a week and a block with Boyle, DeFranco and Ballou | None | A “Compared with” note (#9) |

**Another person must check every pass criterion.** The planned Claude
connector (#2) lets Claude do this check. It reads the plan, the sessions
and the reasoning in Spenst, and marks them against the checklist. Items
#5–#9 store their data in a form #2 can read and render as text.

## S&C grounding for the builder

Check claims against the vault wiki first (`wiki/index.md`). The
`sc-researcher` agent reads it. These pages are the most relevant:

| Topic | Wiki pages |
|---|---|
| Match-day weeks | [[High-Low Training Model]], [[Summated Microcycles]], [[Team-Sport Annual Plan]] |
| Monitoring | [[Athlete Monitoring]], [[Recovery and Performance in Sport - Consensus Statement (Kellmann 2018)]], [[The Training-Injury Prevention Paradox (Gabbett 2016)]] |

Two points from the curriculum's monitoring material:

- **No acute:chronic workload ratio.** Impellizzeri et al. (2020) set out its conceptual and statistical problems, so the curriculum teaches it critically and Spenst must not compute it.
- **Action thresholds must be larger than the test's typical error** (Hopkins 2000). Otherwise a rule fires on noise.
