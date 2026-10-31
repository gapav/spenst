import { describe, expect, it } from "vitest";
import { demoPeriods, demoSeasons, demoSessions } from "./demo-data";
import { BUILTIN_EXERCISES, exerciseIndex, searchExercises } from "./exercise-library";
import { overlapsOnLevel, periodColumns, weekIndex } from "./season";
import {
  addSection, addSetGroup, addSlot, defaultSetGroup, describeSetGroup, emptyContent, moveSection, moveSlot, newSlot, parseSessionContent,
  detachVariantPrescription, durationText, parseDurationText, parseTargetText, plannedSets, resolveSlot, setVariant, variantOffers, removeSetGroup, removeSlot, slotLabels, summarizeContent, updateSetGroup, updateSlot,
  type ExerciseSlot, type SessionContent,
} from "./training";

let counter = 0;
const id = () => `id-${(counter += 1)}`;
const library = exerciseIndex();
const exercise = (key: string) => {
  const found = library.get(`builtin:${key}`);
  if (!found) throw new Error(key);
  return found;
};

function contentWith(...keys: string[][]): SessionContent {
  let content = emptyContent();
  for (const sectionKeys of keys) {
    content = addSection(content, "main", undefined, id);
    const sectionId = content.sections.at(-1)!.id;
    for (const key of sectionKeys) content = addSlot(content, sectionId, newSlot(exercise(key), id));
  }
  return content;
}

describe("the built-in library", () => {
  it("has unique, permanent keys and covers every modality", () => {
    const ids = BUILTIN_EXERCISES.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((key) => /^builtin:[a-z0-9_]+$/.test(key))).toBe(true);
    expect(new Set(BUILTIN_EXERCISES.map((entry) => entry.modality)).size).toBe(9);
  });

  it("only gives a velocity metric to exercises that measure velocity", () => {
    for (const entry of BUILTIN_EXERCISES) expect(entry.velocityMetric !== null, entry.id).toBe(entry.metrics.includes("velocity"));
  });

  it("searches by name and modality", () => {
    expect(searchExercises(BUILTIN_EXERCISES, "squat", null).map((entry) => entry.name)).toEqual(expect.arrayContaining(["Back squat", "Speed squat", "Squat jump"]));
    expect(searchExercises(BUILTIN_EXERCISES, "", "sprint").every((entry) => entry.modality === "sprint")).toBe(true);
  });
});

describe("default prescriptions", () => {
  it("fits the modality", () => {
    expect(defaultSetGroup(exercise("back_squat"), id)).toMatchObject({ count: 3, reps: { min: 5, max: 5 }, load: { basis: "kg" } });
    expect(defaultSetGroup(exercise("speed_squat"), id)).toMatchObject({ count: 4, velocity: { min: 0.9, max: 1.3 } });
    expect(defaultSetGroup(exercise("box_jump"), id)).toMatchObject({ contacts: { min: 5, max: 5 }, height: { min: 30, max: 30 } });
    expect(defaultSetGroup(exercise("acceleration_10"), id)).toMatchObject({ count: 4, distance: { min: 10, max: 10 } });
    expect(defaultSetGroup(exercise("nordic_curl"), id).load).toBeUndefined();
  });

  it("makes unilateral work per side", () => {
    expect(defaultSetGroup(exercise("rfe_split_squat"), id).perSide).toBe(true);
    expect(defaultSetGroup(exercise("back_squat"), id).perSide).toBeUndefined();
  });
});

