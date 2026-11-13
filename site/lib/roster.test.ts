import { describe, expect, it } from "vitest";
import { cleanNewAthlete, latestBirthMonth, type NewAthleteInput } from "./roster";

const asOf = new Date(2026, 10, 13);
const input: NewAthleteInput = { name: "Ida Marie Kristiansen", birthMonth: "2010-04", sex: "F", position: null, measurementConsent: false };

describe("cleanNewAthlete", () => {
  it("minimizes the name to “Firstname L.”", () => {
    expect(cleanNewAthlete(input, asOf)).toMatchObject({ name: "Ida K.", birthMonth: "2010-04", sex: "F" });
  });

  it("accepts the whole year an athlete turns 14, and refuses the year after", () => {
    expect(cleanNewAthlete({ ...input, birthMonth: "2012-12" }, asOf)).toMatchObject({ name: "Ida K." });
    expect(cleanNewAthlete({ ...input, birthMonth: "2013-01" }, asOf)).toEqual({ problem: "Spenst is for athletes from the year they turn 14." });
  });

  it("asks for a name, a birth month and a sex", () => {
    expect(cleanNewAthlete({ ...input, name: "  " }, asOf)).toHaveProperty("problem");
    expect(cleanNewAthlete({ ...input, birthMonth: "" }, asOf)).toHaveProperty("problem");
    expect(cleanNewAthlete({ ...input, birthMonth: "2010-13" }, asOf)).toHaveProperty("problem");
    expect(cleanNewAthlete({ ...input, sex: null }, asOf)).toHaveProperty("problem");
  });

  it("keeps a single name as it is", () => {
    expect(cleanNewAthlete({ ...input, name: "Ida" }, asOf)).toMatchObject({ name: "Ida" });
  });
});

describe("latestBirthMonth", () => {
  it("is December of the year an athlete turns 14", () => {
    expect(latestBirthMonth(asOf)).toBe("2012-12");
  });
});
