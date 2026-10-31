"use client";

import { ArrowDown, ArrowLeft, ArrowUp, ChevronDown, ChevronUp, Link2, Plus, Send, Trash2, Undo2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useSpenst } from "./app-provider";
import { AppShell } from "./app-shell";
import { ExercisePicker } from "./exercise-picker";
import { CountField, RestField, TargetField, TextCommitField } from "./target-field";
import { Button, EmptyState, Tag } from "./ui";
import { isoWeek, periodAt, zoneLabel } from "@/lib/season";
import {
  addSection, addSetGroup, addSlot, describeSetGroup, detachVariantPrescription, formatTarget, levelLabels, metricLabels, metricUnits, modalityLabels,
  moveSection, moveSlot, newSlot, removeSection, removeSetGroup, removeSlot, renameSection, sectionPresets, setVariant, slotLabels, summarizeContent,
  updateSetGroup, updateSlot, updateVariant,
  type AthleteLevel, type Exercise, type ExerciseSlot, type MetricKey, type Section, type SectionKind, type SessionContent, type SetGroup, type VariantLevel,
} from "@/lib/training";
import { cn } from "@/lib/utils";

/** The metrics a coach prescribes, in the order the fields appear. Power is logged, never prescribed. */
const PRESCRIBED: readonly Exclude<MetricKey, "load" | "power" | "velocity">[] = ["reps", "contacts", "distance", "time", "height", "rpe"];
const decimalText = (value: number) => new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 }).format(value);

type Edit = (change: (content: SessionContent) => SessionContent) => void;


type Picking = { for: "slot"; sectionId: string; kind: SectionKind } | { for: "variant"; slotId: string; level: VariantLevel; base: Exercise } | null;

