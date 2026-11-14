import { describe, expect, it } from "vitest";
import { BUILTIN_EXERCISES } from "../exercise-library";
import { BUILTIN_BATTERIES, TESTS } from "../power-profile";
import { addDays, dayNumber, overlapsOnLevel, seasonEndsOn, type Period } from "../season";
import { allSlots, parseSessionContent, type MetricKey, type SetGroup } from "../training";
import { handball2ndDivision202627 } from "./handball-2nd-division-2026-27";
import { fixtureDates, MIN_DAYS_TO_MATCH, seniorTestDiv2202627 as seed } from "./senior-test-div-2-2026-27";

const exercises = new Map(BUILTIN_EXERCISES.map((exercise) => [exercise.id, exercise]));
const seasonEnd = seasonEndsOn(seed.season);
const inSeason = (date: string) => dayNumber(date) >= dayNumber(seed.season.startsOn) && dayNumber(date) <= dayNumber(seasonEnd);
const matchDays = fixtureDates.map(dayNumber);
const nextMatchIn = (date: string) => {
  const next = matchDays.find((match) => match >= dayNumber(date));
  return next === undefined ? Infinity : next - dayNumber(date);
};
const lastMatchAgo = (date: string) => {
  const last = matchDays.filter((match) => match <= dayNumber(date)).at(-1);
  return last === undefined ? Infinity : dayNumber(date) - last;
};

const GROUP_METRICS: (keyof SetGroup & MetricKey)[] = ["reps", "load", "velocity", "contacts", "height", "distance", "time", "rpe"];

