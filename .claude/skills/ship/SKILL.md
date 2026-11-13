---
name: ship
description: Finish a change built locally — run lint, tests and build, have it reviewed against its issue's “Done when” (and any migration by db-reviewer), apply any migration, then commit on a branch and open a pull request whose body says what is left before merging. Commits and pushes the branch only when told; never pushes main.
argument-hint: "[issue number]"
disable-model-invocation: true
allowed-tools: Bash(npm test) Bash(npm run lint) Bash(npm run build) Bash(npm run db:bootstrap) Bash(npm run db:status) Bash(npx vitest run *) Bash(git status *) Bash(git diff *) Bash(git log *) Bash(git branch *) Bash(gh issue view *) Bash(gh pr view *)
---

# Ship a change

Changes reach `main` through pull requests (decision 22; adapted from Grep's
skill). The agent in Actions finishes its own work the same way; this skill
is for what was built in a local session.

1. **Find the issue**: `$ARGUMENTS`, or the number in the branch name
   (`agent/N-…`, `N-…`). Read it with `gh issue view N --comments`. If there
   is none, say so and ship the diff without one only if the maintainer
   agrees.
2. **See the change**: `git status` and `git diff` (untracked files too).
   If the work sits on `main`, it moves to a branch named `N-short-name`
   before anything is committed.
3. **If anything under `site/supabase/migrations/` changed**, run
   `npm run db:bootstrap` from `site/`, and check each new file sorts after
   every applied migration (`npm run db:status`).
4. **Run the checks** from `site/`: `npm run lint`, `npm test`,
   `npm run build`. Fix failures and run them again; report each with its
   result line.
5. **Review**, in parallel:
   - the `spec-reviewer` agent, given the issue's number and text, the list
     of changed files and the diff;
   - the `db-reviewer` agent as well if anything under `site/supabase/`
     changed.

   Fix the correctness gaps they find. For any finding you don't fix, say why.
6. **Apply migrations** the change adds with `npm run db:push` (decision 21:
   it backs up, dry-runs and applies), after the reviews, and report its
   output. Ask first if a migration deletes or overwrites existing data.
7. **Report**: the checks and their results, what the reviewers found and
   what you fixed, what `db:push` applied, and the pull request you would
   open — title `summary (#N)`, body filled in from
   `.github/pull_request_template.md`, with every “Done when” line ticked or
   explained and the *Before merging* steps (or “Nothing.”).
8. **Only when the maintainer says so**: stage the change's files by name
   (not `git add -A`), commit `summary (#N)`, `git push -u origin <branch>`,
   and `gh pr create --base main` with that title and body. Never push `main`.
9. **Move the issue's card to In review**, as the agent in Actions does once
   it has opened its PR. From the repo root:
   `GITHUB_REPOSITORY=gapav/spenst .github/scripts/project-status.sh N "In review"`.
   It needs a `gh` login with the `project` scope; if it fails, say so and
   leave the card for the maintainer rather than retrying. Skip this step
   when the change was shipped without an issue.