export function SessionBuilderScreen({ sessionId }: { sessionId: string }) {
  const { sessions, seasons, periods, teams, exercises, exerciseById, workspaceLoaded, updateSession, editSessionContent, deleteSession } = useSpenst();
  const session = sessions.find((candidate) => candidate.id === sessionId) ?? null;
  const [picking, setPicking] = useState<Picking>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const router = useRouter();
  const summary = useMemo(() => session ? summarizeContent(session.content, exerciseById) : null, [session, exerciseById]);
  const labels = useMemo(() => session ? slotLabels(session.content) : new Map<string, string>(), [session]);

  if (!workspaceLoaded) return <AppShell><div className="spenst-page"><p role="status" className="spenst-loading">Loading the session …</p></div></AppShell>;
  if (!session || !summary) return <AppShell><div className="spenst-page"><EmptyState icon={<Plus size={24} />} title="Session not found" body="The session was deleted, or belongs to a team you are not on." action={<Link className="spenst-action" href="/plan">To the season plan</Link>} /></div></AppShell>;

  // Every content change goes through the provider’s queue; a failure is
  // already reported there, so the builder only has to not crash.
  const edit: Edit = (change) => { void editSessionContent(session.id, change).catch(() => undefined); };
  const toggle = (slotId: string) => setExpanded((current) => { const next = new Set(current); if (next.has(slotId)) next.delete(slotId); else next.add(slotId); return next; });
  const team = teams.find((candidate) => candidate.id === session.teamId);
  const seasonPeriods = periods.filter((period) => seasons.some((season) => season.id === period.seasonId && season.teamId === session.teamId));
  const phase = session.scheduledOn ? periodAt(seasonPeriods, "phase", session.scheduledOn) : null;
  const block = session.scheduledOn ? periodAt(seasonPeriods, "block", session.scheduledOn) : null;
  const published = session.status === "published";
  const presets = (Object.keys(sectionPresets) as Exclude<SectionKind, "custom">[]).filter((kind) => !session.content.sections.some((section) => section.kind === kind));

  return <AppShell><div className="spenst-page builder-page">
    <Link href="/plan" className="spenst-text-link mb-3 text-[var(--ink-soft)]"><ArrowLeft size={16} />Season plan</Link>

    <header className="spenst-card builder-head">
      <div className="min-w-0 flex-1">
        <p className="spenst-eyebrow">{[team?.shortName, session.scheduledOn && `week ${isoWeek(session.scheduledOn)}`, phase?.title, block?.title].filter(Boolean).join(" · ")}</p>
        <TextCommitField label="Session name" className="builder-title" value={session.title} onCommit={(title) => void updateSession(session.id, { title: title.trim() || "Session" }).catch(() => undefined)} />
        {(block?.focus || block?.emphasis) && <p className="builder-context">{block.emphasis && <Tag tone="sage">{zoneLabel(block.emphasis)}</Tag>} {block.focus}</p>}
        <div className="builder-meta">
          <label className="metric-field"><span>Date</span><input className="metric-input is-date" type="date" value={session.scheduledOn ?? ""} onChange={(event) => void updateSession(session.id, { scheduledOn: event.target.value || null }).catch(() => undefined)} /></label>
          <ul className="builder-stats" aria-label="Summary">
            <li><strong>{summary.exercises}</strong> {summary.exercises === 1 ? "exercise" : "exercises"}</li>
            <li><strong>{summary.sets}</strong> {summary.sets === 1 ? "set" : "sets"}</li>
            {summary.contacts > 0 && <li><strong>{summary.contacts}</strong> {summary.contacts === 1 ? "contact" : "contacts"}</li>}
            <li>about <strong>{summary.minutes}</strong> min</li>
          </ul>
        </div>
      </div>
      <div className="builder-head-actions">
        {published
          ? <><Tag tone="sage">Published</Tag><Button variant="ghost" size="sm" onClick={() => void updateSession(session.id, { status: "draft" }).catch(() => undefined)}><Undo2 size={15} />Back to draft</Button></>
          : <Button size="sm" onClick={() => void updateSession(session.id, { status: "published" }).catch(() => undefined)}><Send size={15} />Publish to the team</Button>}
        {confirmDelete
          ? <><Button variant="danger" size="sm" onClick={() => { router.push("/plan"); void deleteSession(session.id).catch(() => undefined); }}>Delete the session</Button><Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>Cancel</Button></>
          : <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(true)} aria-label="Delete the session"><Trash2 size={16} /></Button>}
      </div>
    </header>

    {!session.content.sections.length && <p className="spenst-context-note mt-5">Start with a section. “Speed focus” before the main lifts is Ballou’s: plyos, med ball and sprints while the legs are fresh.</p>}

    <div className="mt-5 grid gap-4">
      {session.content.sections.map((section, sectionIndex) => <SectionCard
        key={section.id}
        section={section}
        first={sectionIndex === 0}
        last={sectionIndex === session.content.sections.length - 1}
        labels={labels}
        exerciseById={exerciseById}
        expanded={expanded}
        onToggle={toggle}
        onEdit={edit}
        onAdd={() => setPicking({ for: "slot", sectionId: section.id, kind: section.kind })}
        onPickVariant={(slotId, level, base) => setPicking({ for: "variant", slotId, level, base })}
      />)}
    </div>

    <section className="builder-add-section" aria-label="Add a section">
      <span>Add a section</span>
      <div className="flex flex-wrap gap-2">
        {presets.map((kind) => <Button key={kind} variant="secondary" size="sm" onClick={() => edit((content) => addSection(content, kind))}><Plus size={15} />{sectionPresets[kind]}</Button>)}
        <Button variant="ghost" size="sm" onClick={() => edit((content) => addSection(content, "custom"))}><Plus size={15} />Custom section</Button>
      </div>
    </section>

    <ExercisePicker
      key={picking ? JSON.stringify({ ...picking, base: picking.for === "variant" ? picking.base.id : null }) : "closed"}
      open={picking !== null}
      title={picking?.for === "variant" ? `${levelLabels[picking.level]} variant of ${picking.base.name}` : undefined}
      exercises={exercises}
      preferred={picking ? picking.for === "slot" ? preferredModality(picking.kind) : picking.base.modality : null}
      suggested={picking?.for === "variant" ? [picking.level < 0 ? picking.base.suggestedVariants?.easier : picking.base.suggestedVariants?.harder].filter((id): id is string => Boolean(id)) : []}
      onClose={() => setPicking(null)}
      onPick={(exercise) => {
        if (!picking) return;
        if (picking.for === "slot") {
          const slot = newSlot(exercise);
          edit((content) => addSlot(content, picking.sectionId, slot));
          setExpanded((current) => new Set(current).add(slot.id));
        } else {
          edit((content) => setVariant(content, picking.slotId, picking.level, exercise));
        }
        setPicking(null);
      }}
    />
  </div></AppShell>;
}

