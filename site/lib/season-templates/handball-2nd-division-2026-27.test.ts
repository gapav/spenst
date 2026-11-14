import { describe, expect, it } from "vitest";
import { isCongestedWeek, matchDayLabel } from "../match-days";
import { addDays, dayNumber, mondayOf, overlapsOnLevel, seasonEndsOn, type Period } from "../season";
import type { Match } from "../types";
import { handball2ndDivision202627 as template } from "./handball-2nd-division-2026-27";

const { season, phases, weekNotes, matches, retiredWeekNotes } = template;
const asMatches: Match[] = matches.map((match, index) => ({ ...match, id: `match-${index}`, teamId: "team" }));
const seasonEnd = seasonEndsOn(season);
const isMonday = (dateKey: string) => new Date(`${dateKey}T00:00:00Z`).getUTCDay() === 1;
const inSeason = (dateKey: string) => dayNumber(dateKey) >= dayNumber(season.startsOn) && dayNumber(dateKey) <= dayNumber(seasonEnd);
const asPeriods: Period[] = phases.map((phase, index) => ({ ...phase, id: `phase-${index}`, seasonId: "season" }));

describe("handball 2. divisjon 2026/27 template", () => {
  it("targets Test Team’s Season 2026/27, from Mon 3 Aug 2026 for 52 weeks", () => {
    expect(template.teamName).toBe("Test Team");
    expect(season).toMatchObject({ title: "Season 2026/27", startsOn: "2026-08-03", weeks: 52 });
    expect(seasonEnd).toBe("2027-08-01");
  });

  it("has 13 phases, all at phase level, of kind training, competition or break, with no emphasis", () => {
    expect(phases).toHaveLength(13);
    for (const phase of phases) {
      expect(phase.level).toBe("phase");
      expect(["training", "competition", "break"]).toContain(phase.kind);
      expect(phase.emphasis).toBeNull();
    }
  });

  it("covers the season exactly: starts on 2026-08-03, lasts 52 weeks in total, with no gaps", () => {
    expect(phases[0].startsOn).toBe(season.startsOn);
    expect(phases.reduce((sum, phase) => sum + phase.weeks, 0)).toBe(season.weeks);
    phases.slice(1).forEach((phase, index) => {
      const previous = phases[index];
      expect(phase.startsOn, phase.title).toBe(addDays(previous.startsOn, previous.weeks * 7));
    });
    const last = phases[phases.length - 1];
    expect(addDays(last.startsOn, last.weeks * 7 - 1)).toBe(seasonEnd);
  });

  it("has no two phases overlapping", () => {
    for (const period of asPeriods) expect(overlapsOnLevel(asPeriods, period), period.title).toBeNull();
  });

  it("starts every phase and every week note on a Monday inside the season", () => {
    for (const dateKey of [...phases.map((phase) => phase.startsOn), ...weekNotes.map((note) => note.weekStart)]) {
      expect(isMonday(dateKey), dateKey).toBe(true);
      expect(inSeason(dateKey), dateKey).toBe(true);
    }
  });

  it("keeps titles to 1–80 and week labels to 1–60 characters, the database limits", () => {
    for (const phase of phases) expect(phase.title.trim().length, phase.title).toBeGreaterThanOrEqual(1);
    for (const phase of phases) expect(phase.title.trim().length, phase.title).toBeLessThanOrEqual(80);
    for (const note of weekNotes) expect(note.label.trim().length, note.weekStart).toBeGreaterThanOrEqual(1);
    for (const note of weekNotes) expect(note.label.trim().length, note.weekStart).toBeLessThanOrEqual(60);
  });

  it("has one week note per week at most", () => {
    expect(new Set(weekNotes.map((note) => note.weekStart)).size).toBe(weekNotes.length);
  });

  it("stores notes as one point per line, without Markdown bullets, and fills in every focus", () => {
    for (const phase of phases) {
      expect(phase.focus.length, phase.title).toBeGreaterThan(0);
      for (const line of phase.notes.split("\n")) {
        expect(line.trim(), phase.title).toBe(line);
        expect(line, phase.title).not.toMatch(/^[-•*]\s/);
        expect(line.length, phase.title).toBeGreaterThan(0);
      }
    }
  });

  it("matches the issue on the spot-checked phases and weeks", () => {
    const autumnII = phases[3];
    expect(autumnII).toMatchObject({ title: "Autumn league II", kind: "competition", startsOn: "2026-10-12", weeks: 10 });
    expect(autumnII.notes.split("\n")[0]).toBe("w44 is an away weekend: Sat 31 Oct at Haslum IL and Sun 1 Nov at Nordstrand 2, with long travel. S&C that week is a minimum dose early in the week. Mon–Tue of w45 are for recovery.");
    const qualification = phases[8];
    expect(qualification).toMatchObject({ title: "Qualification window", kind: "competition", startsOn: "2027-04-12", weeks: 3 });
    expect(qualification.notes.split("\n")).toHaveLength(6);
    expect(weekNotes.find((note) => note.weekStart === "2026-10-26")?.label).toBe("Away weekend");
    expect(weekNotes).toHaveLength(21);
  });
});

