import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { alternatingIssues, legsOf, cellBoolean, cellDate, cellNumber, defaultDates, exportedAt, importWrites, matchAthletes, measureKey, mergeOvrRows, ovrMeasures, ovrRows, parseOvrExport, planImport, rowChecksum, splitSide, sprintTimes, suggestMapping, type OvrMapping, type OvrSplit } from "./ovr-import";
import { bestAttempt, columnsWithData, exercisesIn, rowsForTest, trendByDate, trendMetrics } from "./ovr-data";
import type { Athlete, TestDay, TestResult } from "./types";
import { demoOvrRows, demoResults } from "./demo-data";
import { columnIndex, readWorkbook, WorkbookError } from "./xlsx";

// The shape OVR Connect writes: three sheets, a shared-string table, and every
// cell — numbers included — stored as a string.
const VELOCITY_HEADERS = ["Athlete", "Sport", "Position", "Group(s)", "Date", "Exercise", "Set #", "Rep #", "Avg Power (W)", "Avg Velocity (m/s)", "Duration (s)", "EA Index", "Load (kg)", "Peak Power (W)", "Peak Velocity (m/s)", "ROM (cm)", "Target Max", "Target Min", "Target Type", "TPV (s)", "Set Note"];
const JUMP_HEADERS = ["Athlete", "Sport", "Position", "Group(s)", "Date", "Exercise", "Set #", "Rep #", "GCT (s)", "Jump Height (cm)", "Jump Type", "RSI", "Set Note"];
const SPRINT_HEADERS = ["Athlete", "Sport", "Position", "Group(s)", "Date", "Exercise", "Sprint #", "Split #", "Distance (m)", "In-Beam Start", "Speed (km/h)", "Split Time (s)", "Total Time (s)", "Trigger Start", "Set Note"];

const rep = (athlete: string, date: string, exercise: string, set: number, repNo: number, avgPower: number, avgVelocity: number, load: number, peakPower: number, peakVelocity: number) =>
  [athlete, "", "", "Test-group", date, exercise, String(set), String(repNo), String(avgPower), String(avgVelocity), "0.4", "16", String(load), String(peakPower), String(peakVelocity), "100", "", "", "off", "0.2", ""];
const split = (athlete: string, date: string, exercise: string, sprint: number, splitNo: number, distance: string, splitTime: number, total: number) =>
  [athlete, "", "", "Test-group", date, exercise, String(sprint), String(splitNo), distance, "No", "", String(splitTime), String(total), "No", ""];

function xlsx(sheets: { name: string; rows: string[][] }[]): Uint8Array {
  const strings: string[] = [];
  const index = (text: string) => { const at = strings.indexOf(text); if (at >= 0) return at; strings.push(text); return strings.length - 1; };
  const column = (n: number) => { let s = ""; n += 1; while (n) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; };
  const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const sheetXml = sheets.map((sheet) => `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheet.rows.map((row, r) => `<row r="${r + 1}">${row.map((cell, c) => cell === "" && r > 0 ? "" : `<c r="${column(c)}${r + 1}" t="s"><v>${index(cell)}</v></c>`).join("")}</row>`).join("")}</sheetData></worksheet>`);
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8("<Types/>"),
    "xl/workbook.xml": strToU8(`<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((sheet, i) => `<sheet sheetId="${i + 1}" name="${sheet.name}" r:id="rId${i + 4}"/>`).join("")}</sheets></workbook>`),
    "xl/_rels/workbook.xml.rels": strToU8(`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 4}" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}</Relationships>`),
  };
  sheetXml.forEach((xml, i) => { files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(xml); });
  files["xl/sharedStrings.xml"] = strToU8(`<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${strings.map((text) => `<si><t>${escape(text)}</t></si>`).join("")}</sst>`);
  return zipSync(files);
}

