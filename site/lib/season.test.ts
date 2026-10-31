import { describe, expect, it } from "vitest";
import { addDays, freeSpanAround, isoWeek, mondayOf, monthSpans, noteLines, overlapsOnLevel, periodAt, periodColumns, seasonEndsOn, seasonWeeks, spanFromColumns, weekIndex, type Period } from "./season";

const season = { startsOn: "2026-08-03", weeks: 48 };
const period = (overrides: Partial<Period>): Period => ({ id: "p", seasonId: "s", level: "phase", kind: "training", title: "", startsOn: "2026-08-03", weeks: 6, emphasis: null, focus: "", notes: "", ...overrides });

describe("calendar arithmetic", () => {
  it("finds Mondays and ISO weeks, across a year end", () => {
    expect(mondayOf("2026-10-08")).toBe("2026-10-05");
    expect(mondayOf("2026-10-05")).toBe("2026-10-05");
    expect(isoWeek("2026-10-05")).toBe(41);
    expect(isoWeek("2026-12-31")).toBe(53);
    expect(isoWeek("2027-01-04")).toBe(1);
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
  });

  it("lays the season out in week columns", () => {
    const weeks = seasonWeeks(season);
    expect(weeks).toHaveLength(48);
    expect(weeks[0]).toMatchObject({ index: 0, start: "2026-08-03", end: "2026-08-09", isoWeek: 32 });
    expect(seasonEndsOn(season)).toBe("2027-07-04");
    expect(weekIndex(season, "2026-10-08")).toBe(9);
    expect(weekIndex(season, "2026-08-02")).toBeNull();
    expect(weekIndex(season, "2027-07-05")).toBeNull();
  });

  it("labels months by the Thursday of each week", () => {
    const months = monthSpans(season);
    expect(months[0]).toEqual({ label: "Aug", from: 0, to: 3 });
    // 31 Aug–6 Sep has its Thursday on 3 September.
    // British English abbreviates September as “Sept”.
    expect(months[1]).toMatchObject({ label: expect.stringMatching(/^Sep/), from: 4 });
    expect(months.at(-1)?.label).toBe("Jul");
  });
});

describe("periods", () => {
  it("maps a period to clipped columns", () => {
    expect(periodColumns(season, period({ startsOn: "2026-09-14", weeks: 4 }))).toEqual({ from: 6, to: 9 });
    expect(periodColumns(season, period({ startsOn: "2026-07-20", weeks: 4 }))).toEqual({ from: 0, to: 1 });
    expect(periodColumns(season, period({ startsOn: "2027-08-02", weeks: 2 }))).toBeNull();
  });

  it("refuses overlap on the same level, allows it across levels", () => {
    const phase = period({ id: "a", startsOn: "2026-08-03", weeks: 6 });
    expect(overlapsOnLevel([phase], { id: "b", level: "phase", startsOn: "2026-09-07", weeks: 2 })?.id).toBe("a");
    expect(overlapsOnLevel([phase], { id: "b", level: "phase", startsOn: "2026-09-14", weeks: 2 })).toBeNull();
    expect(overlapsOnLevel([phase], { id: "b", level: "block", startsOn: "2026-08-03", weeks: 2 })).toBeNull();
    expect(overlapsOnLevel([phase], { id: "a", level: "phase", startsOn: "2026-08-10", weeks: 6 })).toBeNull();
  });

  it("finds the period a date falls in", () => {
    const periods = [period({ id: "a", weeks: 2 }), period({ id: "b", level: "block", startsOn: "2026-08-10", weeks: 1 })];
    expect(periodAt(periods, "phase", "2026-08-16")?.id).toBe("a");
    expect(periodAt(periods, "phase", "2026-08-17")).toBeNull();
    expect(periodAt(periods, "block", "2026-08-12")?.id).toBe("b");
  });

  it("turns a drag into a week span either way round", () => {
    expect(spanFromColumns(season, 5, 2)).toEqual({ startsOn: "2026-08-17", weeks: 4 });
  });

  it("finds the free run of weeks around a column", () => {
    const periods = [period({ id: "a", startsOn: "2026-08-03", weeks: 2 }), period({ id: "b", startsOn: "2026-09-07", weeks: 1 })];
    expect(freeSpanAround(season, periods, "phase", 3)).toEqual({ from: 2, to: 4 });
    expect(freeSpanAround(season, periods, "phase", 1)).toBeNull();
    expect(freeSpanAround(season, periods, "block", 1)).toEqual({ from: 0, to: 47 });
  });

  it("reads notes as bullet points", () => {
    expect(noteLines("- Akselerasjon\n\n• Vendinger \n  Mobilitet")).toEqual(["Akselerasjon", "Vendinger", "Mobilitet"]);
  });
});
