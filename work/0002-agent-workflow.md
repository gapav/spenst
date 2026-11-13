---
id: 0002
title: Agent workflow — git, deployment facts, rules, skills, reviewers
status: review
created: 2026-10-31
depends-on: []
decisions: []
migrations: []
---

## Why

Agents kept needing facts that were only in the maintainer's head (where
Spenst runs, which migrations are applied), the hard rules were prose only,
and there was no history to review a change against.

## Scope

In: an initial commit; `DEPLOYMENT.md` with the migration ledger;
`.claude/settings.json` (allow and deny rules, a hook); `.claude/rules/`;
the `spec`, `ship`, `sync-from-grep` and `run-locally` skills (the last
added 2026-11-01, with the dev server moved to port 3001, decision 19); the
`spec-reviewer`,
`db-reviewer` and `sc-researcher` agents; `IMPLEMENTATION_PLAN.md` split into
`docs/product.md`, `docs/decisions.md` and `work/`.

Out: Grep (the same setup there is a follow-up item in Grep's own repo); a
`release` skill (once Spenst is deployed); a Stop hook.

## Done when

- [x] `main` has an initial commit of the existing code — `46b3a55`.
- [x] The hook refuses an edit to an `applied` migration and asks for an
      `unknown` one — piped test inputs: applied → exit 2, pending and new →
      pass, unknown and missing → `ask`.
- [x] Reading `raw/` or `wiki/athlete/` in the vault is denied — the Read tool
      and `cat` were both blocked.
- [x] `CLAUDE.md` is under 200 lines — 199 → 146.
- [x] Lint clean, 232 tests and the build pass on the initial commit; tests
      pass after the change (no code changed).
- [x] In a new session the three agents and `/spec` are loaded — the
      2026-11-01 session listed `spec-reviewer`, `db-reviewer`,
      `sc-researcher` and the `spec` skill.
- [x] `npm run dev` serves `http://localhost:3001` in demo mode, and a second
      server on 3001 fails with `EADDRINUSE` instead of moving — HTTP 200
      with “Demo mode · nothing is saved”; the second `next dev --port 3001`
      exited 1 with `listen EADDRINUSE`.
- [ ] In a new session, `run-locally` is listed.

## Manual steps

- [x] Create a private GitHub repository (`gapav/spenst`), then add the
      remote and push — `main` tracks `origin/main` at `745466c`.
- [ ] Check `/ship` and `/sync-from-grep` are in the `/` menu. They are
      `disable-model-invocation`, so an agent never sees them listed.
- [ ] Optionally add `.claude/settings.local.json` (not committed) so agents
      can read the wiki and Grep without asking:
      `{"permissions": {"additionalDirectories": ["~/Library/Mobile Documents/iCloud~md~obsidian/Documents/S&C/wiki", "~/code/plannr/site"]}}`
- [x] Confirm the ledger in `DEPLOYMENT.md` — no Supabase project exists, so
      all four are `pending` (maintainer, 2026-11-01).

## Log

- 2026-10-31 built. Auto mode refused to let the agent write
  `.claude/settings.local.json` (it widens the agent's own access), so that
  is a manual step.
- 2026-11-01 the maintainer committed the setup as `745466c` and pushed it to
  `gapav/spenst`. Ledger confirmed: nothing applied.
- 2026-11-01 added the `run-locally` skill and pinned the dev server to port
  3001 (decision 19), so Grep can keep 3000. Next only falls back to another
  port when none was given (`allowRetry` in `next/dist/cli/next-dev.js`), so
  pinning makes a clash fail loudly.