const sampleSheets = [
  { name: "Velocity", rows: [VELOCITY_HEADERS,
    rep("Test One", "2026-10-07", "Hang Power Clean", 1, 1, 1669, 1.7, 100, 7462, 3.61),
    rep("Test One", "2026-10-07", "Hang Power Clean", 1, 2, 2244, 2.29, 100, 11853, 4.43),
    rep("Test Two", "2026-10-07", "Hang Power Clean", 1, 1, 2799, 2.85, 100, 23163, 5.93),
    // A back squat profile: four loads, two reps at the heaviest.
    rep("Test One", "2026-10-07", "Back Squat", 1, 1, 900, 1.1, 40, 1200, 1.5),
    rep("Test One", "2026-10-07", "Back Squat", 2, 1, 1000, 0.9, 60, 1300, 1.3),
    rep("Test One", "2026-10-07", "Back Squat", 3, 1, 1050, 0.7, 80, 1400, 1.1),
    rep("Test One", "2026-10-07", "Back Squat", 4, 1, 1000, 0.48, 100, 1300, 0.8),
    rep("Test One", "2026-10-07", "Back Squat", 4, 2, 1010, 0.5, 100, 1310, 0.82),
    // A training day: one load, a spot check.
    rep("Test One", "2026-10-14", "Back Squat", 1, 1, 1000, 0.72, 80, 1300, 1.1),
  ] },
  { name: "Jump", rows: [JUMP_HEADERS] },
  { name: "Sprint", rows: [SPRINT_HEADERS,
    split("Test One", "2026-10-07", "1.09yd Lead-in + 10.94yd", 1, 1, "10", 2.099, 2.099),
    split("Test One", "2026-10-07", "1.09yd Lead-in + 10.94yd", 2, 1, "10", 2.059, 2.059),
    split("Someone Else", "2026-06-14", "1.09yd Lead-in + 10.94yd", 1, 1, "10", 2.3, 2.3),
    split("Test Two", "2026-10-07", "5-10-5 (Pro Agility)", 1, 1, "", 5.1, 5.1),
    split("Test Two", "2026-10-07", "5-10-5 (Pro Agility)", 2, 1, "", 4.9, 4.9),
  ] },
];

const roster: Athlete[] = [
  { id: "a1", displayName: "Test O.", birthMonth: "2008-01-01", sex: "male", position: null, teamIds: ["t"], measurementConsent: true } as unknown as Athlete,
  { id: "a2", displayName: "Test T.", birthMonth: "2008-01-01", sex: "male", position: null, teamIds: ["t"], measurementConsent: true } as unknown as Athlete,
];

describe("readWorkbook", () => {
  it("reads every sheet as rows of text, shared strings resolved", () => {
    const sheets = readWorkbook(xlsx(sampleSheets));
    expect(sheets.map((sheet) => sheet.name)).toEqual(["Velocity", "Jump", "Sprint"]);
    expect(sheets[0].rows[0][9]).toBe("Avg Velocity (m/s)");
    expect(sheets[0].rows[1].slice(0, 9)).toEqual(["Test One", "", "", "Test-group", "2026-10-07", "Hang Power Clean", "1", "1", "1669"]);
    expect(sheets[1].rows).toHaveLength(1);
  });

  it("keeps column positions when cells are left out", () => {
    const sheets = readWorkbook(xlsx([{ name: "Sprint", rows: [SPRINT_HEADERS, split("A B", "2026-01-01", "X", 1, 1, "", 5, 5)] }]));
    expect(sheets[0].rows[1][8]).toBe("");
    expect(sheets[0].rows[1][12]).toBe("5");
  });

  it("refuses something that is not a workbook", () => {
    expect(() => readWorkbook(strToU8("Athlete,Date\n"))).toThrow(WorkbookError);
  });

  it("turns cell references into columns", () => {
    expect([columnIndex("A1"), columnIndex("Z9"), columnIndex("AA10"), columnIndex("AB2")]).toEqual([0, 25, 26, 27]);
  });
});

