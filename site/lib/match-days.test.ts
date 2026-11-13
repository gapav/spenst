import { describe, expect, it } from "vitest";
import { hoursBetween, isCongestedWeek, matchDayLabel, matchesInWeek } from "./match-days";
import type { Match } from "./types";

const match = (playedOn: string, kickOff: string | null = null, opponent = "Lyn"): Match =>
  ({ id: `m-${playedOn}`, teamId: "t", playedOn, kickOff, opponent, home: true, kind: "league", priority: false, note: "" });

// 2026-10-12 is a Monday.
describe("matchDayLabel", () => {
  it("labels a Saturday-only week from MD-5 to MD and on to MD+1", () => {
    const matches = [match("2026-10-17")];
    expect(matchDayLabel("2026-10-12", matches)?.label).toBe("MD-5");
    expect(matchDayLabel("2026-10-16", matches)?.label).toBe("MD-1");
    expect(matchDayLabel("2026-10-17", matches)?.label).toBe("MD");
    expect(matchDayLabel("2026-10-18", matches)).toMatchObject({ label: "MD+1", other: null });
  });

  it("gives Thursday of a Wednesday + Saturday week the nearer match, with the other in `other`", () => {
    const matches = [match("2026-10-14"), match("2026-10-17")];
    expect(matchDayLabel("2026-10-15", matches)).toMatchObject({ label: "MD+1", other: "MD-2" });
    expect(matchDayLabel("2026-10-14", matches)?.label).toBe("MD");
  });

  it("lets the next match win a tie", () => {
    // Saturday and the following Saturday: Wednesday is MD+4 and MD-3; Tuesday is MD+3 and MD-4.
    const matches = [match("2026-10-10"), match("2026-10-17")];
    expect(matchDayLabel("2026-10-13", matches)).toMatchObject({ label: "MD+3", other: "MD-4" });
    const tie = [match("2026-10-10"), match("2026-10-16")];
    expect(matchDayLabel("2026-10-13", tie)).toMatchObject({ label: "MD-3", other: "MD+3" });
  });

  it("handles a Sunday match followed by a Wednesday match", () => {
    const matches = [match("2026-10-11"), match("2026-10-14")];
    expect(matchDayLabel("2026-10-12", matches)).toMatchObject({ label: "MD+1", other: "MD-2" });
    expect(matchDayLabel("2026-10-13", matches)).toMatchObject({ label: "MD-1", other: "MD+2" });
  });

  it("returns null with no match within seven days", () => {
    expect(matchDayLabel("2026-10-12", [match("2026-10-20")])).toBeNull();
    expect(matchDayLabel("2026-10-12", [match("2026-10-19")])?.label).toBe("MD-7");
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
