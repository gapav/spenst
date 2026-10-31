import type { AutoregulationRule } from "./vbt";

/**
 * The programming vocabulary. One model for every kind of training: an
 * exercise declares what can be measured, a prescription sets targets in that
 * vocabulary, and a log records actuals in the same vocabulary. Strength,
 * power, plyometrics, sprints, VBT and conditioning are all just different
 * combinations of the same metrics. See docs/athletes-and-programming.md.
 *
 * Everything here is pure: the builder edits a `SessionContent` through these
 * functions and the provider saves the result whole.
 */

export type Modality = "strength" | "power" | "olympic" | "plyometric" | "sprint" | "med-ball" | "conditioning" | "prep" | "isometric";

/** What can be prescribed and logged. Sets, side and rest are structural, not metrics. */
export type MetricKey = "reps" | "load" | "velocity" | "power" | "contacts" | "height" | "distance" | "time" | "rpe";

export interface Exercise {
  /** Built-in exercises have a stable `builtin:` key; custom ones a uuid. Never reuse or delete a key — logs point at it. */
  id: string;
  name: string;
  modality: Modality;
  /** What this exercise can be measured in. The builder offers exactly these. */
  metrics: MetricKey[];
  unilateral: boolean;
  /** Strength lifts are read on mean velocity, Olympic lifts and jumps on peak. */
  velocityMetric: "mean" | "peak" | null;
  cue: string;
  /** `null` for the built-in library; a team id for a team's own exercise. */
  teamId: string | null;
  /** The natural easier and harder versions, offered when the coach adds variants. */
  suggestedVariants?: { easier?: string; harder?: string };
}

/** A single value, or a range when min and max differ: "0,75–0,90 m/s". */
export interface Target {
  min: number;
  max: number;
}

/** Kilos. There is no % of 1RM on purpose: estimated maxes are too noisy to build prescriptions on. */
export type LoadBasis = "kg";
export interface LoadTarget extends Target {
  basis: LoadBasis;
}

/** One row of the prescription: `count` sets with the same targets. Ramps are several groups. */
export interface SetGroup {
  id: string;
  count: number;
  reps?: Target;
  load?: LoadTarget;
  velocity?: Target;
  contacts?: Target;
  height?: Target;
  distance?: Target;
  time?: Target;
  rpe?: Target;
  restSeconds?: number;
  /** Each set is done on both sides and logged per side. */
  perSide?: boolean;
}

/** −1 is the easier version of an exercise, +1 the harder; 0 is the exercise as written. */
export type VariantLevel = -1 | 1;
export type AthleteLevel = VariantLevel | 0;

/**
 * Another exercise the athlete may do in this slot instead. The whole team
 * trains the same session; variants are how it fits a 14-year-old and a
 * senior international alike. Without its own set groups a variant is done
 * with the slot's prescription.
 */
export interface SlotVariant {
  id: string;
  level: VariantLevel;
  exerciseId: string;
  setGroups: SetGroup[];
  note: string;
}

export interface ExerciseSlot {
  id: string;
  exerciseId: string;
  /** Done alternately with the slot before it: A1 / A2. */
  pairedWithPrevious: boolean;
  setGroups: SetGroup[];
  /** Ballou's set-to-set rule; only meaningful when velocity is prescribed. */
  autoregulation: AutoregulationRule | null;
  note: string;
  /** At most one per level. */
  variants: SlotVariant[];
}

export type SectionKind = "prep" | "speed" | "main" | "accessory" | "conditioning" | "custom";

export interface Section {
  id: string;
  kind: SectionKind;
  title: string;
  slots: ExerciseSlot[];
}

export interface SessionContent {
  sections: Section[];
}

export const sectionPresets: Record<Exclude<SectionKind, "custom">, string> = {
  prep: "Warm-up",
  // Ballou's "speed focus": plyos, med ball and sprints first, every lower-body day.
  speed: "Speed focus",
  main: "Main lifts",
  accessory: "Accessories",
  conditioning: "Conditioning",
};

export const modalityLabels: Record<Modality, string> = {
  strength: "Strength",
  power: "Power",
  olympic: "Olympic lifts",
  plyometric: "Plyometrics",
  sprint: "Sprint",
  "med-ball": "Med ball",
  conditioning: "Conditioning",
  prep: "Warm-up",
  isometric: "Isometric",
};

