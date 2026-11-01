---
name: sync-from-grep
description: Bring Grep's visual layer (palette, type, shell, UI primitives) into Spenst — compare with ~/code/plannr/site, port visual changes with their “copied from Grep” notes, and never touch data, auth or deployment code. Use when the user runs /sync-from-grep or asks to bring Spenst's look back in step with Grep.
disable-model-invocation: true
---

# Sync the visual layer from Grep

Spenst copies Grep's look as code, never its data or deployment (decision 10).
Grep is the source; this only ever reads `~/code/plannr`.

## The copied files

| Spenst (`site/`) | Grep (`~/code/plannr/site/`) | Note |
|---|---|---|
| `app/globals.css`, palette | `app/globals.css` | Verbatim down to the `── Spenst ──` comment, including the `--grep-*` names. Spenst's own tokens below it are not Grep's. |
| `app/globals.css`, shell | `app/globals.css` | Class for class, `grep-` renamed `spenst-` |
| `app/layout.tsx` font, `public/fonts/` | the same | DM Sans; the variable stays `--font-grep` |
| `components/ui.tsx`, `page-heading.tsx`, `theme-switch.tsx` | the same names | Close copies; Spenst's wording stays |
| `components/app-shell.tsx` | the same name | Adapted, not copied: the structure and classes follow Grep, the navigation and routes are Spenst's |
| `lib/theme.ts`, `lib/theme-tokens.test.ts` | the same | `theme.ts` is identical but for the prefix; the storage key stays `spenst-theme`, and the test has Spenst's own checks |

`components/logo.tsx` is Spenst's own mark — never sync it.

## Steps

1. Diff each pair. Sort every difference into: **port** (a visual change in
   Grep), **keep** (Spenst on purpose: lime `--signature` where Grep has
   apricot, Spenst's tokens, routes, copy, the `spenst-` prefix), or **never**
   (anything about data, Supabase, auth, email, cron or deployment, even
   inside these files).
2. Port the first kind. Keep each “copied from Grep” comment; add one where
   you bring in a new copied piece. Never write a colour into a component; a
   new colour is a token on `:root` and in the dark block.
3. Run `npx vitest run lib/theme-tokens.test.ts`, then `npm run lint` and
   `npm run build`, from `site/`.
4. Report what you ported, what you kept and why, and anything in Grep that
   looked visual but touched data, so the maintainer can decide.
