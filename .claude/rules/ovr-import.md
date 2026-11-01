---
paths:
  - "site/lib/{xlsx,ovr,ovr-import,ovr-data}.ts"
  - "site/lib/ovr-import.test.ts"
  - "site/components/{ovr-import,athlete-ovr-data,ovr-trend-chart,test-results,testing-board}.tsx"
  - "site/app/testing/**"
---

# OVR import (`lib/xlsx.ts`, `lib/ovr-import.ts`, `/testing/import`)

- Nearly all test data arrives as an **OVR Connect export**: one .xlsx with
  Velocity (row per rep), Jump (row per jump) and Sprint (row per split)
  sheets. Every cell is text, columns are found by header, and **every export
  holds the whole history** — so an import is a comparison: `planImport`
  marks each value new / same / differs against what is stored, and only new
  values go in by default. Importing the same file twice is a no-op.
- `lib/xlsx.ts` is a minimal reader (fflate + DOMParser), parsed in the
  browser before anything is uploaded.
- Power tests take the best rep's **Peak Power**; sprints the fastest Total
  Time at a cumulative distance (OVR's Distance is per split — Speed is
  Distance / Split Time). Training reps feed no test, but are kept as rows.
  The export format is unconfirmed for multi-split sprints and jumps (open
  questions in `docs/decisions.md`).
- **One-leg tests are alternating reps**: one OVR exercise, sets of 8, reps
  1, 3, 5, 7 the starting leg (`firstLeg` on the mapping, default left = left
  foot forward). `legsOf` assigns legs and stores `side` on each `ovr_rows` row;
  `alternatingIssues` flags sets that are not exactly 8 reps (one missed rep
  swaps every leg after it). An exercise per leg ("… - L") still works via `side`.
- Names: OVR's (often full) names are minimised and matched to the roster;
  matches are remembered in `test_imports.summary`, coaches only, like the file.
- **Every row is kept**, not just the best values: `ovrRows` turns each rep,
  jump and split of a matched athlete into an `ovr_rows` row with every column
  (unknown future columns go to `extra` jsonb). `row_key` (sheet|date|exercise|
  set|rep#occurrence) makes the full-history export idempotent; `checksum`
  catches rows OVR changed. The `import_ovr_rows` RPC (security invoker, so RLS
  applies) adds new keys, updates changed ones, and leaves the rest untouched.
  `mergeOvrRows` is the same rule in JS for demo mode and tests.
- `ovr_rows` is paged in on demand, not loaded with the rest (see the
  provider). Shown by `components/athlete-ovr-data.tsx` (trend + every rep of
  every session); `lib/ovr-data.ts` holds the reading helpers.
- **Test days are read, not typed, for OVR tests.** `components/test-results.tsx`
  draws the squad as ranked dot strips (attempts small, the best large, left/right
  joined, the gap to first beside each), with a metric switch, tooltips, per-athlete
  attempt charts and a table view. Attempts come from `testAttempts`
  (`lib/ovr-data.ts`) over `loadOvrRowsForDay`. Only tape and My Jump tests keep
  the typed entry rows.
- Exercise → test/lift mappings are per team (`ovr_mappings`). The raw file
  goes to the private `ovr-exports` bucket (`<team>/<import>/<file>`), and
  results/readings carry `import_id` so an import can be undone.