describe("cells", () => {
  it("reads numbers written as text, with a decimal comma too", () => {
    expect([cellNumber("1.7"), cellNumber("2,5"), cellNumber(""), cellNumber("off"), cellNumber(" 100 ")]).toEqual([1.7, 2.5, null, null, 100]);
  });
  it("reads ISO, dotted and Excel serial dates, and refuses nonsense", () => {
    expect([cellDate("2026-10-07"), cellDate("2026-10-07 18:28"), cellDate("07.10.2026"), cellDate("46302"), cellDate("2026-02-30"), cellDate("soon")])
      .toEqual(["2026-10-07", "2026-10-07", "2026-10-07", "2026-10-07", null, null]);
  });
  it("reads when the export was made from its file name", () => {
    expect(exportedAt("exported_athlete_data_2026-10-07_18-28-37.xlsx")).toEqual({ date: "2026-10-07", time: "18:28" });
  });
});

describe("parseOvrExport", () => {
  const data = parseOvrExport(readWorkbook(xlsx(sampleSheets)));

  it("finds the three sheets by their columns", () => {
    expect(data.velocity).toHaveLength(9);
    expect(data.jump).toHaveLength(0);
    expect(data.sprint).toHaveLength(5);
    expect(data.velocity[0]).toMatchObject({ athlete: "Test One", date: "2026-10-07", exercise: "Hang Power Clean", loadKg: 100, meanVelocity: 1.7, peakPower: 7462 });
  });

  it("does not depend on column order", () => {
    const shuffled = [{ name: "Anything", rows: [["Date", "Peak Velocity (m/s)", "Exercise", "Athlete", "Load (kg)", "Avg Velocity (m/s)"], ["2026-10-07", "1.2", "Back Squat", "Test One", "60", "0.9"]] }];
    expect(parseOvrExport(shuffled).velocity[0]).toMatchObject({ athlete: "Test One", loadKg: 60, meanVelocity: 0.9, peakVelocity: 1.2 });
  });

  it("skips rows it cannot place and refuses files that are not OVR exports", () => {
    const withBlank = [{ name: "Sprint", rows: [SPRINT_HEADERS, split("", "2026-10-07", "X", 1, 1, "10", 2, 2), split("A B", "not a date", "X", 1, 1, "10", 2, 2)] }];
    expect(parseOvrExport(withBlank).skippedRows).toBe(2);
    expect(() => parseOvrExport([{ name: "Sheet1", rows: [["Name", "Score"]] }])).toThrow(/OVR export/);
  });
});

const splitRow = (fields: Partial<OvrSplit>): OvrSplit => ({ athlete: "A B", groups: "", date: "2026-10-07", exercise: "X", sport: "", position: "", note: "", extra: {}, sprint: 1, split: 1, distanceM: null, splitTime: null, totalTime: null, speedKmh: null, inBeamStart: null, triggerStart: null, ...fields });

describe("sprintTimes", () => {
  it("takes the time at each gate, at the distance covered so far", () => {
    const times = sprintTimes([
      splitRow({ exercise: "0-5-10", split: 2, distanceM: 5, splitTime: 0.7, totalTime: 1.75 }),
      splitRow({ exercise: "0-5-10", split: 1, distanceM: 5, splitTime: 1.05, totalTime: 1.05 }),
    ]);
    expect(times.map((time) => [time.distanceM, time.time])).toEqual([[5, 1.05], [10, 1.75]]);
  });
  it("gives a run without distances one time: the whole run", () => {
    const times = sprintTimes([splitRow({ exercise: "5-10-5", splitTime: 4.9, totalTime: 4.9 })]);
    expect(times).toEqual([expect.objectContaining({ distanceM: null, time: 4.9 })]);
  });
});