describe("the fixture list", () => {
  const weekday = (dateKey: string) => new Date(`${dateKey}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" });

  it("has the 22 league matches, home and away against each of the 11 other teams, inside the season", () => {
    expect(matches).toHaveLength(22);
    const opponents = new Set(matches.map((match) => match.opponent));
    expect(opponents.size).toBe(11);
    for (const opponent of opponents) {
      expect(matches.filter((match) => match.opponent === opponent).map((match) => match.home).sort(), opponent).toEqual([false, true]);
    }
    for (const match of matches) expect(inSeason(match.playedOn), match.playedOn).toBe(true);
  });

  it("puts the spot-checked matches on the right day and time", () => {
    const on = (date: string) => matches.find((match) => match.playedOn === date);
    expect(weekday("2026-08-30")).toBe("Sun");
    expect(on("2026-08-30")).toMatchObject({ opponent: "BSI", home: true, kickOff: "16:00" });
    expect(weekday("2026-10-17")).toBe("Sat");
    expect(on("2026-10-17")).toMatchObject({ opponent: "Ros", home: true, kickOff: "16:00" });
    expect(weekday("2026-11-18")).toBe("Wed");
    expect(on("2026-11-18")).toMatchObject({ opponent: "Gneist", home: true, kickOff: "18:00" });
    expect(weekday("2027-03-03")).toBe("Wed");
    expect(on("2027-03-03")).toMatchObject({ opponent: "Gneist", home: false, kickOff: "19:00" });
    expect(on("2027-04-11")).toMatchObject({ opponent: "Bergensdalen", priority: true });
  });

  it("makes the away weekends and the two-match week congested, and gives the week before a Saturday match its MD labels", () => {
    expect(isCongestedWeek("2026-10-26", asMatches)).toBe(true);
    expect(isCongestedWeek("2027-02-08", asMatches)).toBe(true);
    expect(isCongestedWeek("2027-03-01", asMatches)).toBe(true);
    expect(isCongestedWeek("2026-10-12", asMatches)).toBe(false);
    expect(matchDayLabel("2026-10-15", asMatches)?.label).toBe("MD-2");
  });

  it("retires only notes this template no longer writes, each on a Monday", () => {
    const current = new Set(weekNotes.map((note) => `${note.weekStart}|${note.label}`));
    for (const note of retiredWeekNotes) {
      expect(isMonday(note.weekStart), note.weekStart).toBe(true);
      expect(current.has(`${note.weekStart}|${note.label}`), note.weekStart).toBe(false);
    }
  });

  it("covers every match the old notes named: each retired match note's week has a match", () => {
    for (const note of retiredWeekNotes.filter((entry) => entry.label !== "No match")) {
      expect(matches.some((match) => mondayOf(match.playedOn) === note.weekStart), note.label).toBe(true);
    }
    for (const note of retiredWeekNotes.filter((entry) => entry.label === "No match")) {
      expect(matches.some((match) => mondayOf(match.playedOn) === note.weekStart), note.weekStart).toBe(false);
    }
  });
});
