import { describe, expect, it } from "vitest";
import { hoursBetween, isCongestedWeek, matchDayLabel, matchesInWeek } from "./match-days";
import type { Match } from "./types";

const match = (playedOn: string, kickOff: string | null = null, opponent = "Lyn"): Match =>
  ({ id: `m-${playedOn}`, teamId: "t", playedOn, kickOff, opponent, home: true, kind: "league", priority: false, note: "" });

// 2026-10-12 is a Monday.
describe("matchDayLabel", () => {
  it("labels a Saturday-only week from MD-5 to MD, and nothing after it", () => {
    const matches = [match("2026-10-17")];
    expect(matchDayLabel("2026-10-12", matches)?.label).toBe("MD-5");
    expect(matchDayLabel("2026-10-16", matches)?.label).toBe("MD-1");
    expect(matchDayLabel("2026-10-17", matches)?.label).toBe("MD");
    expect(matchDayLabel("2026-10-18", matches)).toBeNull();
  });

  it("counts every day towards the next match, however recent the last one", () => {
    const wednesdayAndSaturday = [match("2026-10-14"), match("2026-10-17")];
    expect(matchDayLabel("2026-10-14", wednesdayAndSaturday)?.label).toBe("MD");
    expect(matchDayLabel("2026-10-15", wednesdayAndSaturday)).toMatchObject({ label: "MD-2", match: { playedOn: "2026-10-17" } });
    const sundayAndWednesday = [match("2026-10-11"), match("2026-10-14")];
    expect(matchDayLabel("2026-10-12", sundayAndWednesday)?.label).toBe("MD-2");
  });

  it("returns null with no match in the next seven days", () => {
    expect(matchDayLabel("2026-10-12", [match("2026-10-20")])).toBeNull();
    expect(matchDayLabel("2026-10-12", [match("2026-10-19")])?.label).toBe("MD-7");
    expect(matchDayLabel("2026-10-12", [match("2026-10-11")])).toBeNull();
    expect(matchDayLabel("2026-10-12", [])).toBeNull();
  });
});

describe("matchesInWeek", () => {
  it("lists Monday to Sunday, in order", () => {
    const matches = [match("2026-10-18"), match("2026-10-12"), match("2026-10-19"), match("2026-10-11")];
    expect(matchesInWeek("2026-10-12", matches).map((entry) => entry.playedOn)).toEqual(["2026-10-12", "2026-10-18"]);
  });
});

describe("isCongestedWeek", () => {
  it("is false for a Saturday-only week", () => {
    expect(isCongestedWeek("2026-10-12", [match("2026-10-10"), match("2026-10-17"), match("2026-10-24")])).toBe(false);
  });

  it("is true for a Wednesday + Saturday week", () => {
    expect(isCongestedWeek("2026-10-12", [match("2026-10-14"), match("2026-10-17")])).toBe(true);
  });

  it("marks the week of a Wednesday match that follows a Sunday match, not the Sunday's week", () => {
    const matches = [match("2026-10-11"), match("2026-10-14")];
    expect(isCongestedWeek("2026-10-12", matches)).toBe(true);
    expect(isCongestedWeek("2026-10-05", matches)).toBe(false);
  });

  it("uses kick-off times when both are known", () => {
    expect(hoursBetween(match("2026-10-11", "18:00"), match("2026-10-14", "19:00"))).toBe(73);
    expect(isCongestedWeek("2026-10-12", [match("2026-10-11", "18:00"), match("2026-10-14", "19:00")])).toBe(false);
    expect(isCongestedWeek("2026-10-12", [match("2026-10-11", "18:00"), match("2026-10-14", "17:00")])).toBe(true);
  });

  it("is false for an empty week", () => {
    expect(isCongestedWeek("2026-10-12", [])).toBe(false);
  });
});
