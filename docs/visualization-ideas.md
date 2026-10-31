# Graphs, plots and diagrams — ideas for later

> **Data now available (7 Oct 2026):** every OVR rep, jump and split is stored in
> `ovr_rows` with every column (velocity, power, ROM, time to peak, EA index,
> splits, speed …), training sessions included — most ideas below no longer
> wait on logging. A first per-exercise trend is on the athlete page.

*Backlog, started 7 October 2026. Ordered roughly by value. Each idea notes
what it shows and the data it needs: **now** (already captured by testing),
**logging** (needs the workout tracker in `athletes-and-programming.md`), or
**OVR** (needs data OVR may not export).*

Rules for all of them: colours come from tokens and work in both themes; every
chart has a table view or sits beside one; a single series needs no legend, two
or more always get one; load the `dataviz` skill before building any of them.

---

## 1. The profile emblem ★

**The reference:** the decorative art in the overview hero — a lime shape over a
lilac polygon grid on the dark purple ground. Make that the real thing: one
diagram that represents every test an athlete has taken, recognisable at a
glance.

**Axes are qualities, not individual tests.** That is what makes it smart: the
youth battery (8 tests) and the senior one (10) produce the same shape, so a
17-year-old moving up to the senior squad keeps a comparable emblem, and two
athletes on different batteries can be compared.

| Axis | Youth tests | Senior tests |
|---|---|---|
| Acceleration | 5 m, 10 m | 5 m, 10 m |
| Change of direction | 505 | 505 |
| Vertical power | CMJ, squat jump | Speed squat, trap bar jump, squat jump |
| Single leg | Split squat jump | Split squat jump |
| Horizontal | Standing broad jump | — (add a broad jump, or drop the axis for seniors) ⚑ |
| Upper body | Med ball throw | Push press, speed bench |
| Triple extension | — | Hang power clean |

An axis places the athlete in the squad's range on its tests (no 0–10 scores — decision 17); the `quality` field on every
test in `lib/power-profile.ts` already holds this grouping.

**What it layers:**

- **Fill:** the latest test day, in the signature lime.
- **Outline:** the previous test day, so growth reads as the shape swelling.
- **Ghost (optional):** the squad median.
- **Ticks on each axis** for the individual tests, so the breakdown survives the grouping.
- **Background rings** at quarters of the squad's range.
- **Asymmetry** as a split point on the single-leg axis: left and right as two
  half-dots, with the gap visible.

**Three sizes, one drawing:** a hero on the athlete page; a 32 px avatar used
wherever the athlete is named (the shape becomes their identity in the app); and
a share card (#14).

**Guardrails:** a radar's area exaggerates differences, so never rank on area;
keep the axis order fixed everywhere; always show it with the numbers; animate
between test days only when reduced motion is off.

*Data: **now**.*

## 2. Progress per test

A test's value across test days as a line, with the squad's range shaded behind it
and the squad median as a reference line. Ballou's observation that an athlete
moves about two categories at most belongs here as context.

*Data: **now**.*

## 3. Load–velocity line

An athlete's reps on one lift as dots (load × mean velocity) from the stored OVR
rows, with the fitted line, and last month's line behind it to show it moving.
Read-only — not a prescription tool (that was built and removed, decision 15).

*Data: **now** (`ovr_rows`).*

## 4. Asymmetry map

Ballou's slide: every athlete as a dot around a ratio of 1.0, a band at ±3 %
(tagged) and ±10 % (high), right-leg problems above and left below. Retest
monthly, with "then" and "now" side by side.

*Data: **now**.*

## 5. Change-of-direction quadrant

10 m time against COD deficit, split into four quadrants: fast and turns well,
fast but turns poorly, slow but turns well, slow and turns poorly. The quadrant
says what to train.

*Data: **now**.*

## 6. Maturity against results (bio-banding)

Youth only, and mostly 14–15-year-old boys, who are still growing: profile
results against maturity offset. Early maturers drift top-right; a late maturer
scoring "Average" while far from PHV may be the best prospect on the team. Helps
coaches avoid selecting for birthday and growth.

*Data: **now** (with consent).*

## 7. Sprint split profile

0–5 m and 5–10 m (and 10–20 m with more gates) as segments: who wins the start,
who builds speed. Later a Samozino force–velocity profile with enough splits.

*Data: **now**; F–V needs more gates.*

## 8. VBT set view

In the session player and the coach's review: one bar per set, its velocity
against the target band, green or red, the load written under it, and the
autoregulation decision between sets.

*Data: **logging**.*

## 9. Rep velocity curve

Ballou's speed-squat curve: velocity across one rep, with a line at 0.45 s (the
time from snap to contact in football; handball needs its own number) and the
goal of moving the peak left. Probably needs data OVR does not export —
time-to-peak per rep may be the most it gives.

*Data: **OVR**.*

## 10. Training load

Weekly session-RPE load, plyometric contacts per week, and week-on-week change,
with spikes marked. Shown per athlete and for the squad, with match days from
Spenst's own fixture import.

*Data: **logging**.*

## 11. Compliance heatmap

Athletes × days: done, partly done, missed, pain flagged. The coach's morning
glance.

*Data: **logging**.*

## 12. Team views

- Mean profile emblems per position, overlaid (backs against wings against pivots).
- Squad strip: every athlete's mini emblem in a grid — the team at a glance.

*Data: **now**.*

## 13. TV mode

A full-screen, auto-scrolling leaderboard for the gym TV, the
leader in lime.

*Data: **now** for tests; **logging** for daily points.*

## 14. Share card

The athlete's emblem and best improvements on a card made for a
phone screen: "Autumn test 2026 → October test: +9". Something athletes want to
show, which keeps them testing.

*Data: **now**.*
