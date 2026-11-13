# Spenst

Physical testing, power profiles and individual programming for team-sport
squads. A separate app from [Grep](../plannr) — Grep plans team sessions,
Spenst tests and trains individual athletes — built on the same stack and
design system, so the two read as one family.

- **Season plan** — the team's year in phases and blocks, after Ballou's yearly overview, with the sessions placed in it.
- **Session builder** — one vocabulary for strength, power, plyos, sprints, VBT and conditioning; easier and harder variants per exercise.
- **Testing** — test days read from the OVR export, as interactive charts of every attempt.
- **Test batteries** — a team setting: Spenst 7 by default (seven tests after Ballou), or a team's own.
- **Power profile** — David Ballou's test battery on OVR gear, kept as measured:
  each athlete's latest values, the change since last time, their place in the
  squad, and a radar against the squad. No scores, tiers or labels.
- **Asymmetry** — split squat jump left/right, tagged from 3%, flagged from 10%.
- **Maturity** — maturity offset for youth athletes (Moore 2015), with consent.
- **Leaderboard** — each test in order, with the gap to first. No points.

## Run it

```bash
cd site
npm install
npm run dev     # http://localhost:3001 — demo mode with no .env.local
npm test
npm run lint
npm run build
```

With no Supabase variables the app runs in demo mode: two generated squads, any
email and password signs in, and nothing is saved. To use a real database,
copy `site/.env.example` to `site/.env.local`, create a Supabase project, and
apply the migrations in `site/supabase/migrations/` by hand in the SQL editor,
in order. `DEPLOYMENT.md` keeps the ledger of which are applied where.

`docs/product.md` holds the product brief, `docs/decisions.md` the decisions
and open questions, and `work/` the work, one file per change. `CLAUDE.md`
describes the code.