describe("mapping exercises", () => {
  const data = parseOvrExport(readWorkbook(xlsx(sampleSheets)));
  const measures = ovrMeasures(data);
  const suggest = (key: string) => suggestMapping(measures.find((measure) => measure.key === key)!);

  it("lists what the file measures", () => {
    expect(measures.map((measure) => measure.key)).toEqual(["sprint|1.09yd lead-in + 10.94yd|10", "sprint|5-10-5 (pro agility)", "velocity|back squat", "velocity|hang power clean"]);
  });

  it("suggests the test or lift each one feeds", () => {
    expect(suggest("velocity|hang power clean")).toMatchObject({ testKey: "hang_clean" });
    // A training lift feeds no test; its reps are still kept as OVR rows.
    expect(suggest("velocity|back squat")).toMatchObject({ testKey: null });
    expect(suggest("sprint|1.09yd lead-in + 10.94yd|10")).toMatchObject({ testKey: "sprint_10m" });
    // Pro agility is not the 505, so nothing is guessed.
    expect(suggest("sprint|5-10-5 (pro agility)")).toMatchObject({ testKey: null });
  });

  it("reads a side off the exercise name for one-leg tests", () => {
    expect(splitSide("Split Squat Jump - L")).toEqual({ name: "split squat jump", side: "left" });
    expect(splitSide("Split squat jump høyre")).toEqual({ name: "split squat jump", side: "right" });
    expect(splitSide("Back Squat")).toEqual({ name: "back squat", side: null });
  });

  it("prefers what the coach chose before", () => {
    const saved: OvrMapping = { key: "sprint|5-10-5 (pro agility)", testKey: "cod_505", side: null };
    expect(suggestMapping(measures[1], saved)).toBe(saved);
  });
});

describe("matchAthletes", () => {
  const data = parseOvrExport(readWorkbook(xlsx(sampleSheets)));

  it("matches full names to the minimised roster", () => {
    const matches = matchAthletes(data, roster);
    expect(matches.find((match) => match.name === "Test One")).toMatchObject({ athleteId: "a1", how: "name" });
    expect(matches.find((match) => match.name === "Test Two")).toMatchObject({ athleteId: "a2", how: "name" });
    expect(matches.find((match) => match.name === "Someone Else")).toMatchObject({ athleteId: null, candidates: [] });
  });

  it("does not guess between two athletes with the same name and initial", () => {
    const twins = [...roster, { ...roster[0], id: "a3" }];
    expect(matchAthletes(data, twins).find((match) => match.name === "Test One")).toMatchObject({ athleteId: null, candidates: ["a1", "a3"] });
  });

  it("remembers a match the coach made", () => {
    expect(matchAthletes(data, roster, { "Someone Else": "a2" }).find((match) => match.name === "Someone Else")).toMatchObject({ athleteId: "a2", how: "remembered" });
  });
});

