import { describe, expect, it } from "vitest";
import { demoAthletes, demoMeasurements, demoResults, demoTestDays } from "./demo-data";
import { batteryFor, testDefinition } from "./power-profile";
import { demoTeams } from "./demo-data";
import { asymmetryFlags, latestMeasurement, seasonLabel, summarizeSquad, teamAthletes, testDayProgress, testDaysBySeason } from "./squad";

const asOf = new Date("2026-10-07T12:00:00Z");
const summaries = (teamId: string) => summarizeSquad({ athletes: teamAthletes(demoAthletes, teamId), results: demoResults, testDays: demoTestDays, measurements: demoMeasurements, asOf, battery: batteryFor(demoTeams.find((team) => team.id === teamId)).tests });

describe("demo data", () => {
  it("only uses known tests, and gives every sided result a side", () => {
    for (const result of demoResults) {
      const test = testDefinition(result.testKey);
      expect(test, result.testKey).not.toBeNull();
      expect(result.side === null, result.id).toBe(!test?.sided);
    }
  });

  it("spreads the squad out: every place from first to last is taken on a test", () => {
    const places = summaries("team-senior").map((summary) => summary.profile.tests.find((test) => test.test.key === "sprint_5m")?.rank).filter((rank): rank is number => rank !== null && rank !== undefined);
    expect(Math.min(...places)).toBe(1);
    expect(Math.max(...places)).toBeGreaterThanOrEqual(5);
  });
});

describe("squad selectors", () => {
  it("sorts a roster by name", () => {
    expect(teamAthletes(demoAthletes, "team-j15").map((athlete) => athlete.displayName)[0]).toBe("Emma S.");
    expect(teamAthletes(demoAthletes, undefined)).toEqual([]);
  });

  it("finds the newest measurement on or before a day", () => {
    expect(latestMeasurement(demoMeasurements, "a-ida")?.bodyMassKg).toBe(58);
    expect(latestMeasurement(demoMeasurements, "a-ida", "2026-08-01")).toBeNull();
  });

  it("flags the big split-squat asymmetries, biggest first", () => {
    const flags = asymmetryFlags(summaries("team-j15"));
    expect(flags[0].athlete.displayName).toBe("Emma S.");
    expect(flags[0].asymmetry?.level).toBe("high");
  });

  it("keeps a measured value as it is, with or without a body mass on file", () => {
    const ingrid = summaries("team-j15").find((summary) => summary.athlete.id === "a-ingrid");
    expect(ingrid?.profile.tests.find((test) => test.test.key === "squat_jump")?.latest?.value).toBeGreaterThan(0);
  });

  it("reports how far a test day has come", () => {
    const october = demoTestDays.find((day) => day.id === "day-j15-oct");
    expect(october && testDayProgress(october, demoAthletes, demoResults)).toEqual({ tested: 8, squad: 8 });
  });
});

describe("test days by season", () => {
  it("starts a season on 1 August", () => {
    expect(seasonLabel("2026-07-31")).toBe("2025/26");
    expect(seasonLabel("2026-08-01")).toBe("2026/27");
    expect(seasonLabel("2099-12-01")).toBe("2099/00");
  });

  it("groups newest season and newest day first", () => {
    const days = [{ id: "a", heldOn: "2026-04-15" }, { id: "b", heldOn: "2026-11-14" }, { id: "c", heldOn: "2026-08-04" }, { id: "d", heldOn: "2026-10-06" }];
    expect(testDaysBySeason(days).map((group) => [group.season, group.days.map((day) => day.id)])).toEqual([["2026/27", ["b", "d", "c"]], ["2025/26", ["a"]]]);
    expect(testDaysBySeason([])).toEqual([]);
  });
});
