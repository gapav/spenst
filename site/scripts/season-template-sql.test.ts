import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { SeasonTemplate } from "../lib/season-templates/handball-2nd-division-2026-27";
import { dataDir, dataScripts, seasonTemplateSql, sqlText } from "./season-template-sql.mts";

const tiny: SeasonTemplate = {
  teamName: "O’Brien's team",
  season: { title: "Season 2026/27", startsOn: "2026-08-03", weeks: 52, throughline: "Sprint 'n' jump · ≥ 90 %" },
  phases: [{ level: "phase", kind: "training", title: "It's “all”", startsOn: "2026-08-03", weeks: 52, emphasis: null, focus: "Focus's", notes: "One's\nTwo" }],
  weekNotes: [{ weekStart: "2026-08-03", label: "Don't · 100 %" }],
};

describe("sqlText", () => {
  it("doubles single quotes and leaves everything else as it is", () => {
    expect(sqlText("O'Brien’s “team” · 80 % \\n")).toBe("'O''Brien’s “team” · 80 % \\n'");
  });

  it("refuses a NUL byte and the DO block’s closing tag", () => {
    expect(() => sqlText("a\0b")).toThrow();
    expect(() => sqlText("a $script$ b")).toThrow();
  });
});

describe("seasonTemplateSql", () => {
  const sql = seasonTemplateSql(tiny, "tiny.sql");

  it("runs in one transaction", () => {
    expect(sql).toMatch(/^begin;$/m);
    expect(sql.trimEnd().endsWith("commit;")).toBe(true);
  });

  it("finds the season by team name and title, and raises unless exactly one matches with the right start and length", () => {
    expect(sql).toContain("where team.name = 'O’Brien''s team' and season.title = 'Season 2026/27'");
    expect(sql).toContain("select count(*) into matches from public.teams team where team.name = 'O’Brien''s team';");
    expect(sql).toContain("if matches <> 1 then\n    raise exception 'Expected exactly one team");
    expect(sql).toContain("if matches <> 1 then\n    raise exception 'Expected exactly one season");
    expect(sql).toContain("and season.starts_on = date '2026-08-03' and season.weeks = 52;");
    expect(sql).toContain("if target is null then\n    raise exception");
  });

  it("deletes only that season’s phases, in one statement", () => {
    const deletes = sql.match(/^\s*delete .*$/gm) ?? [];
    expect(deletes).toEqual(["  delete from public.periods where season_id = target and level = 'phase';"]);
  });

  it("deletes before it inserts, upserts week notes and sets the throughline", () => {
    expect(sql.indexOf("delete from public.periods")).toBeLessThan(sql.indexOf("insert into public.periods"));
    expect(sql).toContain("on conflict (season_id, week_start) do update set label = excluded.label;");
    expect(sql).toContain("set throughline = 'Sprint ''n'' jump · ≥ 90 %'");
    expect(sql).not.toMatch(/\btruncate\b|\bdrop\b/i);
  });

  it("quotes every piece of text", () => {
    expect(sql).toContain("'It''s “all”'");
    expect(sql).toContain("concat_ws(E'\\n',");
    expect(sql).toContain("'One''s',");
    expect(sql).toContain("'Don''t · 100 %'");
  });
});

describe("seasonTemplateSql refuses", () => {
  it("a line break in a value that goes into the header comments", () => {
    expect(() => seasonTemplateSql({ ...tiny, teamName: "Test\nTeam" }, "tiny.sql")).toThrow();
    expect(() => seasonTemplateSql(tiny, "tiny.sql\ndrop table x;")).toThrow();
  });
});

describe("the committed data scripts", () => {
  it.each(dataScripts)("$fileName is up to date with its template", ({ fileName, template }) => {
    expect(readFileSync(path.join(dataDir, fileName), "utf8")).toBe(seasonTemplateSql(template, fileName));
  });
});