describe("planImport", () => {
  const data = parseOvrExport(readWorkbook(xlsx(sampleSheets)));
  const measures = ovrMeasures(data);
  const mappings = new Map(measures.map((measure) => [measure.key, suggestMapping(measure)]));
  const matches = new Map(matchAthletes(data, roster).map((match) => [match.name, match.athleteId]));
  const base = { data, mappings, matches, teamId: "t", testDays: [] as TestDay[], results: [] as TestResult[] };

  it("keeps the best attempt per athlete and test: highest power, fastest time", () => {
    const plan = planImport(base);
    const day = plan.dates.find((entry) => entry.date === "2026-10-07")!;
    expect(day.results.find((result) => result.athleteId === "a1" && result.testKey === "hang_clean")?.value).toBe(11853);
    expect(day.results.find((result) => result.athleteId === "a2" && result.testKey === "hang_clean")?.value).toBe(23163);
    expect(day.results.find((result) => result.athleteId === "a1" && result.testKey === "sprint_10m")?.value).toBe(2.059);
    expect(day.testDayId).toBeNull();
  });

  it("counts rows whose athlete is not on the team instead of importing them", () => {
    expect(planImport(base).unmatchedRows).toBe(1);
  });

  it("compares with what Spenst has: same, differs, new", () => {
    const testDays: TestDay[] = [{ id: "d1", teamId: "t", heldOn: "2026-10-07", title: "Test day", notes: "" }];
    const results: TestResult[] = [
      { id: "r1", testDayId: "d1", athleteId: "a1", testKey: "hang_clean", side: null, value: 11853 },
      { id: "r2", testDayId: "d1", athleteId: "a2", testKey: "hang_clean", side: null, value: 2000 },
    ];
    const plan = planImport({ ...base, testDays, results });
    const day = plan.dates.find((entry) => entry.date === "2026-10-07")!;
    expect(day.testDayId).toBe("d1");
    expect(day.results.find((result) => result.athleteId === "a1" && result.testKey === "hang_clean")?.status).toBe("same");
    expect(day.results.find((result) => result.athleteId === "a2" && result.testKey === "hang_clean")).toMatchObject({ status: "differs", existing: 2000 });
    // The 14th was training only: nothing there for a test day.
    expect(plan.dates.map((entry) => entry.date)).toEqual(["2026-10-07"]);
    expect([...defaultDates(plan)]).toEqual(["2026-10-07"]);
  });

  it("writes only what is new unless told to replace, and makes test days where needed", () => {
    const testDays: TestDay[] = [{ id: "d1", teamId: "t", heldOn: "2026-10-07", title: "Test day", notes: "" }];
    const results: TestResult[] = [{ id: "r2", testDayId: "d1", athleteId: "a2", testKey: "hang_clean", side: null, value: 2000 }];
    const plan = planImport({ ...base, testDays, results });
    const keep = importWrites(plan, { dates: new Set(["2026-10-07"]), replaceDiffering: false });
    expect(keep.newTestDays).toEqual([]);
    expect(keep.results.some((result) => result.athleteId === "a2" && result.testKey === "hang_clean")).toBe(false);
    expect(keep.results.every((result) => result.testDayId === "d1")).toBe(true);
    const replace = importWrites(plan, { dates: new Set(["2026-10-07"]), replaceDiffering: true });
    expect(replace.results.some((result) => result.athleteId === "a2" && result.value === 23163)).toBe(true);
    const fresh = importWrites(planImport(base), { dates: new Set(["2026-10-07", "2026-10-14"]), replaceDiffering: false });
    expect(fresh.newTestDays).toEqual(["2026-10-07"]);
  });

  it("is a no-op for a file already imported", () => {
    const first = planImport(base);
    const written = importWrites(first, { dates: defaultDates(first), replaceDiffering: false });
    const testDays: TestDay[] = written.newTestDays.map((date, index) => ({ id: `d${index}`, teamId: "t", heldOn: date, title: "OVR", notes: "" }));
    const results: TestResult[] = written.results.map((result, index) => ({ id: `r${index}`, testDayId: testDays.find((day) => day.heldOn === result.date)!.id, athleteId: result.athleteId, testKey: result.testKey, side: result.side, value: result.value }));
    const again = planImport({ ...base, testDays, results });
    expect(defaultDates(again).size).toBe(0);
    expect(measureKey("sprint", " 505 ", 10)).toBe("sprint|505|10");
  });
});

