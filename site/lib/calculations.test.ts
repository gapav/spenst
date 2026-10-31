import { describe, expect, it } from "vitest";
import { asymmetry } from "./asymmetry";
import { rankEntries } from "./leaderboard";
import { ageClass, ageInYears, decimalAge, maturityOffset, phvStatus } from "./maturity";
import { bestRep, correctJumpPower, splitAlternatingReps } from "./ovr";
import { meetsMinimumAge, minimizeAthleteName } from "./roster";
import { codDeficit } from "./sprint";
import { estimateOneRepMax, repLight, setVerdict, zoneFor } from "./vbt";

describe("asymmetry", () => {
  it("is symmetrical at a ratio of 1", () => {
    expect(asymmetry(1000, 1000)).toMatchObject({ ratio: 1, deficitPercent: 0, weaker: null, level: "ok" });
  });

  it("tags from 3% and flags from 10%, whichever leg is weaker", () => {
    expect(asymmetry(1000, 980)?.level).toBe("ok");
    expect(asymmetry(1000, 970)).toMatchObject({ level: "tagged", weaker: "right", deficitPercent: 3 });
    expect(asymmetry(900, 1000)).toMatchObject({ level: "high", weaker: "left", deficitPercent: 10 });
  });

  it("refuses a leg without a value", () => {
    expect(asymmetry(0, 1000)).toBeNull();
  });
});

describe("OVR corrections", () => {
  it("scales bar-only jump power by the moving mass", () => {
    expect(correctJumpPower({ power: 1000, barKg: 20, bodyMassKg: 80 })).toBe(5000);
    expect(() => correctJumpPower({ power: 1000, barKg: 0, bodyMassKg: 80 })).toThrow();
  });

  it("splits alternating reps by the leg the athlete started on", () => {
    expect(splitAlternatingReps([1, 2, 3, 4, 5, 6, 7, 8], "right")).toEqual({ right: [1, 3, 5, 7], left: [2, 4, 6, 8] });
    expect(bestRep([800, 950, 900])).toBe(950);
    expect(bestRep([])).toBeNull();
  });
});

describe("velocity-based training", () => {
  it("places a velocity in Ballou's zones", () => {
    expect(zoneFor(0.35)?.id).toBe("absolute-strength");
    expect(zoneFor(0.9)?.id).toBe("speed-strength");
    expect(zoneFor(1.4)).toBeNull();
    expect(repLight(0.89, 0.9)).toBe("red");
  });

  it("bumps on any rep past the bump line, advances on all greens, otherwise holds", () => {
    const rule = { target: 0.9, bumpAbove: 1.05, bumpKg: 10 };
    expect(setVerdict([0.95, 1.06, 0.98], rule)).toEqual({ action: "bump", addKg: 10 });
    expect(setVerdict([0.95, 0.92, 0.91], rule)).toEqual({ action: "advance" });
    expect(setVerdict([0.95, 0.92, 0.88], rule)).toEqual({ action: "hold" });
    expect(setVerdict([0.95, 0.92, 0.88], { ...rule, greensToAdvance: 2 })).toEqual({ action: "advance" });
  });

  it("estimates 1RM from a load–velocity line at the minimum velocity", () => {
    // v = 1.5 - 0.01 * load → 0.3 m/s at 120 kg.
    expect(estimateOneRepMax([{ loadKg: 40, velocity: 1.1 }, { loadKg: 60, velocity: 0.9 }, { loadKg: 80, velocity: 0.7 }], 0.3)).toBe(120);
    expect(estimateOneRepMax([{ loadKg: 60, velocity: 0.9 }, { loadKg: 60, velocity: 0.8 }], 0.3)).toBeNull();
  });
});

describe("leaderboard", () => {
  it("ranks by direction and lets ties share a place — and gives no points", () => {
    const ranked = rankEntries([{ id: "a", t: 2.0 }, { id: "b", t: 1.9 }, { id: "c", t: 2.0 }, { id: "d", t: 2.2 }], (entry) => entry.t, "lower");
    expect(ranked.map(({ entry, rank }) => [entry.id, rank])).toEqual([["b", 1], ["a", 2], ["c", 2], ["d", 4]]);
    expect(Object.keys(ranked[0])).toEqual(["entry", "rank"]);
  });
});

describe("maturity", () => {
  it("reads age from the birth month", () => {
    expect(ageInYears("2014-02", new Date("2026-10-07T12:00:00Z"))).toBe(12);
    expect(decimalAge("2014-10", new Date("2026-10-15T00:00:00Z"))).toBeCloseTo(12, 2);
  });

  it("uses Moore 2015: height for girls, sitting height for boys", () => {
    // 12-year-old girl, 152 cm: right at PHV.
    expect(maturityOffset({ sex: "F", ageYears: 12, heightCm: 152, sittingHeightCm: null })).toBeCloseTo(0, 1);
    expect(maturityOffset({ sex: "M", ageYears: 14, heightCm: 165, sittingHeightCm: 82 })).toBeCloseTo(-0.05, 1);
    expect(maturityOffset({ sex: "M", ageYears: 14, heightCm: 165, sittingHeightCm: null })).toBeNull();
  });

  it("reads the age class from the birth year, not the birthday", () => {
    expect(ageClass("2012-12", new Date("2026-01-10T12:00:00Z"))).toBe(14);
    expect(ageInYears("2012-12", new Date("2026-01-10T12:00:00Z"))).toBe(13);
  });

  it("calls a year either side of PHV circa", () => {
    expect([-1.5, -1, 0, 1, 1.2].map(phvStatus)).toEqual(["pre", "circa", "circa", "circa", "post"]);
  });
});

describe("small helpers", () => {
  it("measures the change-of-direction deficit", () => {
    expect(codDeficit(2.55, 1.78)).toBe(0.77);
    expect(codDeficit(0, 1.78)).toBeNull();
  });

  it("admits athletes from the year they turn 14", () => {
    expect(meetsMinimumAge("2012-12", new Date("2026-01-10T12:00:00Z"))).toBe(true);
    expect(meetsMinimumAge("2013-01", new Date("2026-12-31T12:00:00Z"))).toBe(false);
  });

  it("minimizes names like Grep does", () => {
    expect(minimizeAthleteName("  Ida  Marie Kristiansen ")).toBe("Ida K.");
    expect(minimizeAthleteName("Ida")).toBe("Ida");
  });
});
