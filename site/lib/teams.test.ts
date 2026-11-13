import { describe, expect, it } from "vitest";
import { cleanTeamName } from "./teams";

describe("cleanTeamName", () => {
  it("trims and collapses whitespace", () => {
    expect(cleanTeamName("  Senior   men ")).toEqual({ name: "Senior men" });
  });

  it("refuses a name shorter than two characters, counted after trimming", () => {
    expect(cleanTeamName(" A ")).toHaveProperty("problem");
    expect(cleanTeamName("")).toHaveProperty("problem");
    expect(cleanTeamName("U9")).toEqual({ name: "U9" });
  });

  it("refuses a name longer than the column allows", () => {
    expect(cleanTeamName("x".repeat(120))).toEqual({ name: "x".repeat(120) });
    expect(cleanTeamName("x".repeat(121))).toHaveProperty("problem");
  });
});
