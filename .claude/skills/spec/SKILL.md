---
name: spec
description: Turn an idea into a GitHub issue on the board — interview the maintainer until the change has a scope and checkable “Done when” lines, then create the issue. Use when the user runs /spec, or asks to write up, spec or plan a feature or change before building it.
argument-hint: "[idea, or an issue number to sharpen]"
---

# Spec an issue

Work is tracked as issues on the GitHub board, project “Spenst”
(decision 22; copied from Grep's skill). An issue with the `agent` label is
built by Claude in Actions (`.github/workflows/claude.yml`), so the issue has
to stand on its own: the agent sees nothing of this conversation.

1. **Read before asking.** Open issues in the same area
   (`gh issue list --search "…"`, or the issue named in the argument with
   `gh issue view N --comments`), `docs/decisions.md`, the relevant design
   document in `docs/`, the matching file in `.claude/rules/`, and enough of
   the code to know what exists. Don't ask what the code or docs already
   answer.
2. **Interview** with `AskUserQuestion`, a few questions at a time, multiple
   choice where you can offer real options (recommended one first). Cover what
   is still open of: the problem and who has it, what is in and out of scope,
   what “done” looks like as checks, anything touching athlete data (the
   privacy rule in `CLAUDE.md` needs an explicit decision to widen), new
   migrations, and steps only the maintainer can do. An S&C claim behind a
   default or threshold goes to the `sc-researcher` agent. Stop when the
   answers add up to a spec — usually two or three rounds.
3. **Write the issue** in the shape of `.github/ISSUE_TEMPLATE/work.yml`:
   `### Why`, `### Scope` (In / Out), `### Done when` (a `- [ ]` list),
   `### Notes` (files, edge cases, decisions cited by number). Every “Done
   when” line must be checkable: a test, a command, a screenshot, a page to
   open. Show the maintainer the title and body, then
   `gh issue create --title … --body-file …` (or `gh issue edit N` to sharpen
   an existing one), and put it on the board in Backlog — or Ready, if the
   maintainer said to go ahead:

   ```bash
   gh project item-add 3 --owner gapav --url <issue url>
   GITHUB_REPOSITORY=gapav/spenst .github/scripts/project-status.sh N "Backlog"
   ```
4. **Decisions** the maintainer made in the interview go to
   `docs/decisions.md` under the next number, and the issue cites them under
   Notes. Proposals stay in Notes.
5. **Don't build.** Ask whether to hand it to the agent: if yes,
   `gh issue edit N --add-label agent`. Otherwise suggest building it in a
   fresh session (`/clear`, then “build #N”), so the build starts from the
   written issue rather than this conversation.
