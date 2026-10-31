<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Spenst project guidance

## Scope and architecture

- This directory contains the full application: a Next.js 16 App Router frontend backed by Supabase. It is a separate product from Grep (`~/code/plannr/site`) with its own database and accounts; it shares only Grep's stack, design tokens, shell and code patterns.
- Use `npm` and run project commands from this directory.
- Supabase is the production source of truth. The in-memory demo data is only a fallback when the public Supabase environment variables are absent.
- Preserve privacy minimization for athlete data: “Firstname L.”, birth month only, and body measurements only with consent, unless the user explicitly changes that requirement.

## Supabase migrations

- The user applies database migrations manually in the Supabase dashboard. Never run commands that apply, push, reset, or otherwise mutate a local or remote Supabase database.
- Make database changes only by creating or editing SQL files in `supabase/migrations/`. Do not claim that a migration has been applied.
- Keep migrations ordered by their timestamped filename and safe to execute through the Supabase SQL editor.
- Treat migrations that may already have been applied as immutable. If their application status is unclear, ask before editing them or add a new forward migration.
- After changing database SQL, identify the exact migration file the user must apply manually and mention any required ordering.

## Implementation conventions

- Keep browser Supabase access in `lib/supabase/client.ts` and server access in `lib/supabase/server.ts`; do not expose secrets through `NEXT_PUBLIC_*` variables.
- Preserve row-level security and least-privilege grants for all database changes.
- Never write a colour in a component; use a token from `app/globals.css`.
- Add or update focused Vitest coverage for changed behavior. Tests live beside the corresponding modules using `*.test.ts` or `*.test.tsx`.

## Verification

```bash
npm run lint
npm test
npm run build
```

Report any checks that were not run or could not complete.