describe("every column, every row", () => {
  const data = parseOvrExport(readWorkbook(xlsx(sampleSheets)));
  const matches = new Map(matchAthletes(data, roster).map((match) => [match.name, match.athleteId]));

  it("reads every column OVR writes", () => {
    expect(data.velocity[0]).toMatchObject({ durationS: 0.4, eaIndex: 16, romCm: 100, tpvS: 0.2, targetType: "off", targetMin: null, meanPower: 1669, groups: "Test-group" });
    expect(data.sprint[0]).toMatchObject({ inBeamStart: false, triggerStart: false, splitTime: 2.099 });
    expect([cellBoolean("Yes"), cellBoolean("No"), cellBoolean(""), cellBoolean("maybe")]).toEqual([true, false, null, null]);
  });

  it("keeps columns it does not know, so nothing in the file is lost", () => {
    const sheets = [{ name: "Velocity", rows: [[...VELOCITY_HEADERS, "Bar Path (cm)"], [...rep("Test One", "2026-10-07", "Back Squat", 1, 1, 900, 1.1, 40, 1200, 1.5), "3.2"]] }];
    const parsed = parseOvrExport(sheets);
    expect(parsed.velocity[0].extra).toEqual({ "Bar Path (cm)": "3.2" });
    expect(ovrRows(parsed, matches)[0].extra).toEqual({ "Bar Path (cm)": "3.2" });
  });

  it("keeps every row of matched athletes, and none of the others", () => {
    const rows = ovrRows(data, matches);
    expect(rows).toHaveLength(9 + 4);
    expect(rows.some((row) => row.sheet === "sprint" && row.exercise === "5-10-5 (Pro Agility)")).toBe(true);
    expect(rows.every((row) => row.athleteId === "a1" || row.athleteId === "a2")).toBe(true);
  });

  it("keys a row by where it sits in OVR, counting repeats", () => {
    const rows = ovrRows(data, matches);
    expect(rows.find((row) => row.sheet === "velocity")?.rowKey).toBe("velocity|2026-10-07|hang power clean|1|1#0");
    const twice = parseOvrExport([{ name: "Velocity", rows: [VELOCITY_HEADERS, rep("Test One", "2026-10-07", "Back Squat", 1, 1, 900, 1.1, 40, 1200, 1.5), rep("Test One", "2026-10-07", "Back Squat", 1, 1, 950, 1.0, 40, 1250, 1.4)] }]);
    expect(ovrRows(twice, matches).map((row) => row.rowKey)).toEqual(["velocity|2026-10-07|back squat|1|1#0", "velocity|2026-10-07|back squat|1|1#1"]);
  });

  it("gives the same row the same checksum, and a corrected row a new one", () => {
    const again = ovrRows(parseOvrExport(readWorkbook(xlsx(sampleSheets))), matches);
    const first = ovrRows(data, matches);
    expect(again.map((row) => row.checksum)).toEqual(first.map((row) => row.checksum));
    const edited = sampleSheets.map((sheet) => sheet.name === "Velocity" ? { ...sheet, rows: sheet.rows.map((row, index) => index === 1 ? row.map((cell, column) => column === 12 ? "102.5" : cell) : row) } : sheet);
    const changed = ovrRows(parseOvrExport(edited), matches);
    expect(changed[0].rowKey).toBe(first[0].rowKey);
    expect(changed[0].checksum).not.toBe(first[0].checksum);
    expect(rowChecksum("a")).toMatch(/^[0-9a-f]{14}$/);
  });

  it("merges like the database: adds new, updates changed, leaves the rest alone", () => {
    let n = 0;
    const id = () => `row-${n++}`;
    const first = mergeOvrRows([], ovrRows(data, matches), "import-1", id);
    expect(first).toMatchObject({ added: 13, changed: 0 });
    const same = mergeOvrRows(first.rows, ovrRows(data, matches), "import-2", id);
    expect(same).toMatchObject({ added: 0, changed: 0 });
    expect(same.rows.every((row) => row.importId === "import-1")).toBe(true);
    const edited = sampleSheets.map((sheet) => sheet.name === "Velocity" ? { ...sheet, rows: [...sheet.rows, rep("Test Two", "2026-10-21", "Back Squat", 1, 1, 900, 0.8, 90, 1200, 1.1)].map((row, index) => index === 1 ? row.map((cell, column) => column === 12 ? "102.5" : cell) : row) } : sheet);
    const next = mergeOvrRows(first.rows, ovrRows(parseOvrExport(edited), matches), "import-3", id);
    expect(next).toMatchObject({ added: 1, changed: 1 });
    expect(next.rows).toHaveLength(14);
  });
});

