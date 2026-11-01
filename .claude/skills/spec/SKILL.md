---
name: spec
description: Turn an idea into a work item — interview the maintainer until the change has a scope and checkable “Done when” lines, then write work/NNNN-short-name.md. Use when the user runs /spec, or asks to write up, spec or plan a feature or change before building it.
argument-hint: "[idea, or a line from work/backlog.md]"
---

# Write a work item

The conventions and template are in `work/README.md`; follow them exactly.

1. **Read before asking.** `work/README.md`, `work/backlog.md`, the items in
   `work/` that touch the same area, `docs/decisions.md`, the relevant design
   document in `docs/`, and enough of the code to know what exists. Don't ask
   what the code or docs already answer.
2. **Interview** with `AskUserQuestion`, a few questions at a time, multiple
   choice where you can offer real options (recommended one first). Cover what
   is still open of: the problem and who has it, what is in and out of scope,
   what “done” looks like as checks, anything touching athlete data (the
   privacy rule in `CLAUDE.md` needs an explicit decision to widen), new
   migrations, and steps only the maintainer can do. Stop when the answers add
   up to a spec — usually two or three rounds.
3. **Write the item.** The id is the highest `NNNN` in `work/` plus one.
   Status `spec`, or `ready` if the maintainer said to go ahead. Every
   “Done when” line must be checkable: a test, a command, a screenshot, a page
   to open. If it came from the backlog, remove that line from
   `work/backlog.md`.
4. **Decisions** the maintainer made in the interview go to
   `docs/decisions.md` under the next number, and the item lists them in
   `decisions:`. Proposals stay in the item's notes.
5. **Don't build.** End with the item's path and suggest building it in a
   fresh session (`/clear`, then “build work/NNNN”), so the build starts from
   the written spec rather than this conversation.
