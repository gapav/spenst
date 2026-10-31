import { describe, expect, it } from "vitest";
import { batteryFor, BUILTIN_BATTERIES, cleanBatteryTests, DEFAULT_BATTERY_ID, formatChange, latestValues, ordinal, populationFor, profileFor, shareOfBest, squadValues, valueHistory, type DatedResult } from "./power-profile";
import { summarizeSquad } from "./squad";
import { demoAthletes, demoMeasurements, demoResults, demoTestDays } from "./demo-data";

const asOf = new Date("2026-10-07T12:00:00Z");
const result = (overrides: Partial<DatedResult>): DatedResult => ({ id: Math.random().toString(36), testDayId: "d1", athleteId: "a", testKey: "sprint_10m", side: null, value: 2, heldOn: "2026-09-14", ...overrides });

describe("population", () => {
  it("switches population in the year the athlete turns 18", () => {
    expect(populationFor({ birthMonth: "2009-01" }, asOf)).toBe("youth");
    expect(populationFor({ birthMonth: "2008-12" }, asOf)).toBe("adult");
  });
});

describe("valueHistory and latestValues", () => {
  it("keeps every test day per test, newest first", () => {
    const history = valueHistory([result({ value: 2.1, heldOn: "2026-09-01", testDayId: "old" }), result({ value: 2.0, heldOn: "2026-10-01", testDayId: "new" })]);
    expect(history.get("sprint_10m")?.map((entry) => entry.value)).toEqual([2.0, 2.1]);
  });

  it("keeps the latest test day per test", () => {
    const latest = latestValues([result({ value: 2.1, heldOn: "2026-09-01", testDayId: "old" }), result({ value: 2.0, heldOn: "2026-10-01", testDayId: "new" })]);
    expect(latest.get("sprint_10m")).toMatchObject({ value: 2.0, testDayId: "new" });
  });

  it("needs both legs from the same day for a sided test, and averages them", () => {
    const half = latestValues([result({ testKey: "split_squat_jump", side: "left", value: 900, testDayId: "new", heldOn: "2026-10-01" })]);
    expect(half.has("split_squat_jump")).toBe(false);
    const both = latestValues([
      result({ testKey: "split_squat_jump", side: "left", value: 900 }),
      result({ testKey: "split_squat_jump", side: "right", value: 1000 }),
      result({ testKey: "split_squat_jump", side: "left", value: 950, testDayId: "new", heldOn: "2026-10-01" }),
    ]);
    expect(both.get("split_squat_jump")).toMatchObject({ value: 950, sides: { left: 900, right: 1000 }, testDayId: "d1" });
  });
});