function preferredModality(kind: SectionKind) {
  return kind === "prep" ? "prep" as const : kind === "speed" ? "plyometric" as const : kind === "conditioning" ? "conditioning" as const : null;
}

function SectionCard({ section, first, last, labels, exerciseById, expanded, onToggle, onEdit, onAdd, onPickVariant }: {
  section: Section; first: boolean; last: boolean; labels: Map<string, string>; exerciseById: ReadonlyMap<string, Exercise>;
  expanded: Set<string>; onToggle(slotId: string): void; onEdit: Edit; onAdd(): void; onPickVariant(slotId: string, level: VariantLevel, base: Exercise): void;
}) {
  const [confirmRemove, setConfirmRemove] = useState(false);
  return <section className="builder-section" aria-label={section.title}>
    <div className="builder-section-head">
      <TextCommitField label="Section name" className="builder-section-title" value={section.title} onCommit={(title) => onEdit((content) => renameSection(content, section.id, title.trim() || "Section"))} />
      <div className="builder-icon-actions">
        <button type="button" className="spenst-icon-button" aria-label="Move the section up" disabled={first} onClick={() => onEdit((content) => moveSection(content, section.id, -1))}><ArrowUp size={16} /></button>
        <button type="button" className="spenst-icon-button" aria-label="Move the section down" disabled={last} onClick={() => onEdit((content) => moveSection(content, section.id, 1))}><ArrowDown size={16} /></button>
        {confirmRemove
          ? <Button variant="danger" size="sm" onClick={() => onEdit((content) => removeSection(content, section.id))}>Remove the section</Button>
          : <button type="button" className="spenst-icon-button" aria-label="Remove the section" onClick={() => section.slots.length ? setConfirmRemove(true) : onEdit((content) => removeSection(content, section.id))}><Trash2 size={16} /></button>}
      </div>
    </div>
    <div className="spenst-rows">
      {section.slots.map((slot, index) => <SlotCard
        key={slot.id}
        slot={slot}
        label={labels.get(slot.id) ?? ""}
        exerciseById={exerciseById}
        canPair={index > 0}
        first={index === 0}
        last={index === section.slots.length - 1}
        open={expanded.has(slot.id)}
        onToggle={() => onToggle(slot.id)}
        onEdit={onEdit}
        onPickVariant={onPickVariant}
      />)}
    </div>
    <button type="button" className="builder-add" onClick={onAdd}><Plus size={16} />Add an exercise</button>
  </section>;
}

