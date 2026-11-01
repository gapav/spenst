---
paths:
  - "site/components/app-provider.tsx"
  - "site/lib/demo-data.ts"
---

# The provider

- A mutation is an optimistic `setState`, then `persist(() => supabase…)`,
  rolled back on failure. In demo mode the client is `null` and
  `persist(null)` is a no-op — every new mutation must work in that branch,
  and demo data must have whatever a new screen reads.
- **Session content saves are queued per session** (`editSessionContent`):
  the whole document goes up each time, so saves run in order and a slow one
  can never land after a newer one. Edits apply to the latest content via a
  ref, not to the render that made the callback.
- **`ovr_rows` is not in `loadPrivateData`** — a season of reps is too much.
  `loadOvrRows(athleteId)` and `loadOvrRowsForDay` page it in on demand;
  `ovrRowsVersion` bumps after an import or undo.
