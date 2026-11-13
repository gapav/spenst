import { describe, expect, it } from "vitest";
import { addDays, dayNumber, overlapsOnLevel, seasonEndsOn, type Period } from "../season";
import { handball2ndDivision202627 as template } from "./handball-2nd-division-2026-27";

const { season, phases, weekNotes } = template;
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
    expect(weekNotes.find((note) => note.weekStart === "2026-10-26")?.label).toBe("2 away: Sat Haslum IL 15:00 · Sun Nordstrand 2 12:00");
    expect(weekNotes.find((note) => note.weekStart === "2027-03-01")?.label).toBe("2 matches: Wed A Gneist 19:00 · Sun H Nordstrand 2 14:00");
    expect(weekNotes).toHaveLength(42);
  });
});