describe("editing", () => {
  it("adds sections and slots without touching the input", () => {
    const before = emptyContent();
    const after = addSection(before, "speed", undefined, id);
    expect(before.sections).toHaveLength(0);
    expect(after.sections[0]).toMatchObject({ kind: "speed", title: "Speed focus" });
  });

  it("letters slots through the session, pairing A1/A2", () => {
    let content = contentWith(["box_jump"], ["back_squat", "pull_up", "nordic_curl"]);
    content = updateSlot(content, content.sections[1].slots[1].id, { pairedWithPrevious: true });
    expect(allLabels(content)).toEqual(["A", "B1", "B2", "C"]);
  });

  it("unpairs a slot whose partner is removed or moved", () => {
    let content = contentWith(["back_squat", "pull_up", "nordic_curl"]);
    const [squat, pull] = content.sections[0].slots;
    content = updateSlot(content, pull.id, { pairedWithPrevious: true });
    expect(removeSlot(content, squat.id).sections[0].slots[0].pairedWithPrevious).toBe(false);
    expect(moveSlot(content, pull.id, 1).sections[0].slots.every((slot) => !slot.pairedWithPrevious)).toBe(true);
  });

  it("keeps the rest of a chain together when a middle slot goes", () => {
    let content = contentWith(["back_squat", "pull_up", "nordic_curl"]);
    const [, pull, nordic] = content.sections[0].slots;
    content = updateSlot(content, pull.id, { pairedWithPrevious: true });
    content = updateSlot(content, nordic.id, { pairedWithPrevious: true });
    expect(allLabels(removeSlot(content, pull.id))).toEqual(["A1", "A2"]);
  });

  it("moves sections and ignores moves past either end", () => {
    const content = contentWith(["box_jump"], ["back_squat"]);
    const [first, second] = content.sections;
    expect(moveSection(content, second.id, -1).sections.map((section) => section.id)).toEqual([second.id, first.id]);
    expect(moveSection(content, first.id, -1)).toBe(content);
  });

  it("edits set groups, copies the last group for a ramp, and never removes the only one", () => {
    let content = contentWith(["back_squat"]);
    const slotId = content.sections[0].slots[0].id;
    const groupId = content.sections[0].slots[0].setGroups[0].id;
    content = updateSetGroup(content, slotId, groupId, { count: 5, load: { min: 80, max: 80, basis: "kg" }, restSeconds: undefined });
    content = addSetGroup(content, slotId, id);
    const groups = content.sections[0].slots[0].setGroups;
    expect(groups).toHaveLength(2);
    expect(groups[1]).toMatchObject({ count: 5, load: { min: 80, basis: "kg" } });
    expect("restSeconds" in groups[0]).toBe(false);
    expect(removeSetGroup(removeSetGroup(content, slotId, groups[0].id), slotId, groups[1].id).sections[0].slots[0].setGroups).toHaveLength(1);
  });
});