function SlotCard({ slot, label, exerciseById, canPair, first, last, open, onToggle, onEdit, onPickVariant }: {
  slot: ExerciseSlot; label: string; exerciseById: ReadonlyMap<string, Exercise>; canPair: boolean; first: boolean; last: boolean; open: boolean;
  onToggle(): void; onEdit: Edit; onPickVariant(slotId: string, level: VariantLevel, base: Exercise): void;
}) {
  const exercise = exerciseById.get(slot.exerciseId) ?? null;
  const rule = slot.autoregulation;
  const measuresVelocity = exercise?.metrics.includes("velocity") ?? false;

  return <article className={cn("slot-card", slot.pairedWithPrevious && "is-paired")}>
    <div className="slot-head">
      <span className="slot-label" aria-label={`Exercise ${label}`}>{label}</span>
      <button type="button" className="slot-title" onClick={onToggle} aria-expanded={open}>
        <strong>{exercise?.name ?? "Unknown exercise"}</strong>
        <span className="slot-summary">{slot.setGroups.map(describeSetGroup).join(" + ")}</span>
      </button>
      <div className="builder-icon-actions">
        <button type="button" className="spenst-icon-button" aria-label={slot.pairedWithPrevious ? "Unpair from the exercise above" : "Pair with the exercise above"} title="Pair with the exercise above (A1/A2)" aria-pressed={slot.pairedWithPrevious} disabled={!canPair} onClick={() => onEdit((content) => updateSlot(content, slot.id, { pairedWithPrevious: !slot.pairedWithPrevious }))}><Link2 size={16} /></button>
        <button type="button" className="spenst-icon-button" aria-label="Move up" disabled={first} onClick={() => onEdit((content) => moveSlot(content, slot.id, -1))}><ArrowUp size={16} /></button>
        <button type="button" className="spenst-icon-button" aria-label="Move down" disabled={last} onClick={() => onEdit((content) => moveSlot(content, slot.id, 1))}><ArrowDown size={16} /></button>
        <button type="button" className="spenst-icon-button" aria-label="Remove the exercise" onClick={() => onEdit((content) => removeSlot(content, slot.id))}><Trash2 size={16} /></button>
        <button type="button" className="spenst-icon-button" aria-label={open ? "Close" : "Edit"} onClick={onToggle}>{open ? <ChevronUp size={17} /> : <ChevronDown size={17} />}</button>
      </div>
    </div>
    {!open && (rule || slot.note || slot.variants.length > 0) && <p className="slot-note">
      {rule && <Tag tone="sage">Velocity-based</Tag>}
      {slot.variants.map((variant) => <Tag key={variant.id} tone={variant.level < 0 ? "sky" : "apricot"}>{levelLabels[variant.level]}: {exerciseById.get(variant.exerciseId)?.name ?? "unknown"}</Tag>)}
      {slot.note && <span>{slot.note}</span>}
    </p>}

    {open && exercise && <div className="slot-editor">
      <div className="flex flex-wrap gap-2"><Tag tone="neutral">{modalityLabels[exercise.modality]}</Tag>{exercise.unilateral && <Tag tone="neutral">One side at a time</Tag>}{exercise.cue && <span className="slot-cue">{exercise.cue}</span>}</div>
      <SetGroupsEditor slotId={slot.id} level={0} groups={slot.setGroups} exercise={exercise} onEdit={onEdit} />

      {measuresVelocity && <fieldset className={cn("autoreg", rule && "is-on")}>
        <label className="metric-check"><input type="checkbox" checked={rule !== null} onChange={(event) => onEdit((content) => updateSlot(content, slot.id, {
          autoregulation: event.target.checked ? { target: slot.setGroups[0].velocity?.min ?? 0.9, bumpAbove: slot.setGroups[0].velocity?.max ?? 1.05, bumpKg: 10 } : null,
        }))} />Adjust the load by bar speed</label>
        {rule && <div className="autoreg-fields">
          <TargetField label="Green from" unit="m/s" value={{ min: rule.target, max: rule.target }} onCommit={(next) => next && onEdit((content) => updateSlot(content, slot.id, { autoregulation: { ...rule, target: next.min } }))} />
          <TargetField label="Add load above" unit="m/s" value={{ min: rule.bumpAbove, max: rule.bumpAbove }} onCommit={(next) => next && onEdit((content) => updateSlot(content, slot.id, { autoregulation: { ...rule, bumpAbove: next.min } }))} />
          <TargetField label="Add" unit="kg" value={{ min: rule.bumpKg, max: rule.bumpKg }} onCommit={(next) => next && onEdit((content) => updateSlot(content, slot.id, { autoregulation: { ...rule, bumpKg: next.min } }))} />
          <p className="autoreg-explain">After each set: one rep at {decimalText(rule.bumpAbove)} m/s or faster adds {formatTarget({ min: rule.bumpKg, max: rule.bumpKg })} kg. Every rep at {decimalText(rule.target)} m/s or faster: carry on as planned. Otherwise, repeat the load.</p>
        </div>}
      </fieldset>}

      <VariantsEditor slot={slot} base={exercise} exerciseById={exerciseById} onEdit={onEdit} onPick={(level) => onPickVariant(slot.id, level, exercise)} />

      <TextCommitField label="Cue for the athlete" multiline className="slot-note-input" value={slot.note} placeholder="Cue for the athlete (optional)" onCommit={(note) => onEdit((content) => updateSlot(content, slot.id, { note }))} />
    </div>}
  </article>;
}

