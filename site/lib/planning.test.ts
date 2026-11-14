import { describe, expect, it } from "vitest";
import { exerciseIndex } from "./exercise-library";
import { cloneContent, compareSessions, pastePlacements, progressionMatrix, rankCopySources, restOfPeriodWeeks, weekCopyPlacements, weekSummary } from "./planning";
import { allSlots, parseSessionContent, type SessionContent, type SetGroup } from "./training";
import type { TrainingSession } from "./types";

let counter = 0;
const id = () => `new-${(counter += 1)}`;

const group = (count: number, reps: number, load?: number, extra: Partial<SetGroup> = {}): SetGroup =>
  ({ id: `g-${count}-${reps}-${load}`, count, reps: { min: reps, max: reps }, ...(load ? { load: { min: load, max: load, basis: "kg" as const } } : {}), restSeconds: 120, ...extra });

const content = (main: { exerciseId: string; groups: SetGroup[] }[], speed: { exerciseId: string; groups: SetGroup[] }[] = []): SessionContent => ({
  sections: [
    ...(speed.length ? [{ id: "sec-speed", kind: "speed" as const, title: "Speed", slots: speed.map((slot, index) => ({ id: `speed-${index}`, exerciseId: slot.exerciseId, pairedWithPrevious: false, setGroups: slot.groups, autoregulation: null, note: "", variants: [] })) }] : []),
    { id: "sec-main", kind: "main" as const, title: "Main", slots: main.map((slot, index) => ({ id: `main-${index}`, exerciseId: slot.exerciseId, pairedWithPrevious: false, setGroups: slot.groups, autoregulation: null, note: "", variants: [] })) },
  ],
});

const session = (idValue: string, scheduledOn: string | null, slot: TrainingSession["slot"] = null, body: SessionContent = { sections: [] }, title = "Session"): TrainingSession =>
  ({ id: idValue, teamId: "t", scheduledOn, slot, title, status: "draft", content: body });

const squat = "builtin:back_squat";
const deadlift = "builtin:trap_bar_deadlift";
const boxJump = "builtin:box_jump";

describe("cloneContent", () => {
  const original: SessionContent = {
    sections: [{
      id: "s1", kind: "main", title: "Main",
      slots: [{
        id: "slot1", exerciseId: squat, pairedWithPrevious: false, autoregulation: { target: 0.9, bumpAbove: 1.05, bumpKg: 10 }, note: "Fast",
        setGroups: [group(3, 5, 80)],
        variants: [{ id: "v1", level: -1, exerciseId: "builtin:goblet_squat", setGroups: [group(3, 8)], note: "" }],
      }],
    }],
  };

  it("gives every section, slot, set group and variant a new id", () => {
    const copy = cloneContent(original, id);
    const ids = (value: SessionContent) => value.sections.flatMap((section) => [section.id, ...section.slots.flatMap((slot) => [slot.id, ...slot.setGroups.map((entry) => entry.id), ...slot.variants.flatMap((variant) => [variant.id, ...variant.setGroups.map((entry) => entry.id)])])]);
    const before = new Set(ids(original));
    expect(ids(copy).length).toBe(before.size);
    expect(ids(copy).every((value) => !before.has(value))).toBe(true);
  });

  it("keeps the exercises and the prescription, and shares nothing with the original", () => {
    const copy = cloneContent(original, id);
    expect(allSlots(copy).map((slot) => slot.exerciseId)).toEqual([squat]);
    expect(copy.sections[0].slots[0].setGroups[0].load).toEqual({ min: 80, max: 80, basis: "kg" });
    copy.sections[0].slots[0].setGroups[0].load!.min = 90;
    expect(original.sections[0].slots[0].setGroups[0].load!.min).toBe(80);
  });

  it("round-trips through parseSessionContent", () => {
    const copy = cloneContent(original, id);
    expect(parseSessionContent(JSON.parse(JSON.stringify(copy)))).toEqual(copy);
  });
});

describe("pastePlacements", () => {
  it("keeps the selection's shape: Monday AM, Monday PM and Thursday onto a Wednesday", () => {
    // 2026-10-12 is a Monday; 2026-10-21 a Wednesday.
    const placements = pastePlacements([session("a", "2026-10-12", "am"), session("b", "2026-10-12", "pm"), session("c", "2026-10-15")], "2026-10-21");
    expect(placements).toEqual([
      { scheduledOn: "2026-10-21", slot: "am" },
      { scheduledOn: "2026-10-21", slot: "pm" },
      { scheduledOn: "2026-10-24", slot: null },
    ]);
  });

  it("moves a dragged selection by how far the dragged session moved", () => {
    expect(pastePlacements([session("a", "2026-10-12"), session("b", "2026-10-15")], "2026-10-20", "2026-10-15"))
      .toEqual([{ scheduledOn: "2026-10-17", slot: null }, { scheduledOn: "2026-10-20", slot: null }]);
  });

  it("puts an undated session on the target day", () => {
    expect(pastePlacements([session("a", null, "pm")], "2026-10-21")).toEqual([{ scheduledOn: "2026-10-21", slot: "pm" }]);
  });
});