export const metricLabels: Record<MetricKey, string> = {
  reps: "Reps",
  load: "Load",
  velocity: "Velocity",
  power: "Power",
  contacts: "Contacts",
  height: "Height",
  distance: "Distance",
  time: "Time",
  rpe: "RPE",
};

export const metricUnits: Partial<Record<MetricKey, string>> = {
  velocity: "m/s",
  power: "W",
  height: "cm",
  distance: "m",
  time: "s",
};

// ---------------------------------------------------------------------------
// Construction

export type IdFactory = () => string;
const uuid: IdFactory = () => crypto.randomUUID();
const exactly = (value: number): Target => ({ min: value, max: value });

export function emptyContent(): SessionContent {
  return { sections: [] };
}

/** Sensible first prescription for an exercise, by modality — the coach edits from here. */
export function defaultSetGroup(exercise: Pick<Exercise, "modality" | "metrics" | "unilateral">, makeId: IdFactory = uuid): SetGroup {
  const base: SetGroup = { id: makeId(), count: 3 };
  const perSide = exercise.unilateral ? { perSide: true } : {};
  const has = (metric: MetricKey) => exercise.metrics.includes(metric);
  switch (exercise.modality) {
    case "strength":
      return { ...base, ...perSide, reps: exactly(5), ...(has("load") ? { load: { ...exactly(0), basis: "kg" as const } } : {}), restSeconds: 120 };
    case "power":
    case "olympic":
      return { ...base, count: 4, ...perSide, reps: exactly(3), ...(has("load") ? { load: { ...exactly(0), basis: "kg" as const } } : {}), ...(has("velocity") ? { velocity: { min: 0.9, max: 1.3 } } : {}), restSeconds: 150 };
    case "plyometric":
      return { ...base, ...perSide, contacts: exactly(5), ...(has("height") ? { height: exactly(30) } : {}), restSeconds: 60 };
    case "sprint":
      return { ...base, count: 4, distance: exactly(10), restSeconds: 120 };
    case "med-ball":
      return { ...base, ...perSide, reps: exactly(6), restSeconds: 60 };
    case "conditioning":
      return { ...base, count: 6, time: exactly(30), rpe: exactly(8), restSeconds: 30 };
    case "isometric":
      return { ...base, ...perSide, time: exactly(5), restSeconds: 60 };
    case "prep":
      return { ...base, count: 1, time: exactly(600) };
  }
}

export function newSlot(exercise: Exercise, makeId: IdFactory = uuid): ExerciseSlot {
  return { id: makeId(), exerciseId: exercise.id, pairedWithPrevious: false, setGroups: [defaultSetGroup(exercise, makeId)], autoregulation: null, note: "", variants: [] };
}

// ---------------------------------------------------------------------------
// Editing. Every function returns a new content and leaves its input alone.

const mapSlots = (content: SessionContent, map: (slot: ExerciseSlot) => ExerciseSlot): SessionContent =>
  ({ sections: content.sections.map((section) => ({ ...section, slots: section.slots.map(map) })) });

export function addSection(content: SessionContent, kind: SectionKind, title = kind === "custom" ? "New section" : sectionPresets[kind], makeId: IdFactory = uuid): SessionContent {
  return { sections: [...content.sections, { id: makeId(), kind, title, slots: [] }] };
}

export function renameSection(content: SessionContent, sectionId: string, title: string): SessionContent {
  return { sections: content.sections.map((section) => section.id === sectionId ? { ...section, title } : section) };
}

export function removeSection(content: SessionContent, sectionId: string): SessionContent {
  return { sections: content.sections.filter((section) => section.id !== sectionId) };
}

export function moveSection(content: SessionContent, sectionId: string, offset: -1 | 1): SessionContent {
  const index = content.sections.findIndex((section) => section.id === sectionId);
  const target = index + offset;
  if (index < 0 || target < 0 || target >= content.sections.length) return content;
  const sections = [...content.sections];
  [sections[index], sections[target]] = [sections[target], sections[index]];
  return { sections };
}

export function addSlot(content: SessionContent, sectionId: string, slot: ExerciseSlot): SessionContent {
  return { sections: content.sections.map((section) => section.id === sectionId ? { ...section, slots: [...section.slots, slot] } : section) };
}