/** The set groups of a slot (level 0) or of a variant with its own prescription (±1). */
function SetGroupsEditor({ slotId, level, groups, exercise, onEdit }: { slotId: string; level: AthleteLevel; groups: SetGroup[]; exercise: Exercise; onEdit: Edit }) {
  const setGroup = (groupId: string, patch: Partial<Omit<SetGroup, "id">>) => onEdit((content) => updateSetGroup(content, slotId, groupId, patch, level));
  const prescribable = PRESCRIBED.filter((metric) => exercise.metrics.includes(metric));
  const takesLoad = exercise.metrics.includes("load");
  const measuresVelocity = exercise.metrics.includes("velocity");
  return <>
    {groups.map((group, index) => <div key={group.id} className="set-group" role="group" aria-label={`Set group ${index + 1}`}>
      <CountField label="Sets" value={group.count} onCommit={(count) => setGroup(group.id, { count })} />
      {prescribable.map((metric) => <TargetField key={metric} label={metricLabels[metric]} unit={metricUnits[metric]} value={group[metric]} onCommit={(next) => setGroup(group.id, { [metric]: next })} />)}
      {takesLoad && <div className="metric-field is-load">
        <TargetField label="Load" unit="kg" value={group.load} onCommit={(next) => setGroup(group.id, { load: next && { ...next, basis: "kg" } })} />
      </div>}
      {measuresVelocity && <TargetField label="Velocity" unit="m/s" value={group.velocity} onCommit={(next) => setGroup(group.id, { velocity: next })} />}
      <RestField value={group.restSeconds} onCommit={(restSeconds) => setGroup(group.id, { restSeconds })} />
      {exercise.unilateral && <label className="metric-check"><input type="checkbox" checked={group.perSide === true} onChange={(event) => setGroup(group.id, { perSide: event.target.checked || undefined })} />Per side</label>}
      {groups.length > 1 && <button type="button" className="spenst-icon-button set-group-remove" aria-label={`Remove set group ${index + 1}`} onClick={() => onEdit((content) => removeSetGroup(content, slotId, group.id, level))}><Trash2 size={15} /></button>}
    </div>)}
    <button type="button" className="spenst-text-link text-sm" onClick={() => onEdit((content) => addSetGroup(content, slotId, undefined, level))}><Plus size={15} />Add a set group (for a ramp)</button>
  </>;
}

/**
 * Easier and harder versions of the exercise. The team trains one session;
 * each athlete, with the coach, settles which level they do it at.
 */
function VariantsEditor({ slot, base, exerciseById, onEdit, onPick }: { slot: ExerciseSlot; base: Exercise; exerciseById: ReadonlyMap<string, Exercise>; onEdit: Edit; onPick(level: VariantLevel): void }) {
  return <fieldset className="variants">
    <legend>Variants <span>Athlete and coach choose the level together</span></legend>
    {([-1, 1] as const).map((level) => {
      const variant = slot.variants.find((candidate) => candidate.level === level);
      const suggestion = level < 0 ? base.suggestedVariants?.easier : base.suggestedVariants?.harder;
      const suggested = suggestion ? exerciseById.get(suggestion) : null;
      const exercise = variant ? exerciseById.get(variant.exerciseId) ?? null : null;
      return <div key={level} className="variant-row" data-level={level}>
        <span className="variant-level">{levelLabels[level]}</span>
        {variant ? <div className="variant-body">
          <div className="flex flex-wrap items-center gap-2">
            <strong>{exercise?.name ?? "Unknown exercise"}</strong>
            <button type="button" className="spenst-text-link text-xs" onClick={() => onPick(level)}>Change</button>
            <button type="button" className="spenst-text-link text-xs" onClick={() => onEdit((content) => setVariant(content, slot.id, level, null))}>Remove</button>
          </div>
          {variant.setGroups.length
            ? <>{exercise && <SetGroupsEditor slotId={slot.id} level={level} groups={variant.setGroups} exercise={exercise} onEdit={onEdit} />}<button type="button" className="spenst-text-link text-xs" onClick={() => onEdit((content) => updateVariant(content, slot.id, level, { setGroups: [] }))}>Use the main exercise’s prescription</button></>
            : <p className="variant-hint">Same prescription: {slot.setGroups.map(describeSetGroup).join(" + ")}. <button type="button" className="spenst-text-link text-xs" onClick={() => onEdit((content) => detachVariantPrescription(content, slot.id, level))}>Own prescription</button></p>}
        </div> : <div className="variant-body flex flex-wrap items-center gap-2">
          {suggested && <Button variant="secondary" size="sm" onClick={() => onEdit((content) => setVariant(content, slot.id, level, suggested))}><Plus size={14} />{suggested.name}</Button>}
          <button type="button" className="spenst-text-link text-sm" onClick={() => onPick(level)}>{suggested ? "Choose another" : `Add ${levelLabels[level].toLocaleLowerCase("en-GB")} variant`}</button>
        </div>}
      </div>;
    })}
  </fieldset>;
}