describe("weekCopyPlacements and restOfPeriodWeeks", () => {
  it("keeps weekday and slot", () => {
    expect(weekCopyPlacements([session("a", "2026-10-13", "am"), session("b", "2026-10-16")], "2026-10-12", "2026-11-02"))
      .toEqual([{ scheduledOn: "2026-11-03", slot: "am" }, { scheduledOn: "2026-11-06", slot: null }]);
  });

  it("lists the following weeks of the block", () => {
    const block = { startsOn: "2026-10-05", weeks: 4 };
    expect(restOfPeriodWeeks("2026-10-12", block)).toEqual(["2026-10-19", "2026-10-26"]);
    expect(restOfPeriodWeeks("2026-10-26", block)).toEqual([]);
  });
});

describe("rankCopySources", () => {
  it("ranks the same match day first, then the same weekday, then the most recent", () => {
    const sessions = [session("old-tuesday", "2026-09-01"), session("recent-friday", "2026-10-16"), session("md-2", "2026-10-07"), session("undated", null), session("tuesday", "2026-10-06")];
    const label = (date: string) => date === "2026-10-07" || date === "2026-10-20" ? "MD-2" : null;
    // 2026-10-20 is a Tuesday and MD-2.
    expect(rankCopySources(sessions, "2026-10-20", label).map((entry) => entry.id)).toEqual(["md-2", "tuesday", "old-tuesday", "recent-friday", "undated"]);
  });
});

describe("compareSessions", () => {
  it("orders a day AM, unslotted, PM", () => {
    const day = [session("pm", "2026-10-12", "pm", undefined, "A"), session("none", "2026-10-12", null, undefined, "B"), session("am", "2026-10-12", "am", undefined, "C")];
    expect([...day].sort(compareSessions).map((entry) => entry.id)).toEqual(["am", "none", "pm"]);
  });
});

describe("weekSummary", () => {
  it("counts sessions, minutes, contacts and sets per modality", () => {
    const library = exerciseIndex();
    const sessions = [
      session("a", "2026-10-12", null, content([{ exerciseId: squat, groups: [group(3, 5, 80)] }], [{ exerciseId: boxJump, groups: [{ id: "j", count: 3, contacts: { min: 5, max: 5 }, restSeconds: 60 }] }])),
      session("b", "2026-10-14", null, content([{ exerciseId: deadlift, groups: [group(4, 3, 120)] }])),
    ];
    const summary = weekSummary(sessions, library);
    expect(summary.sessions).toBe(2);
    expect(summary.contacts).toBe(15);
    expect(summary.minutes).toBeGreaterThan(0);
    expect(summary.modalities[library.get(squat)!.modality]).toBeGreaterThanOrEqual(3);
    expect(summary.modalities[library.get(boxJump)!.modality]).toBe(3);
    expect(Object.values(summary.modalities).reduce((total, sets) => total + (sets ?? 0), 0)).toBe(10);
  });
});

describe("progressionMatrix", () => {
  const weeks = ["2026-10-05", "2026-10-12", "2026-10-19"];
  const sessions = [
    session("w1", "2026-10-06", null, content([{ exerciseId: squat, groups: [group(3, 5, 80)] }, { exerciseId: deadlift, groups: [group(3, 5, 100)] }], [{ exerciseId: boxJump, groups: [group(3, 5)] }])),
    session("w2-tue", "2026-10-13", null, content([{ exerciseId: squat, groups: [group(4, 4, 85)] }, { exerciseId: deadlift, groups: [group(3, 5, 100)] }])),
    session("w2-thu", "2026-10-15", null, content([{ exerciseId: squat, groups: [group(3, 3, 70)] }])),
    session("w3", "2026-10-20", null, content([{ exerciseId: squat, groups: [group(5, 3, 90)] }])),
    session("elsewhere", "2026-11-20", null, content([{ exerciseId: "builtin:nordic_curl", groups: [group(3, 5)] }])),
  ];
  const matrix = progressionMatrix(weeks, sessions);
  const row = (exerciseId: string) => matrix.rows.find((entry) => entry.exerciseId === exerciseId)!;

  it("has one row per exercise in the weeks, speed before main, and leaves out other weeks", () => {
    expect(matrix.rows.map((entry) => entry.exerciseId)).toEqual([boxJump, squat, deadlift]);
  });

  it("lists both sessions when an exercise appears twice in a week", () => {
    expect(row(squat).cells[1].entries.map((entry) => [entry.sessionId, entry.text])).toEqual([["w2-tue", "4 × 4 · 85 kg"], ["w2-thu", "3 × 3 · 70 kg"]]);
  });

  it("leaves a cell empty for a week without the exercise", () => {
    expect(row(deadlift).cells[2].entries).toEqual([]);
    expect(row(boxJump).cells[1]).toEqual({ entries: [], changed: false });
  });

  it("marks a changed cell, and not an unchanged one or the first week", () => {
    expect(row(squat).cells.map((cell) => cell.changed)).toEqual([false, true, true]);
    expect(row(deadlift).cells.map((cell) => cell.changed)).toEqual([false, false, false]);
  });

  it("reads the standard prescription only: variants are no rows of their own", () => {
    const withVariant = content([{ exerciseId: squat, groups: [group(3, 5, 80)] }]);
    withVariant.sections[0].slots[0].variants = [{ id: "v", level: -1, exerciseId: "builtin:goblet_squat", setGroups: [group(3, 8)], note: "" }];
    expect(progressionMatrix(weeks, [session("x", "2026-10-06", null, withVariant)]).rows.map((entry) => entry.exerciseId)).toEqual([squat]);
  });
});
