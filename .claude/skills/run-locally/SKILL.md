---
name: run-locally
description: Run Spenst on this machine — start and stop the dev server on port 3001, tell demo mode from a real Supabase project, sign in, open it on a phone, and fix the usual failures. Use when asked to run, start, open or screenshot Spenst locally, or to check a change in the running app.
---

# Run Spenst locally

## Start and stop

- From `site/`: `npm run dev`, as a background command so the session stays
  free. It serves `http://localhost:3001`; Grep keeps 3000 (decision 19).
- The port is pinned, so when 3001 is taken Next stops with `EADDRINUSE`
  instead of moving to another one. `lsof -nP -iTCP:3001 -sTCP:LISTEN` finds
  the other server — usually an earlier Spenst one. Stop that rather than
  change the port.
- Stop the server by stopping the background command.
- After pulling, a missing module means `npm install` first.

## Which data you are on

- **No `site/.env.local`: demo mode.** The sidebar says “Demo mode · nothing
  is saved”, the provider seeds generated squads from `lib/demo-data.ts`, and
  a reload starts over.
- **`site/.env.local` with the Supabase pair:** the development project.
  It exists since 13 November 2026 (#4); with `.env.local` in
  place, Next prints `Environments: .env.local` on start and the demo label
  is gone. It must never point at a production project.

## Signing in

- **Demo mode:** any email and any password (“Demo mode — any password opens
  the demo.”).
- **A real project:** email and password (`signInWithPassword`) for a user
  created in the Supabase dashboard. No redirect is involved, so the port
  doesn't matter to sign-in.

## On a phone

`next.config.ts` lets a device on the same network load the dev server. On
the same Wi-Fi, open the `Network:` address Next prints when it starts
(`http://192.168.…:3001`).

## Checking a change

- Open the page the change touches. Demo mode is fine for screens, but it
  saves nothing, so a bug in saving only shows against a real project.
- The dev server doesn't lint and doesn't fail on type errors, so
  `npm run lint` and `npm run build` still apply.

## Never

`supabase start` or raw `supabase db …` / `psql` — the settings deny them. The
database changes only through `npm run db:*` (decision 21; `DEPLOYMENT.md`).