describe("reading stored rows", () => {
  const data = parseOvrExport(readWorkbook(xlsx(sampleSheets)));
  const rows = ovrRows(data, new Map(matchAthletes(data, roster).map((match) => [match.name, match.athleteId]))).filter((row) => row.athleteId === "a1");

  it("groups by exercise, most recent first", () => {
    expect(exercisesIn(rows).map((group) => [group.exercise, group.days])).toEqual([["Back Squat", 2], ["1.09yd Lead-in + 10.94yd", 1], ["Hang Power Clean", 1]]);
  });

  it("shows only columns that have data, and offers trends that do", () => {
    const squat = exercisesIn(rows)[0].rows;
    const { columns } = columnsWithData(squat);
    expect(columns.map((column) => column.key)).toContain("meanVelocity");
    expect(columns.map((column) => column.key)).not.toContain("jumpHeightCm");
    expect(columns.map((column) => column.key)).not.toContain("targetMin");
    expect(trendMetrics(squat).map((metric) => metric.key)).toEqual(["peakPower", "meanPower", "meanVelocity", "peakVelocity", "loadKg"]);
  });

  it("draws the best of each day, the right way round", () => {
    const squat = exercisesIn(rows)[0].rows;
    expect(trendByDate(squat, { key: "loadKg", label: "", unit: "kg", best: "max" })).toEqual([{ date: "2026-10-07", value: 100 }, { date: "2026-10-14", value: 80 }]);
    const sprint = exercisesIn(rows)[1].rows;
    expect(trendByDate(sprint, { key: "totalTimeS", label: "", unit: "s", best: "min" })).toEqual([{ date: "2026-10-07", value: 2.059 }]);
  });
});

describe("demo OVR history", () => {
  it("agrees with the demo test results: best rep and fastest splits are the recorded values", () => {
    const martin = demoOvrRows.filter((row) => row.athleteId === "a-martin");
    const result = (dayId: string, key: string) => demoResults.find((entry) => entry.testDayId === dayId && entry.athleteId === "a-martin" && entry.testKey === key)?.value;
    const clean = trendByDate(martin.filter((row) => row.exercise === "Hang Power Clean"), { key: "peakPower", label: "", unit: "W", best: "max" });
    expect(clean[0]).toEqual({ date: "2026-08-20", value: Math.round(result("day-sen-aug", "hang_clean") as number) });
    const sprint = trendByDate(martin.filter((row) => row.sheet === "sprint"), { key: "totalTimeS", label: "", unit: "s", best: "min" });
    expect(sprint.map((point) => point.value)).toEqual([result("day-sen-aug", "sprint_10m"), result("day-sen-oct", "sprint_10m")].map((value) => Math.round((value as number) * 1000) / 1000));
  });

  it("has squats that get faster week to week and heavier once the bar goes up", () => {
    const squat = demoOvrRows.filter((row) => row.athleteId === "a-martin" && row.exercise === "Back Squat");
    const loads = trendByDate(squat, { key: "loadKg", label: "", unit: "kg", best: "max" });
    expect(loads[0].value).toBeLessThan(loads.at(-1)!.value);
    expect(new Set(demoOvrRows.map((row) => `${row.athleteId}|${row.rowKey}`)).size).toBe(demoOvrRows.length);
  });
});

describe("the rows behind a test result", () => {
  const martin = demoOvrRows.filter((row) => row.athleteId === "a-martin" && row.performedOn === "2026-08-20");
  const mappingFor = (key: string) => key === "velocity|hang power clean" ? { key, testKey: "hang_clean" as const, side: null }
    : key === "sprint|1.09yd lead-in + 5.47yd + 5.47yd|5" ? { key, testKey: "sprint_5m" as const, side: null }
    : key === "sprint|1.09yd lead-in + 5.47yd + 5.47yd|10" ? { key, testKey: "sprint_10m" as const, side: null } : null;

  it("finds the reps of the mapped exercise, and whole runs for a sprint distance", () => {
    expect(rowsForTest(martin, "hang_clean", mappingFor)).toHaveLength(6);
    expect(rowsForTest(martin, "sprint_5m", mappingFor)).toHaveLength(6);
    expect(rowsForTest(martin, "push_press", mappingFor)).toHaveLength(0);
  });

  it("sums up the best attempt the way the test is scored", () => {
    const clean = bestAttempt(rowsForTest(martin, "hang_clean", mappingFor))!;
    expect(clean.rows).toHaveLength(1);
    expect(clean.summary).toMatch(/^60\.0 kg · [\d,]+ W peak · [\d,]+ W mean · [\d.]+ m\/s peak · [\d.]+ m\/s mean · ROM/);
    expect(clean.outOf).toBe("best of 6 reps");
    const sprint = bestAttempt(rowsForTest(martin, "sprint_10m", mappingFor))!;
    expect(sprint.rows).toHaveLength(2);
    expect(sprint.summary).toMatch(/^5 m [\d.]+ s · 10 m [\d.]+ s · top [\d.]+ km\/h$/);
    expect(sprint.outOf).toBe("best of 3 runs");
  });
});