describe("reading a session", () => {
  it("expands per-side sets into left and right", () => {
    const slot: ExerciseSlot = { id: "s", exerciseId: "builtin:rfe_split_squat", pairedWithPrevious: false, autoregulation: null, note: "", variants: [], setGroups: [{ id: "g", count: 2, reps: { min: 8, max: 8 }, perSide: true }] };
    expect(plannedSets(slot).map((set) => `${set.index}${set.side?.[0] ?? ""}`)).toEqual(["1l", "1r", "2l", "2r"]);
  });

  it("counts sets, contacts and a rough duration", () => {
    const content = contentWith(["box_jump", "back_squat"]);
    // Box jump: 3 × 5 contacts (15 s work, 60 s rest); squat: 3 × 5 (40 s, 120 s).
    expect(summarizeContent(content, library)).toEqual({ exercises: 2, sets: 6, contacts: 15, minutes: 12 });
  });

  it("reads any other load basis as kg", () => {
    const parsed = parseSessionContent({ sections: [{ id: "a", kind: "main", slots: [{ id: "s", exerciseId: "builtin:back_squat", setGroups: [
      { id: "k", count: 3, load: { min: 60, max: 60, basis: "percent1RM" } },
    ] }] }] });
    expect(parsed.sections[0].slots[0].setGroups[0].load).toEqual({ min: 60, max: 60, basis: "kg" });
  });

  it("describes a set group in a coach's words", () => {
    expect(describeSetGroup({ id: "g", count: 6, reps: { min: 3, max: 3 }, load: { min: 100, max: 100, basis: "kg" }, velocity: { min: 0.9, max: 1.05 }, restSeconds: 150 }))
      .toBe("6 × 3 · 100 kg · 0.90–1.05 m/s · rest 2 min 30 s");
    expect(describeSetGroup({ id: "g", count: 3, contacts: { min: 5, max: 5 }, height: { min: 40, max: 40 } })).toBe("3 × 5 contacts · 40 cm");
    expect(describeSetGroup({ id: "g", count: 3, time: { min: 20, max: 20 }, perSide: true })).toBe("3 × 20 s · per side");
  });

  it("parses targets the way coaches type them", () => {
    expect(parseTargetText("5")).toEqual({ min: 5, max: 5 });
    expect(parseTargetText("0,75–0,90")).toEqual({ min: 0.75, max: 0.9 });
    expect(parseTargetText(" 8 - 10 ")).toEqual({ min: 8, max: 10 });
    expect(parseTargetText("10-8")).toBeNull();
    expect(parseTargetText("fem")).toBeNull();
    expect(parseTargetText("")).toBeNull();
  });

  it("parses rest as seconds or minutes:seconds, and shows it back", () => {
    expect(parseDurationText("90")).toBe(90);
    expect(parseDurationText("2:30")).toBe(150);
    expect(parseDurationText("2:75")).toBeNull();
    expect(parseDurationText("to min")).toBeNull();
    expect([45, 90, 150].map(durationText)).toEqual(["45", "1:30", "2:30"]);
  });
});

describe("content from the database", () => {
  it("round-trips valid content", () => {
    const content = demoSessions[0].content;
    expect(parseSessionContent(JSON.parse(JSON.stringify(content)))).toEqual(content);
  });

  it("drops malformed pieces instead of throwing", () => {
    const parsed = parseSessionContent({ sections: [
      { id: "a", kind: "main", title: "Main lifts", slots: [
        { id: "ok", exerciseId: "builtin:back_squat", setGroups: [{ id: "g", count: 3, reps: { min: 5, max: 5 }, load: { min: "x", max: 1 } }] },
        { id: "no-groups", exerciseId: "builtin:back_squat", setGroups: [] },
        { exerciseId: "builtin:back_squat" },
      ] },
      "nonsense",
      { id: "b", kind: "mystery", slots: null },
    ] });
    expect(parsed.sections.map((section) => section.kind)).toEqual(["main", "custom"]);
    expect(parsed.sections[0].slots.map((slot) => slot.id)).toEqual(["ok"]);
    expect(parsed.sections[0].slots[0].setGroups[0].load).toBeUndefined();
    expect(parseSessionContent(null)).toEqual({ sections: [] });
  });
});

describe("the demo year plan", () => {
  it("keeps every period inside its season and free of overlaps on its level", () => {
    for (const period of demoPeriods) {
      const season = demoSeasons.find((candidate) => candidate.id === period.seasonId);
      expect(season, period.id).toBeDefined();
      if (!season) continue;
      expect(periodColumns(season, period), period.id).not.toBeNull();
      expect(overlapsOnLevel(demoPeriods.filter((other) => other.seasonId === period.seasonId), period), period.id).toBeNull();
    }
  });

  it("dates every demo session inside its team's season", () => {
    for (const session of demoSessions) {
      const season = demoSeasons.find((candidate) => candidate.teamId === session.teamId);
      expect(season && session.scheduledOn && weekIndex(season, session.scheduledOn), session.id).not.toBeNull();
    }
  });
});

function allLabels(content: SessionContent, labels = slotLabels(content)) {
  return content.sections.flatMap((section) => section.slots.map((slot) => labels.get(slot.id)));
}

