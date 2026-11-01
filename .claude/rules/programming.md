---
paths:
  - "site/lib/{training,exercise-library}.ts"
  - "site/lib/training.test.ts"
  - "site/components/{session-builder,exercise-picker,target-field}.tsx"
  - "site/app/plan/sessions/**"
  - "site/app/exercises/**"
---

# Programming (`lib/training.ts`, `lib/exercise-library.ts`)

- **One vocabulary for every kind of training.** An `Exercise` declares the
  `metrics` it can be measured in; a `SetGroup` sets targets (`{ min, max }`)
  in that vocabulary; the athlete's log records actuals in the same terms.
  The builder only offers the fields an exercise's metrics allow.
- **The built-in library is code**, keyed `builtin:<key>`. Keys are permanent:
  rename freely, never delete or re-key — set logs point at them. Team-made
  exercises are rows in `exercises` (uuid ids).
- **A session's content is one JSON document** (`sessions.content`):
  sections → slots → set groups, edited only through the pure functions in
  `lib/training.ts` and read back through `parseSessionContent`, which drops
  malformed pieces rather than throwing.
- Builder fields (`components/target-field.tsx`) commit on blur from the
  input's own value, and accept "5", "6–8", "0,75–0,90"; rest takes "90" or "2:30".

## Variants

- A slot can offer an easier (−1) and a harder (+1) **variant**: another
  exercise, with the slot's prescription or its own. `resolveSlot(slot, level)`
  says what that variant prescribes; it falls back to the slot as written.
- **Which variant is an in-session choice**, made by the athlete with the coach
  on the day — not an athlete setting. Nothing is stored per athlete; the log
  records the exercise actually done. Planning views show slots as written.
- The library suggests natural ladders (`suggestedVariants` from the
  `easier` / `harder` keys in `lib/exercise-library.ts`).