describe("alternating legs", () => {
  const set = (athlete: string, reps: number, setNo = 1) => Array.from({ length: reps }, (_, i) => rep(athlete, "2026-10-07", "Split Squat Jump", setNo, i + 1, 900, 1.2, 20, 2000 + i * 10, 2.2));
  const sheet = (rows: string[][]) => parseOvrExport([{ name: "Velocity", rows: [VELOCITY_HEADERS, ...rows] }]);

  it("suggests alternating, left foot first, for a one-leg test with no leg in its name", () => {
    const data = sheet(set("Test One", 8));
    expect(suggestMapping(ovrMeasures(data)[0])).toMatchObject({ testKey: "split_squat_jump", side: null, firstLeg: "left" });
  });

  it("gives reps 1, 3, 5, 7 to the starting leg and 2, 4, 6, 8 to the other, set by set", () => {
    const data = sheet([...set("Test One", 8, 1), ...set("Test One", 8, 2)]);
    const mappings = new Map([["velocity|split squat jump", { key: "velocity|split squat jump", testKey: "split_squat_jump" as const, side: null, firstLeg: "left" as const }]]);
    const legs = legsOf(data.velocity, mappings);
    expect(data.velocity.slice(0, 8).map((row) => legs.get(row))).toEqual(["left", "right", "left", "right", "left", "right", "left", "right"]);
    expect(legs.get(data.velocity[8])).toBe("left");
    const rightFirst = legsOf(data.velocity, new Map([["velocity|split squat jump", { ...mappings.get("velocity|split squat jump")!, firstLeg: "right" as const }]]));
    expect(rightFirst.get(data.velocity[0])).toBe("right");
  });

  it("feeds each leg's best rep to the result, and stores the leg on every row", () => {
    const data = sheet(set("Test One", 8));
    const mappings = new Map([["velocity|split squat jump", { key: "velocity|split squat jump", testKey: "split_squat_jump" as const, side: null, firstLeg: "left" as const }]]);
    const matches = new Map([["Test One", "a1"]]);
    const plan = planImport({ data, mappings, matches, teamId: "t", testDays: [], results: [] });
    const results = plan.dates[0].results.map((result) => [result.side, result.value]);
    expect(results).toEqual(expect.arrayContaining([["left", 2060], ["right", 2070]]));
    expect(ovrRows(data, matches, legsOf(data.velocity, mappings)).map((row) => row.side)).toEqual(["left", "right", "left", "right", "left", "right", "left", "right"]);
  });

  it("flags a set without eight reps: one missed rep swaps the legs after it", () => {
    const data = sheet([...set("Test One", 8, 1), ...set("Test One", 7, 2)]);
    const mappings = new Map([["velocity|split squat jump", { key: "velocity|split squat jump", testKey: "split_squat_jump" as const, side: null, firstLeg: "left" as const }]]);
    expect(alternatingIssues(data.velocity, mappings)).toEqual([{ athlete: "Test One", date: "2026-10-07", exercise: "Split Squat Jump", set: 2, reps: 7 }]);
  });
});