export function updateSlot(content: SessionContent, slotId: string, patch: Partial<Omit<ExerciseSlot, "id">>): SessionContent {
  return mapSlots(content, (slot) => slot.id === slotId ? { ...slot, ...patch } : slot);
}

export function removeSlot(content: SessionContent, slotId: string): SessionContent {
  return {
    sections: content.sections.map((section) => {
      const index = section.slots.findIndex((slot) => slot.id === slotId);
      if (index < 0) return section;
      const slots = section.slots.filter((slot) => slot.id !== slotId);
      // The slot that was paired with the removed one has no partner left at
      // that position, unless the removed slot was itself paired backwards.
      const removed = section.slots[index];
      if (slots[index] && !removed.pairedWithPrevious) slots[index] = { ...slots[index], pairedWithPrevious: false };
      if (index === 0 && slots[0]) slots[0] = { ...slots[0], pairedWithPrevious: false };
      return { ...section, slots };
    }),
  };
}

/** Moves a slot within its section. Pairing stays with the position, so a moved slot starts unpaired. */
export function moveSlot(content: SessionContent, slotId: string, offset: -1 | 1): SessionContent {
  return {
    sections: content.sections.map((section) => {
      const index = section.slots.findIndex((slot) => slot.id === slotId);
      const target = index + offset;
      if (index < 0 || target < 0 || target >= section.slots.length) return section;
      const slots = section.slots.map((slot) => ({ ...slot }));
      [slots[index], slots[target]] = [slots[target], slots[index]];
      slots[index].pairedWithPrevious = false;
      slots[target].pairedWithPrevious = false;
      slots[0].pairedWithPrevious = false;
      return { ...section, slots };
    }),
  };
}

/**
 * The set groups an edit applies to: the slot's own at level 0, or a
 * variant's own prescription at ±1.
 */
function mapGroups(content: SessionContent, slotId: string, level: AthleteLevel, map: (groups: SetGroup[]) => SetGroup[]): SessionContent {
  return mapSlots(content, (slot) => {
    if (slot.id !== slotId) return slot;
    if (level === 0) return { ...slot, setGroups: map(slot.setGroups) };
    return { ...slot, variants: slot.variants.map((variant) => variant.level === level ? { ...variant, setGroups: map(variant.setGroups) } : variant) };
  });
}

export function updateSetGroup(content: SessionContent, slotId: string, groupId: string, patch: Partial<Omit<SetGroup, "id">>, level: AthleteLevel = 0): SessionContent {
  return mapGroups(content, slotId, level, (groups) => groups.map((group) => group.id === groupId ? withoutUndefined({ ...group, ...patch }) : group));
}

export function addSetGroup(content: SessionContent, slotId: string, makeId: IdFactory = uuid, level: AthleteLevel = 0): SessionContent {
  // A new group copies the last one — the next step of a ramp is usually the same shape.
  return mapGroups(content, slotId, level, (groups) => [...groups, { ...structuredClone(groups.at(-1) ?? { count: 1 }), id: makeId() }]);
}

export function removeSetGroup(content: SessionContent, slotId: string, groupId: string, level: AthleteLevel = 0): SessionContent {
  return mapGroups(content, slotId, level, (groups) => groups.length <= 1 ? groups : groups.filter((group) => group.id !== groupId));
}

/** Puts `exercise` in as the slot's variant at `level`, replacing any there; `null` removes it. */
export function setVariant(content: SessionContent, slotId: string, level: VariantLevel, exercise: Pick<Exercise, "id"> | null, makeId: IdFactory = uuid): SessionContent {
  return mapSlots(content, (slot) => {
    if (slot.id !== slotId) return slot;
    const others = slot.variants.filter((variant) => variant.level !== level);
    if (!exercise) return { ...slot, variants: others };
    const existing = slot.variants.find((variant) => variant.level === level);
    const variant: SlotVariant = existing && existing.exerciseId === exercise.id ? existing : { id: makeId(), level, exerciseId: exercise.id, setGroups: [], note: existing?.note ?? "" };
    return { ...slot, variants: [...others, variant].sort((a, b) => a.level - b.level) };
  });
}

