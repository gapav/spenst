# Work

One file per change: `NNNN-short-name.md`, numbered in order and never
renumbered. Ideas that nobody has specced yet are one line each in
`backlog.md`; `/spec` turns one into a file. `/ship` finishes one.

## Status

| Status | Means |
|---|---|
| `spec` | Written down, not yet agreed |
| `ready` | Agreed; can be built |
| `doing` | Being built |
| `review` | Built and checked; waiting on manual steps or the maintainer's look |
| `done` | Every “Done when” line and manual step is ticked |
| `dropped` | Not doing it — the log says why |

## Rules

- **“Done when” lines are checkable**: a test, a command, a screenshot, a page
  to open. `/ship` ticks them with the evidence.
- **Manual steps** hold everything only the maintainer can do: apply a
  migration, change a Supabase or hosting setting, create an account. An item
  stays in `review` until they are ticked.
- **Decisions** made along the way go to `docs/decisions.md` with the next
  number, and the item cites them by number.
- **Commits start with the id**: `0012: add the MCP route`.
- **A done item is closed.** Follow-ups are new items, not edits to old ones.

## Template

```markdown
---
id: NNNN
title: Short title
status: spec
created: YYYY-MM-DD
depends-on: []
decisions: []
migrations: []
---

## Why

What problem this solves, for whom.

## Scope

In: …

Out: …

## Done when

- [ ] …

## Manual steps

- [ ] …

## Notes and open questions

## Log

- YYYY-MM-DD spec written
```
