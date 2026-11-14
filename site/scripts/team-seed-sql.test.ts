import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { seniorTestDiv2202627 as seed } from "../lib/season-templates/senior-test-div-2-2026-27";
import { dataDir } from "./season-template-sql.mts";
import { teamSeedSql, teamSeeds } from "./team-seed-sql.mts";

describe("teamSeedSql", () => {
  const sql = teamSeedSql(seed, "seed.sql");

  it("runs in one transaction and refuses a team that exists already", () => {
    expect(sql).toMatch(/^begin;$/m);
    expect(sql).toMatch(/^commit;$/m);
    expect(sql).toContain("exists already; this script only creates it.");
  });

  it("copies phases, week notes, matches and throughline from the source season rather than writing them", () => {
    expect(sql).toContain("from public.periods phase where phase.season_id = source_season and phase.level = 'phase'");
    expect(sql).toContain("from public.week_notes note where note.season_id = source_season");
    expect(sql).toContain("from public.matches match");
    expect(sql).toContain("source.throughline");
  });

  it("writes every athlete, result and session, and never deletes or updates", () => {
    for (const athlete of seed.athletes) expect(sql).toContain(athlete.id);
    expect(sql.match(/::public\.session_status/g)).toHaveLength(seed.sessions.length);
    expect(sql.match(/::public\.result_side/g)).toHaveLength(seed.testDays.reduce((sum, day) => sum + day.results.length, 0));
    expect(sql).not.toMatch(/^\s*(delete|update|truncate)\b/im);
  });

  it("refuses a name with a line break", () => {
    expect(() => teamSeedSql({ ...seed, teamName: "A\nB" }, "seed.sql")).toThrow();
  });
});

describe("checked-in team seed scripts", () => {
  it.each(teamSeeds)("$fileName matches its template", ({ fileName, seed: template }) => {
    expect(readFileSync(path.join(dataDir, fileName), "utf8")).toBe(teamSeedSql(template, fileName));
  });
});