export function updateVariant(content: SessionContent, slotId: string, level: VariantLevel, patch: Partial<Pick<SlotVariant, "note" | "setGroups">>): SessionContent {
  return mapSlots(content, (slot) => slot.id !== slotId ? slot : { ...slot, variants: slot.variants.map((variant) => variant.level === level ? { ...variant, ...patch } : variant) });
}

/** Gives a variant a prescription of its own, starting from a copy of the slot's. */
export function detachVariantPrescription(content: SessionContent, slotId: string, level: VariantLevel, makeId: IdFactory = uuid): SessionContent {
  return mapSlots(content, (slot) => slot.id !== slotId ? slot : {
    ...slot,
    variants: slot.variants.map((variant) => variant.level === level ? { ...variant, setGroups: slot.setGroups.map((group) => ({ ...structuredClone(group), id: makeId() })) } : variant),
  });
}

export interface ResolvedSlot {
  /** The level actually used: an athlete on −1 gets the slot as written when it has no easier variant. */
  level: AthleteLevel;
  exerciseId: string;
  setGroups: SetGroup[];
  note: string;
}

/** What an athlete at `level` does in this slot. */
export function resolveSlot(slot: ExerciseSlot, level: AthleteLevel): ResolvedSlot {
  const variant = level === 0 ? null : slot.variants.find((candidate) => candidate.level === level);
  if (!variant) return { level: 0, exerciseId: slot.exerciseId, setGroups: slot.setGroups, note: slot.note };
  return { level: variant.level, exerciseId: variant.exerciseId, setGroups: variant.setGroups.length ? variant.setGroups : slot.setGroups, note: variant.note || slot.note };
}

export const levelLabels: Record<AthleteLevel, string> = { [-1]: "Easier", 0: "Standard", 1: "Harder" };

function withoutUndefined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T;
}

// ---------------------------------------------------------------------------
// Reading

export function allSlots(content: SessionContent): ExerciseSlot[] {
  return content.sections.flatMap((section) => section.slots);
}

/**
 * A1 / A2 for paired slots, a bare letter for a slot on its own, lettered
 * through the whole session in order.
 */
export function slotLabels(content: SessionContent): Map<string, string> {
  const labels = new Map<string, string>();
  let letter = -1;
  for (const section of content.sections) {
    let groups: ExerciseSlot[][] = [];
    for (const slot of section.slots) {
      if (slot.pairedWithPrevious && groups.length) groups.at(-1)?.push(slot);
      else groups.push([slot]);
    }
    for (const group of groups) {
      letter += 1;
      const name = letterName(letter);
      group.forEach((slot, index) => labels.set(slot.id, group.length > 1 ? `${name}${index + 1}` : name));
    }
    groups = [];
  }
  return labels;
}

function letterName(index: number): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  return index < alphabet.length ? alphabet[index] : `${alphabet[Math.floor(index / alphabet.length) - 1]}${alphabet[index % alphabet.length]}`;
}

export interface PlannedSet {
  slotId: string;
  groupId: string;
  /** 1-based, through the whole slot. */
  index: number;
  side: "left" | "right" | null;
  group: SetGroup;
}

/** The sets the athlete will actually do, in order; per-side sets become a left and a right. */
export function plannedSets(slot: ExerciseSlot): PlannedSet[] {
  const sets: PlannedSet[] = [];
  let index = 0;
  for (const group of slot.setGroups) {
    for (let count = 0; count < group.count; count += 1) {
      index += 1;
      if (group.perSide) {
        sets.push({ slotId: slot.id, groupId: group.id, index, side: "left", group }, { slotId: slot.id, groupId: group.id, index, side: "right", group });
      } else {
        sets.push({ slotId: slot.id, groupId: group.id, index, side: null, group });
      }
    }
  }
  return sets;
}

const defaultRest: Record<Modality, number> = { strength: 120, power: 150, olympic: 150, plyometric: 60, sprint: 120, "med-ball": 60, conditioning: 30, prep: 0, isometric: 60 };
const defaultWork: Record<Modality, number> = { strength: 40, power: 25, olympic: 20, plyometric: 15, sprint: 5, "med-ball": 20, conditioning: 30, prep: 600, isometric: 10 };

export interface SessionSummary {
  exercises: number;
  sets: number;
  /** Plyometric ground contacts, counting both sides of per-side work. */
  contacts: number;
  /** A rough estimate from work and rest, to say whether a plan fits the slot it has. */
  minutes: number;
}

