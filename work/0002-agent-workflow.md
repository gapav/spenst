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
the `spec`, `ship` and `sync-from-grep` skills; the `spec-reviewer`,
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
- [ ] In a new session, `/spec`, `/ship` and `/sync-from-grep` are listed, and
      `/agents` shows the three agents.

## Manual steps

- [ ] Create a private GitHub repository (`gapav/spenst`), then add the
      remote and push: `git remote add origin git@github.com:gapav/spenst.git`
      and `git push -u origin main`.
- [ ] Optionally add `.claude/settings.local.json` (not committed) so agents
      can read the wiki and Grep without asking:
      `{"permissions": {"additionalDirectories": ["~/Library/Mobile Documents/iCloud~md~obsidian/Documents/S&C/wiki", "~/code/plannr/site"]}}`
- [ ] Confirm the ledger in `DEPLOYMENT.md` (all four `unknown` until then).

## Log

- 2026-10-31 built. Auto mode refused to let the agent write
  `.claude/settings.local.json` (it widens the agent's own access), so that
  is a manual step.
