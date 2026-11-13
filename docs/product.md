# Spenst — product brief

Spenst is a separate app from Grep, in the same design family: physical
testing, a power profile, and a season plan of shared team sessions with
individual variants and kilos, for youth and adult team-sport squads. Built for
Norwegian handball clubs and the gear they can actually afford: OVR Sprint
gates and a single OVR Velocity bar sensor. The name is the Norwegian word for explosiveness, the
quality the profile measures.

This file records the product thinking behind the template. The decisions it
encodes are numbered in `docs/decisions.md`, the work in GitHub issues, and
`CLAUDE.md` describes the code.

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