export function summarizeContent(content: SessionContent, exercises: ReadonlyMap<string, Pick<Exercise, "modality">>): SessionSummary {
  let sets = 0; let contacts = 0; let seconds = 0;
  const slots = allSlots(content);
  for (const slot of slots) {
    const modality = exercises.get(slot.exerciseId)?.modality ?? "strength";
    for (const group of slot.setGroups) {
      const sides = group.perSide ? 2 : 1;
      sets += group.count;
      contacts += (group.contacts?.max ?? 0) * group.count * sides;
      const work = group.time?.max ?? defaultWork[modality];
      seconds += group.count * (work * sides + (group.restSeconds ?? defaultRest[modality]));
    }
  }
  return { exercises: slots.length, sets, contacts, minutes: Math.round(seconds / 60) };
}

// ---------------------------------------------------------------------------
// Words

const decimal = (value: number) => new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 }).format(value);
const twoDecimals = (value: number) => new Intl.NumberFormat("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);

export function formatTarget(target: Target, format: (value: number) => string = decimal): string {
  return target.min === target.max ? format(target.min) : `${format(target.min)}–${format(target.max)}`;
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60); const rest = seconds % 60;
  return rest ? `${minutes} min ${rest} s` : `${minutes} min`;
}

/** "4 × 5 · 80 kg · 0.75–0.90 m/s · per side · rest 2 min" */
export function describeSetGroup(group: SetGroup): string {
  const count = group.reps ? `${group.count} × ${formatTarget(group.reps)}`
    : group.contacts ? `${group.count} × ${formatTarget(group.contacts)} contacts`
    : group.distance ? `${group.count} × ${formatTarget(group.distance)} m`
    : group.time ? `${group.count} × ${group.time.min === group.time.max ? formatDuration(group.time.min) : `${formatTarget(group.time)} s`}`
    : `${group.count} ${group.count === 1 ? "set" : "sets"}`;
  const parts = [count];
  if (group.load && group.load.max > 0) parts.push(`${formatTarget(group.load)} kg`);
  if (group.velocity) parts.push(`${formatTarget(group.velocity, twoDecimals)} m/s`);
  if (group.height) parts.push(`${formatTarget(group.height)} cm`);
  if (group.rpe) parts.push(`RPE ${formatTarget(group.rpe)}`);
  if (group.perSide) parts.push("per side");
  if (group.restSeconds) parts.push(`rest ${formatDuration(group.restSeconds)}`);
  return parts.join(" · ");
}

// ---------------------------------------------------------------------------
// Reading content back from the database

/**
 * Session content is stored as JSON, so whatever comes back is checked before
 * the builder or the player touches it. Malformed pieces are dropped rather
 * than thrown: one bad slot must not take a whole session off an athlete's phone.
 */
