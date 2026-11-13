---
id: 0003
title: A first Supabase project, and a real login
status: ready
created: 2026-10-31
depends-on: []
decisions: [10]
migrations: [202610070001_initial.sql, 202610070002_programming.sql, 202610070004_ovr_imports.sql, 202610070005_test_batteries.sql]
---

## Why

Spenst has only ever run in demo mode. Everything with real users — athlete
accounts, the OVR import's storage, the Claude connector (0001) — needs a
Supabase project of its own (decision 10: never Grep's).

## Scope

In: a development project, the four migrations, `site/.env.local`, a smoke
test with a real login, the ledger in `DEPLOYMENT.md`.

Out: production and hosting (a later item), onboarding and password reset
(backlog).

## Done when

- [ ] `npm run dev` with `site/.env.local` signs in a real user and shows no
      demo label.
- [ ] Creating a team, adding an athlete and importing an OVR export work
      against the database, and survive a reload.
- [ ] The ledger in `DEPLOYMENT.md` shows all four migrations `applied` on dev.

## Manual steps

- [ ] Create the Supabase project (dev).
- [ ] Paste `site/supabase/bootstrap.sql` into the SQL editor and run it
      (all four migrations, in order; see “A new project in one paste” in
      `DEPLOYMENT.md`).
- [ ] Create your user (Authentication → Users → Add user, auto-confirm),
      make it global admin and give it a first team (there is no
      create-team screen yet).
- [ ] Copy `site/.env.example` to `site/.env.local` and fill in the project's
      URL and publishable key.
- [ ] Update the ledger in `DEPLOYMENT.md`.

## Notes and open questions

- Grep keeps a dev and a production project; Spenst will want the same once
  it is deployed.
- The dev server is on `http://localhost:3001` (decision 19). Sign-in is by
  password, so no redirect URL is needed now; if an email flow is turned on
  later (password reset is in the backlog), set the project's Site URL to
  that address.

## Log

- 2026-10-31 from the plan's first “Next” item.