describe("variants", () => {
  const base = () => contentWith(["ssb_split_squat"]);
  const slotOf = (content: SessionContent) => content.sections[0].slots[0];

  it("suggests ladders that point at real exercises, both ways round", () => {
    for (const entry of BUILTIN_EXERCISES) {
      const { easier, harder } = entry.suggestedVariants ?? {};
      if (easier) expect(library.has(easier), `${entry.id} → ${easier}`).toBe(true);
      if (harder) expect(library.has(harder), `${entry.id} → ${harder}`).toBe(true);
    }
  });

  it("sets, replaces and removes one variant per level", () => {
    let content = base();
    const slotId = slotOf(content).id;
    content = setVariant(content, slotId, -1, exercise("rfe_split_squat"), id);
    content = setVariant(content, slotId, 1, exercise("trap_bar_jump"), id);
    content = setVariant(content, slotId, -1, exercise("bw_split_squat"), id);
    expect(slotOf(content).variants.map((variant) => [variant.level, variant.exerciseId])).toEqual([[-1, "builtin:bw_split_squat"], [1, "builtin:trap_bar_jump"]]);
    expect(setVariant(content, slotId, 1, null).sections[0].slots[0].variants).toHaveLength(1);
  });

  it("resolves an athlete's level, falling back to the slot as written", () => {
    let content = base();
    const slotId = slotOf(content).id;
    content = setVariant(content, slotId, -1, exercise("rfe_split_squat"), id);
    const slot = slotOf(content);
    expect(resolveSlot(slot, -1)).toMatchObject({ level: -1, exerciseId: "builtin:rfe_split_squat", setGroups: slot.setGroups });
    expect(resolveSlot(slot, 1)).toMatchObject({ level: 0, exerciseId: "builtin:ssb_split_squat" });
  });

  it("gives a variant its own prescription when asked, and edits it separately", () => {
    let content = base();
    const slotId = slotOf(content).id;
    content = setVariant(content, slotId, -1, exercise("bw_split_squat"), id);
    content = detachVariantPrescription(content, slotId, -1, id);
    const variantGroup = slotOf(content).variants[0].setGroups[0];
    content = updateSetGroup(content, slotId, variantGroup.id, { reps: { min: 10, max: 10 } }, -1);
    expect(slotOf(content).variants[0].setGroups[0].reps).toEqual({ min: 10, max: 10 });
    expect(slotOf(content).setGroups[0].reps).toEqual({ min: 5, max: 5 });
    expect(resolveSlot(slotOf(content), -1).setGroups[0].reps).toEqual({ min: 10, max: 10 });
  });

  it("survives a round trip through JSON and drops a duplicate level", () => {
    let content = base();
    content = setVariant(content, slotOf(content).id, 1, exercise("trap_bar_jump"), id);
    const raw = JSON.parse(JSON.stringify(content));
    raw.sections[0].slots[0].variants.push({ id: "dup", level: 1, exerciseId: "builtin:box_jump", setGroups: [], note: "" }, { id: "bad", level: 3, exerciseId: "x" });
    content = parseSessionContent(raw);
    expect(slotOf(content).variants.map((variant) => variant.exerciseId)).toEqual(["builtin:trap_bar_jump"]);
  });
});

describe("variant offers", () => {
  it("collects every exercise offering a variant, and what it offers", () => {
    const offers = variantOffers(demoSessions.filter((session) => session.teamId === "team-senior").map((session) => session.content));
    const split = offers.find((offer) => offer.exerciseId === "builtin:ssb_split_squat");
    expect(split).toEqual({ exerciseId: "builtin:ssb_split_squat", easier: ["builtin:rfe_split_squat"], harder: [] });
    expect(offers.find((offer) => offer.exerciseId === "builtin:hang_power_clean")).toMatchObject({ easier: ["builtin:hang_high_pull"], harder: ["builtin:power_clean"] });
    expect(offers.some((offer) => offer.exerciseId === "builtin:speed_squat")).toBe(false);
  });
});