describe("profiles without scores", () => {
  const adult = { id: "a", birthMonth: "1998-04" };
  const results = [
    result({ athleteId: "a", value: 1.8, heldOn: "2026-08-20", testDayId: "aug" }),
    result({ athleteId: "a", value: 1.7, heldOn: "2026-10-01", testDayId: "oct" }),
    result({ athleteId: "b", value: 1.6, heldOn: "2026-10-01", testDayId: "oct" }),
    result({ athleteId: "c", value: 2.0, heldOn: "2026-10-01", testDayId: "oct" }),
    result({ athleteId: "a", testKey: "hang_clean", value: 2500, heldOn: "2026-10-01", testDayId: "oct" }),
    result({ athleteId: "b", testKey: "hang_clean", value: 2000, heldOn: "2026-10-01", testDayId: "oct" }),
  ];
  const squad = squadValues(results);
  const senior10 = BUILTIN_BATTERIES.find((battery) => battery.id === "builtin:senior-10")!.tests;
  const profile = profileFor({ athlete: adult, asOf, results: results.filter((entry) => entry.athleteId === "a"), squad, battery: senior10 });
  const sprint = profile.tests.find((test) => test.test.key === "sprint_10m")!;
  const clean = profile.tests.find((test) => test.test.key === "hang_clean")!;

  it("keeps the measured value, and the change since the test day before", () => {
    expect(sprint.latest?.value).toBe(1.7);
    expect(sprint.change).toBeCloseTo(-0.1);
    expect(sprint.improved).toBe(true);
  });

  it("places the athlete in the squad, the right way round for times", () => {
    expect([sprint.rank, sprint.ranked]).toEqual([2, 3]);
    expect([clean.rank, clean.ranked]).toEqual([1, 2]);
  });

  it("reads the share of the squad's best, and the squad median the same way", () => {
    expect(sprint.ofSquadBest).toBeCloseTo(1.6 / 1.7);
    expect(clean.ofSquadBest).toBe(1);
    expect(sprint.squadMedianOfBest).toBeCloseTo(1.6 / 1.7);
    expect(shareOfBest(2000, 2500, "higher")).toBe(0.8);
  });

  it("places the value in the squad's range: weakest 0, best 1", () => {
    expect(clean.inSquadRange).toBe(1);
    expect(sprint.inSquadRange).toBeCloseTo((2.0 - 1.7) / (2.0 - 1.6));
    expect(sprint.squadMedianInRange).toBeCloseTo((2.0 - 1.7) / (2.0 - 1.6));
  });

  it("covers the whole battery, with gaps for tests not run", () => {
    expect(profile.tests).toHaveLength(senior10.length);
    expect(profile.tests.find((test) => test.test.key === "push_press")).toMatchObject({ latest: null, rank: null, ofSquadBest: null });
  });

  it("has nothing that looks like a score", () => {
    expect(Object.keys(profile)).toEqual(["population", "tests"]);
    expect(Object.keys(sprint)).not.toContain("score");
    expect(Object.keys(sprint)).not.toContain("tier");
  });

  it("summarises the demo squad, everyone ranked against their team", () => {
    const seniors = demoAthletes.filter((athlete) => athlete.teamIds.includes("team-senior"));
    const summaries = summarizeSquad({ athletes: seniors, results: demoResults, testDays: demoTestDays, measurements: demoMeasurements, asOf, battery: batteryFor({ batteryId: DEFAULT_BATTERY_ID }).tests });
    const leaders = summaries.filter((summary) => summary.profile.tests.find((test) => test.test.key === "sprint_5m")?.rank === 1);
    expect(leaders.length).toBeGreaterThanOrEqual(1);
  });
});

describe("formatting", () => {
  it("signs a change", () => {
    expect([formatChange(-0.04, "s"), formatChange(120, "W"), formatChange(0, "cm")]).toEqual(["−0.04 s", "+120 W", "±0 cm"]);
  });
  it("writes places", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22].map(ordinal)).toEqual(["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd"]);
  });
});

describe("test batteries", () => {
  it("defaults to Spenst 7: the seven agreed tests, in radar order", () => {
    expect(batteryFor(null)).toMatchObject({ id: DEFAULT_BATTERY_ID, name: "Spenst 7" });
    expect(batteryFor(null).tests).toEqual(["sprint_5m", "cmj", "trap_bar_jump", "split_squat_jump", "broad_jump", "push_press", "bench_throw"]);
  });

  it("finds a team's own battery, and falls back to the default for one that is gone", () => {
    const own = { id: "b1", teamId: "t", name: "Ours", description: "", tests: ["cmj" as const] };
    expect(batteryFor({ batteryId: "b1" }, [own])).toBe(own);
    expect(batteryFor({ batteryId: "builtin:youth-8" }).name).toBe("Youth 8");
    expect(batteryFor({ batteryId: "deleted" }).id).toBe(DEFAULT_BATTERY_ID);
  });

  it("keeps only known tests, once each, in the order given", () => {
    expect(cleanBatteryTests(["cmj", "nonsense", "sprint_5m", "cmj"])).toEqual(["cmj", "sprint_5m"]);
  });

  it("only uses tests the catalogue knows", () => {
    for (const battery of BUILTIN_BATTERIES) expect(cleanBatteryTests(battery.tests)).toEqual([...battery.tests]);
  });
});