describe("Senior Test Div 2 seed", () => {
  it("is a new adult team on Test Team’s season and fixture list, testing on Senior 10", () => {
    expect(seed.teamName).toBe("Senior Test Div 2");
    expect(seed.source).toEqual({ teamName: "Test Team", seasonTitle: handball2ndDivision202627.season.title });
    expect(seed.season).toMatchObject({ startsOn: handball2ndDivision202627.season.startsOn, weeks: handball2ndDivision202627.season.weeks });
    expect(fixtureDates).toHaveLength(22);
    expect(BUILTIN_BATTERIES.map((battery) => battery.id)).toContain(seed.batteryKey);
  });

  it("has 14 minimized, adult athletes with consent, covering every position", () => {
    expect(seed.athletes).toHaveLength(14);
    for (const athlete of seed.athletes) {
      expect(athlete.displayName).toMatch(/^\p{Lu}\p{Ll}+ \p{Lu}\.$/u);
      expect(2026 - Number(athlete.birthMonth.slice(0, 4))).toBeGreaterThanOrEqual(18);
      expect(athlete.measurementConsent).toBe(true);
    }
    expect(new Set(seed.athletes.map((athlete) => athlete.position))).toEqual(new Set(["keeper", "wing", "back", "centre", "pivot"]));
    expect(new Set(seed.athletes.map((athlete) => athlete.id)).size).toBe(14);
  });

  it("records every battery test per athlete and test day, with sided tests on both legs", () => {
    const battery = BUILTIN_BATTERIES.find((candidate) => candidate.id === seed.batteryKey)!;
    for (const day of seed.testDays) {
      expect(dayNumber(day.heldOn)).toBeLessThan(dayNumber("2026-11-13"));
      const byAthlete = Map.groupBy(day.results, (result) => result.athleteId);
      expect(byAthlete.size).toBeGreaterThanOrEqual(13);
      for (const results of byAthlete.values()) {
        for (const key of battery.tests) {
          const sides = results.filter((result) => result.testKey === key).map((result) => result.side).sort();
          expect(sides).toEqual(TESTS[key].sided ? ["left", "right"] : ["both"]);
        }
        for (const result of results) expect(result.value).toBeGreaterThan(0);
      }
    }
  });

  it("has realistic senior values and flags a few asymmetries", () => {
    const all = seed.testDays.flatMap((day) => day.results);
    for (const result of all.filter((candidate) => candidate.testKey === "sprint_5m")) expect(result.value).toBeGreaterThan(0.9);
    for (const result of all.filter((candidate) => candidate.testKey === "sprint_5m")) expect(result.value).toBeLessThan(1.25);
    const latest = seed.testDays.at(-1)!.results;
    const asymmetries = seed.athletes.flatMap((athlete) => {
      const left = latest.find((result) => result.athleteId === athlete.id && result.side === "left")?.value;
      const right = latest.find((result) => result.athleteId === athlete.id && result.side === "right")?.value;
      return left && right ? [Math.abs(left - right) / Math.max(left, right)] : [];
    });
    expect(asymmetries.filter((share) => share > 0.1).length).toBeGreaterThanOrEqual(2);
  });

  it("has blocks that cover the season back to back, inside its phases’ kinds", () => {
    const periods: Period[] = seed.blocks.map((block, index) => ({ ...block, id: `block-${index}`, seasonId: "season" }));
    let cursor = seed.season.startsOn;
    for (const period of periods) {
      expect(period.level).toBe("block");
      expect(period.startsOn).toBe(cursor);
      expect(overlapsOnLevel(periods, period)).toBeNull();
      cursor = addDays(period.startsOn, period.weeks * 7);
    }
    expect(addDays(cursor, -1)).toBe(seasonEnd);
    for (const phase of handball2ndDivision202627.phases) {
      const inside = periods.filter((block) => dayNumber(block.startsOn) >= dayNumber(phase.startsOn) && dayNumber(block.startsOn) < dayNumber(phase.startsOn) + phase.weeks * 7);
      expect(inside.length).toBeGreaterThan(0);
      for (const block of inside) expect(block.kind).toBe(phase.kind);
    }
  });

  it("schedules sessions in the season, never on or the day after a match, and hard work far enough from the next", () => {
    expect(seed.sessions.length).toBeGreaterThan(100);
    for (const session of seed.sessions) {
      expect(inSeason(session.scheduledOn)).toBe(true);
      expect(nextMatchIn(session.scheduledOn)).toBeGreaterThanOrEqual(MIN_DAYS_TO_MATCH[session.kind]);
      expect(lastMatchAgo(session.scheduledOn)).toBeGreaterThanOrEqual(2);
      expect(session.title.length).toBeLessThanOrEqual(80);
    }
  });

  it("has at least one session in every week of the season (the minimum dose)", () => {
    for (let week = 0; week < seed.season.weeks; week += 1) {
      const monday = addDays(seed.season.startsOn, week * 7);
      expect(seed.sessions.some((session) => dayNumber(session.scheduledOn) >= dayNumber(monday) && dayNumber(session.scheduledOn) < dayNumber(monday) + 7), monday).toBe(true);
    }
  });

  it("sprints, jumps and does hamstring work every week (the throughline)", () => {
    for (let week = 0; week < seed.season.weeks; week += 1) {
      const monday = addDays(seed.season.startsOn, week * 7);
      const slots = seed.sessions
        .filter((session) => dayNumber(session.scheduledOn) >= dayNumber(monday) && dayNumber(session.scheduledOn) < dayNumber(monday) + 7)
        .flatMap((session) => allSlots(session.content));
      const modalities = new Set(slots.map((slot) => exercises.get(slot.exerciseId)!.modality));
      expect(modalities.has("sprint"), monday).toBe(true);
      expect(modalities.has("plyometric") || slots.some((slot) => slot.exerciseId === "builtin:trap_bar_jump"), monday).toBe(true);
      expect(slots.some((slot) => /nordic/.test(slot.exerciseId)), monday).toBe(true);
    }
  });

  it("uses only built-in exercises, prescribed in metrics each one (and each variant) allows", () => {
    for (const session of seed.sessions) {
      for (const slot of allSlots(session.content)) {
        const exercise = exercises.get(slot.exerciseId);
        expect(exercise, slot.exerciseId).toBeDefined();
        for (const candidate of [exercise!, ...slot.variants.map((variant) => exercises.get(variant.exerciseId)!)]) {
          expect(candidate).toBeDefined();
          for (const group of slot.setGroups) {
            for (const metric of GROUP_METRICS) if (group[metric] !== undefined) expect(candidate.metrics, `${candidate.id} ${metric}`).toContain(metric);
            if (group.perSide) expect(candidate.unilateral, candidate.id).toBe(true);
          }
        }
        if (slot.setGroups.some((group) => group.velocity)) expect(exercise!.velocityMetric).not.toBeNull();
      }
    }
  });

  it("writes content that parseSessionContent reads back unchanged", () => {
    for (const session of seed.sessions) expect(parseSessionContent(JSON.parse(JSON.stringify(session.content)))).toEqual(session.content);
  });

  it("publishes the autumn and leaves the rest of the year, and the taper, as drafts", () => {
    for (const session of seed.sessions) {
      const published = dayNumber(session.scheduledOn) <= dayNumber("2026-12-20") && !session.title.includes("if group winner");
      expect(session.status).toBe(published ? "published" : "draft");
    }
  });
});