export function parseSessionContent(value: unknown): SessionContent {
  const record = (input: unknown): Record<string, unknown> | null => input && typeof input === "object" && !Array.isArray(input) ? input as Record<string, unknown> : null;
  const text = (input: unknown, fallback = "") => typeof input === "string" ? input : fallback;
  const number = (input: unknown) => typeof input === "number" && Number.isFinite(input) ? input : null;
  const target = (input: unknown): Target | undefined => {
    const row = record(input); const min = number(row?.min); const max = number(row?.max);
    return min !== null && max !== null ? { min, max } : undefined;
  };
  const parseGroups = (input: unknown): SetGroup[] => (Array.isArray(input) ? input : []).flatMap((rawGroup): SetGroup[] => {
    const group = record(rawGroup); const count = number(group?.count);
    if (!group || typeof group.id !== "string" || count === null || count < 1) return [];
    // Loads are kilos; any other basis an old document carries reads as kg.
    const load = target(group.load);
    return [withoutUndefined({
      id: group.id, count: Math.round(count),
      reps: target(group.reps), load: load && { ...load, basis: "kg" as const }, velocity: target(group.velocity), contacts: target(group.contacts),
      height: target(group.height), distance: target(group.distance), time: target(group.time), rpe: target(group.rpe),
      restSeconds: number(group.restSeconds) ?? undefined, perSide: group.perSide === true ? true : undefined,
    } as SetGroup)];
  });
  const root = record(value);
  const sections = Array.isArray(root?.sections) ? root.sections : [];
  return {
    sections: sections.flatMap((rawSection): Section[] => {
      const section = record(rawSection);
      if (!section || typeof section.id !== "string") return [];
      const kind = (["prep", "speed", "main", "accessory", "conditioning", "custom"] as const).find((candidate) => candidate === section.kind) ?? "custom";
      const slots = (Array.isArray(section.slots) ? section.slots : []).flatMap((rawSlot): ExerciseSlot[] => {
        const slot = record(rawSlot);
        if (!slot || typeof slot.id !== "string" || typeof slot.exerciseId !== "string") return [];
        const setGroups = parseGroups(slot.setGroups);
        if (!setGroups.length) return [];
        const rule = record(slot.autoregulation);
        const autoregulation = rule && number(rule.target) !== null && number(rule.bumpAbove) !== null && number(rule.bumpKg) !== null
          ? { target: rule.target as number, bumpAbove: rule.bumpAbove as number, bumpKg: rule.bumpKg as number } : null;
        const variants = (Array.isArray(slot.variants) ? slot.variants : []).flatMap((rawVariant): SlotVariant[] => {
          const variant = record(rawVariant);
          if (!variant || typeof variant.id !== "string" || typeof variant.exerciseId !== "string" || (variant.level !== -1 && variant.level !== 1)) return [];
          return [{ id: variant.id, level: variant.level, exerciseId: variant.exerciseId, setGroups: parseGroups(variant.setGroups), note: text(variant.note) }];
        }).filter((variant, index, all) => all.findIndex((other) => other.level === variant.level) === index);
        return [{ id: slot.id, exerciseId: slot.exerciseId, pairedWithPrevious: slot.pairedWithPrevious === true, setGroups, autoregulation, note: text(slot.note), variants }];
      });
      return [{ id: section.id, kind, title: text(section.title, kind === "custom" ? "Section" : sectionPresets[kind]), slots }];
    }),
  };
}

/**
 * A target as a coach types it: "5", "0.75–0.90", "75-80" or "8 – 10". Point
 * or comma decimals, any dash. Null for anything else, including a range that
 * runs backwards.
 */
export function parseTargetText(text: string): Target | null {
  const cleaned = text.trim().replace(/\s+/g, "").replace(/[–—]/g, "-");
  if (!cleaned) return null;
  const match = /^(\d+(?:[.,]\d+)?)(?:-(\d+(?:[.,]\d+)?))?$/.exec(cleaned);
  if (!match) return null;
  const min = Number(match[1].replace(",", "."));
  const max = match[2] === undefined ? min : Number(match[2].replace(",", "."));
  return max >= min ? { min, max } : null;
}

/** Rest as a coach types it: "90" (seconds) or "2:30". Null for anything else. */
export function parseDurationText(text: string): number | null {
  const cleaned = text.trim().replace(/\s+/g, "");
  if (!cleaned) return null;
  const clock = /^(\d{1,3}):([0-5]\d)$/.exec(cleaned);
  if (clock) return Number(clock[1]) * 60 + Number(clock[2]);
  return /^\d{1,4}$/.test(cleaned) ? Number(cleaned) : null;
}

/** The inverse of `parseDurationText`, for showing rest back in the field: 150 → "2:30". */
export function durationText(seconds: number): string {
  return seconds < 60 ? String(seconds) : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export interface VariantOffer {
  /** The exercise as the coach wrote it — what an athlete's level is keyed by. */
  exerciseId: string;
  easier: string[];
  harder: string[];
}

/**
 * Every exercise that offers a variant anywhere in these sessions, with the
 * variants offered — the choices an athlete and coach have to agree on.
 */
export function variantOffers(contents: readonly SessionContent[]): VariantOffer[] {
  const offers = new Map<string, { easier: Set<string>; harder: Set<string> }>();
  for (const content of contents) {
    for (const slot of allSlots(content)) {
      if (!slot.variants.length) continue;
      const offer = offers.get(slot.exerciseId) ?? { easier: new Set<string>(), harder: new Set<string>() };
      for (const variant of slot.variants) (variant.level < 0 ? offer.easier : offer.harder).add(variant.exerciseId);
      offers.set(slot.exerciseId, offer);
    }
  }
  return [...offers].map(([exerciseId, { easier, harder }]) => ({ exerciseId, easier: [...easier], harder: [...harder] }));
}
