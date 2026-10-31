"use client";

import { CalendarPlus, ChevronRight, Pencil, Plus, Send, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSpenst } from "./app-provider";
import { AppShell } from "./app-shell";
import { PageHeading } from "./page-heading";
import { SeasonTimeline, type TimelineSelection } from "./season-timeline";
import { TextCommitField } from "./target-field";
import { Button, EmptyState, Modal, Tag, inputClass, type TagTone } from "./ui";
import {
  addDays, isoWeek, mondayOf, noteLines, overlapsOnLevel, periodAt, periodEndsOn, periodKindLabels, periodLevelLabels, seasonEndsOn, seasonWeeks,
  spanFromColumns, weekIndex, zoneLabel, type Period, type PeriodKind, type PeriodLevel, type Season,
} from "@/lib/season";
import { summarizeContent } from "@/lib/training";
import type { TrainingSession } from "@/lib/types";
import { VELOCITY_ZONES, type ZoneId } from "@/lib/vbt";
import { cn, countLabel, formatDay, localDateKey } from "@/lib/utils";

const kindTone: Record<PeriodKind, TagTone> = { training: "band1", competition: "sky", break: "rose" };
const shortDay = (dateKey: string) => formatDay(dateKey, { day: "numeric", month: "short" });

type DialogState = { mode: "create"; draft: Omit<Period, "id"> } | { mode: "edit"; draft: Period } | null;

export function SeasonPlanScreen() {
  const { currentTeam, seasons, periods, weekNotes, sessions, workspaceLoaded, createSeason, updateSeason, createPeriod, updatePeriod, deletePeriod } = useSpenst();
  const [today, setToday] = useState<string | null>(null);
  useEffect(() => { const tick = () => setToday(localDateKey(new Date())); tick(); }, []);
  const teamSeasons = useMemo(() => seasons.filter((season) => season.teamId === currentTeam?.id).sort((a, b) => b.startsOn.localeCompare(a.startsOn)), [seasons, currentTeam?.id]);
  const [chosenSeasonId, setChosenSeasonId] = useState<string | null>(null);
  const season = teamSeasons.find((candidate) => candidate.id === chosenSeasonId)
    ?? teamSeasons.find((candidate) => today !== null && weekIndex(candidate, today) !== null)
    ?? teamSeasons[0] ?? null;
  const seasonPeriods = useMemo(() => periods.filter((period) => period.seasonId === season?.id), [periods, season?.id]);
  const teamSessions = useMemo(() => sessions.filter((session) => session.teamId === currentTeam?.id), [sessions, currentTeam?.id]);
  const [selection, setSelection] = useState<TimelineSelection>(null);
  const [dialog, setDialog] = useState<DialogState>(null);

  const openCreate = useCallback((level: PeriodLevel, from: number, to: number) => {
    if (!season) return;
    const span = spanFromColumns(season, from, to);
    setDialog({ mode: "create", draft: { seasonId: season.id, level, kind: "training", title: "", startsOn: span.startsOn, weeks: span.weeks, emphasis: null, focus: "", notes: "" } });
  }, [season]);

  if (!workspaceLoaded) return <AppShell><div className="spenst-page"><p role="status" className="spenst-loading">Loading the season plan …</p></div></AppShell>;
  if (!currentTeam) return <AppShell><div className="spenst-page"><EmptyState icon={<CalendarPlus size={24} />} title="No teams yet" body="When you are added to a team, you can plan its year here." /></div></AppShell>;

  const selectedPeriod = selection?.type === "period" ? seasonPeriods.find((period) => period.id === selection.id) ?? null : null;
  const selectedWeek = selection?.type === "week" && season ? seasonWeeks(season)[selection.index] ?? null : null;

  return <AppShell><div className="spenst-page year-page">
    <PageHeading
      eyebrow={currentTeam.name}
      title={season?.title ?? "Season plan"}
      description={season ? <>{season.weeks} weeks · {shortDay(season.startsOn)} {season.startsOn.slice(0, 4)}–{shortDay(seasonEndsOn(season))} {seasonEndsOn(season).slice(0, 4)} · the whole team trains the same sessions</> : "Lay out the year in phases and blocks, and place the sessions in it."}
      actions={teamSeasons.length > 1 && <select className={cn(inputClass, "w-auto")} aria-label="Season" value={season?.id ?? ""} onChange={(event) => { setChosenSeasonId(event.target.value); setSelection(null); }}>{teamSeasons.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.title}</option>)}</select>}
    />

    {!season ? <NewSeason onCreate={async (input) => { const id = await createSeason(input); setChosenSeasonId(id); }} today={today} /> : <>
      <div className="year-toolbar">
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => openFirstFree(season, seasonPeriods, "phase", openCreate)}><Plus size={15} />New phase</Button>
          <Button variant="secondary" size="sm" onClick={() => openFirstFree(season, seasonPeriods, "block", openCreate)}><Plus size={15} />New block</Button>
        </div>
        <p className="year-hint"><span className="hidden sm:inline">Drag across empty weeks to add a phase or block.</span><span className="sm:hidden">Tap an empty week to add a phase or block.</span> Tap a week under “Sessions” to see its sessions.</p>
      </div>

      <section className="spenst-card year-card" aria-label="Season timeline">
        <SeasonTimeline season={season} periods={seasonPeriods} weekNotes={weekNotes.filter((note) => note.seasonId === season.id)} sessions={teamSessions} today={today} selection={selection} onSelect={setSelection} onCreate={openCreate} />
        <div className="year-footer">
          <label className="year-throughline-field">
            <span>Throughline</span>
            <TextCommitField label="Throughline" className={inputClass} value={season.throughline} placeholder="What happens in every phase, e.g. “Speed-strength every week”" onCommit={(throughline) => void updateSeason(season.id, { throughline: throughline.trim() }).catch(() => undefined)} />
          </label>
          <YearLegend />
        </div>
      </section>

      <div className="mt-5">
        {selectedPeriod ? <PeriodPanel season={season} period={selectedPeriod} periods={seasonPeriods} sessions={teamSessions} onEdit={() => setDialog({ mode: "edit", draft: selectedPeriod })} onDelete={() => { setSelection(null); void deletePeriod(selectedPeriod.id).catch(() => undefined); }} />
          : selectedWeek ? <WeekPanel season={season} weekIndex={selectedWeek.index} periods={seasonPeriods} sessions={teamSessions} />
          : <PhaseOverview season={season} periods={seasonPeriods} sessions={teamSessions} onSelect={(id) => setSelection({ type: "period", id })} />}
      </div>
    </>}

    {dialog && season && <PeriodDialog
      key={dialog.mode === "edit" ? dialog.draft.id : `${dialog.draft.level}-${dialog.draft.startsOn}`}
      season={season}
      periods={seasonPeriods}
      state={dialog}
      onClose={() => setDialog(null)}
      onSave={async (draft) => {
        if (dialog.mode === "create") { const id = await createPeriod(draft); setSelection({ type: "period", id }); }
        else await updatePeriod(dialog.draft.id, draft);
        setDialog(null);
      }}
    />}
  </div></AppShell>;
}

/** “New phase” from the keyboard: the first free run of weeks on that level. */
function openFirstFree(season: Season, periods: readonly Period[], level: PeriodLevel, open: (level: PeriodLevel, from: number, to: number) => void) {
  const weeks = seasonWeeks(season);
  const free = weeks.find((week) => !periodAt(periods, level, week.start));
  const start = free?.index ?? 0;
  let end = start;
  while (end + 1 < weeks.length && end - start < 3 && !periodAt(periods, level, weeks[end + 1].start)) end += 1;
  open(level, start, end);
}

function NewSeason({ onCreate, today }: { onCreate(input: { title: string; startsOn: string; weeks: number }): Promise<void>; today: string | null }) {
  // A handball season starts in August: the first Monday on or after 1 August
  // of this year, or of last year before August.
  const defaultStart = today ? mondayOf(addDays(`${Number(today.slice(5, 7)) >= 8 ? today.slice(0, 4) : Number(today.slice(0, 4)) - 1}-08-01`, 6)) : "";
  const startYear = Number((defaultStart || "2026").slice(0, 4));
  const [title, setTitle] = useState("");
  const [startsOn, setStartsOn] = useState<string | null>(null);
  const [weeks, setWeeks] = useState("52");
  const [busy, setBusy] = useState(false);
  return <form className="spenst-card mx-auto grid max-w-lg gap-3 p-6" onSubmit={async (event) => {
    event.preventDefault();
    const start = startsOn ?? defaultStart; const count = Number(weeks);
    if (busy || !start || !Number.isInteger(count) || count < 4 || count > 60) return;
    setBusy(true);
    try { await onCreate({ title: title || `Season ${startYear}/${String(startYear + 1).slice(2)}`, startsOn: mondayOf(start), weeks: count }); } finally { setBusy(false); }
  }}>
    <h2 className="text-xl font-semibold tracking-[-.03em]">Set up the season</h2>
    <p className="text-sm leading-6 text-[var(--ink-soft)]">A season is a run of weeks. Then you drag out phases and blocks in it, and place the sessions.</p>
    <input className={inputClass} value={title} onChange={(event) => setTitle(event.target.value)} placeholder={`Season ${startYear}/${String(startYear + 1).slice(2)}`} aria-label="Season name" />
    <label className="grid gap-1.5 text-xs font-semibold text-[var(--ink-soft)]">Starts (a Monday)<input className={inputClass} type="date" value={startsOn ?? defaultStart} onChange={(event) => setStartsOn(event.target.value)} required /></label>
    <label className="grid gap-1.5 text-xs font-semibold text-[var(--ink-soft)]">Number of weeks<input className={inputClass} inputMode="numeric" value={weeks} onChange={(event) => setWeeks(event.target.value)} required /></label>
    <Button disabled={busy}><CalendarPlus size={17} />{busy ? "Creating …" : "Create the season"}</Button>
  </form>;
}

function YearLegend() {
  return <ul className="year-legend" aria-label="Legend">
    {(["training", "competition", "break"] as const).map((kind) => <li key={kind}><i className="year-swatch" data-kind={kind} />{periodKindLabels[kind]}</li>)}
    {VELOCITY_ZONES.map((zone) => <li key={zone.id}><i className="year-swatch" data-emphasis={zone.id} />{zone.label}</li>)}
    <li><i className="year-dot is-published" />Published session</li>
    <li><i className="year-dot" />Draft</li>
  </ul>;
}

function PeriodDialog({ season, periods, state, onClose, onSave }: { season: Season; periods: readonly Period[]; state: Exclude<DialogState, null>; onClose(): void; onSave(draft: Omit<Period, "id">): Promise<void> }) {
  const [draft, setDraft] = useState<Omit<Period, "id">>(state.draft);
  const [weeksText, setWeeksText] = useState(String(state.draft.weeks));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const weeks = seasonWeeks(season);
  const set = (patch: Partial<Omit<Period, "id">>) => { setDraft((current) => ({ ...current, ...patch })); setError(null); };
  const clash = overlapsOnLevel(periods, { id: state.mode === "edit" ? state.draft.id : "", level: draft.level, startsOn: draft.startsOn, weeks: draft.weeks });

  return <Modal open title={state.mode === "create" ? `New ${periodLevelLabels[draft.level].toLocaleLowerCase("en-GB")}` : `Edit ${periodLevelLabels[draft.level].toLocaleLowerCase("en-GB")}`} description={draft.level === "phase" ? "A phase is a part of the season with its own aim — pre-season, competition, a break." : "A block is a few weeks with one emphasis — often a velocity zone."} onClose={onClose}>
    <form className="grid gap-4" onSubmit={async (event) => {
      event.preventDefault();
      if (clash) { setError(`Overlaps with “${clash.title}”.`); return; }
      setBusy(true);
      try { await onSave(draft); } catch (caught) { setError(caught instanceof Error ? caught.message : "Couldn’t save."); } finally { setBusy(false); }
    }}>
      {state.mode === "create" && <div className="spenst-segments" role="group" aria-label="Level">
        {(["phase", "block"] as const).map((level) => <button key={level} type="button" aria-pressed={draft.level === level} onClick={() => set({ level })}>{periodLevelLabels[level]}</button>)}
      </div>}
      <label className="grid gap-1.5 text-sm font-semibold">Name<input className={inputClass} value={draft.title} onChange={(event) => set({ title: event.target.value })} placeholder={draft.level === "phase" ? "E.g. Pre-season" : "E.g. Absolute strength"} autoFocus /></label>
      {draft.level === "phase"
        ? <label className="grid gap-1.5 text-sm font-semibold">Type<select className={inputClass} value={draft.kind} onChange={(event) => set({ kind: event.target.value as PeriodKind })}>{(["training", "competition", "break"] as const).map((kind) => <option key={kind} value={kind}>{periodKindLabels[kind]}</option>)}</select></label>
        : <label className="grid gap-1.5 text-sm font-semibold">Emphasis<select className={inputClass} value={draft.emphasis ?? ""} onChange={(event) => set({ emphasis: (event.target.value || null) as ZoneId | null })}><option value="">No particular velocity zone</option>{VELOCITY_ZONES.map((zone) => <option key={zone.id} value={zone.id}>{zone.label} ({zone.min}–{zone.max} m/s)</option>)}</select></label>}
      <div className="grid grid-cols-[1fr_auto] gap-3">
        <label className="grid gap-1.5 text-sm font-semibold">Starts<select className={inputClass} value={draft.startsOn} onChange={(event) => set({ startsOn: event.target.value })}>{weeks.map((week) => <option key={week.start} value={week.start}>Week {week.isoWeek} · {shortDay(week.start)}</option>)}</select></label>
        <label className="grid gap-1.5 text-sm font-semibold">Weeks<input className={cn(inputClass, "w-24")} inputMode="numeric" value={weeksText} onChange={(event) => { setWeeksText(event.target.value); const count = Number(event.target.value); if (Number.isInteger(count) && count >= 1 && count <= 60) set({ weeks: count }); }} /></label>
      </div>
      <p className="-mt-2 text-xs text-[var(--ink-soft)]">{shortDay(draft.startsOn)}–{shortDay(periodEndsOn(draft))}</p>
      <label className="grid gap-1.5 text-sm font-semibold">Focus<input className={inputClass} value={draft.focus} onChange={(event) => set({ focus: event.target.value })} placeholder="One sentence: what the period is for" /></label>
      <label className="grid gap-1.5 text-sm font-semibold">Notes <span className="font-normal text-[var(--ink-soft)]">One point per line</span><textarea className={`${inputClass} min-h-28 py-2.5 leading-6`} value={draft.notes} onChange={(event) => set({ notes: event.target.value })} placeholder={"Acceleration and turns\nInjury prevention every session"} /></label>
      {(error || clash) && <p role="alert" className="rounded-xl bg-[var(--danger-bg)] px-3 py-2 text-sm font-semibold text-[var(--danger)]">{error ?? `Overlaps with “${clash?.title}”. Move or shorten one of them.`}</p>}
      <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button disabled={busy || Boolean(clash)}>{busy ? "Saving …" : "Save"}</Button></div>
    </form>
  </Modal>;
}

function PhaseOverview({ season, periods, sessions, onSelect }: { season: Season; periods: readonly Period[]; sessions: readonly TrainingSession[]; onSelect(id: string): void }) {
  const phases = periods.filter((period) => period.level === "phase").sort((a, b) => a.startsOn.localeCompare(b.startsOn));
  if (!phases.length) return <EmptyState icon={<CalendarPlus size={24} />} title="No phases yet" body="Drag across the weeks under “Phases” to divide the season — pre-season, competition, breaks." />;
  return <div className="phase-cards">
    {phases.map((phase) => {
      const count = sessions.filter((session) => session.scheduledOn && session.scheduledOn >= phase.startsOn && session.scheduledOn <= periodEndsOn(phase)).length;
      return <button key={phase.id} type="button" className="phase-card" data-kind={phase.kind} onClick={() => onSelect(phase.id)}>
        <span className="phase-card-head"><strong>{phase.title}</strong><ChevronRight size={16} aria-hidden="true" /></span>
        <small>{shortDay(phase.startsOn)}–{shortDay(periodEndsOn(phase))} · {countLabel(phase.weeks, "week", "weeks")} · {countLabel(count, "session", "sessions")}</small>
        {phase.focus && <p className="phase-card-focus">{phase.focus}</p>}
        {noteLines(phase.notes).length > 0 && <ul>{noteLines(phase.notes).map((line) => <li key={line}>{line}</li>)}</ul>}
        {season.throughline && phase.kind !== "break" && <em>“{season.throughline}”</em>}
      </button>;
    })}
  </div>;
}

function PeriodPanel({ season, period, periods, sessions, onEdit, onDelete }: { season: Season; period: Period; periods: readonly Period[]; sessions: readonly TrainingSession[]; onEdit(): void; onDelete(): void }) {
  const { setSessionsStatus } = useSpenst();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const inPeriod = sessions.filter((session) => session.scheduledOn && session.scheduledOn >= period.startsOn && session.scheduledOn <= periodEndsOn(period));
  const drafts = inPeriod.filter((session) => session.status === "draft");
  const weeks = Array.from({ length: period.weeks }, (_, index) => addDays(period.startsOn, index * 7));
  return <section className="spenst-card period-panel" aria-labelledby="period-title">
    <header className="period-panel-head">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Tag tone={period.level === "phase" ? kindTone[period.kind] : "neutral"}>{period.level === "phase" ? periodKindLabels[period.kind] : periodLevelLabels.block}</Tag>
          {period.emphasis && <Tag tone="sage">{zoneLabel(period.emphasis)}</Tag>}
        </div>
        <h2 id="period-title">{period.title}</h2>
        <p className="period-dates">Weeks {isoWeek(period.startsOn)}–{isoWeek(periodEndsOn(period))} · {shortDay(period.startsOn)}–{shortDay(periodEndsOn(period))} · {countLabel(period.weeks, "week", "weeks")} · {countLabel(inPeriod.length, "session", "sessions")}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {drafts.length > 0 && <Button size="sm" onClick={() => void setSessionsStatus(drafts.map((session) => session.id), "published").catch(() => undefined)}><Send size={15} />Publish {countLabel(drafts.length, "draft", "drafts")}</Button>}
        <Button variant="secondary" size="sm" onClick={onEdit}><Pencil size={15} />Edit</Button>
        {confirmDelete ? <Button variant="danger" size="sm" onClick={onDelete}>Delete the {period.level}</Button> : <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(true)} aria-label="Delete"><Trash2 size={15} /></Button>}
      </div>
    </header>
    {(period.focus || period.notes) && <div className="period-focus">
      {period.focus && <p className="period-focus-line">{period.focus}</p>}
      {noteLines(period.notes).length > 0 && <ul>{noteLines(period.notes).map((line) => <li key={line}>{line}</li>)}</ul>}
    </div>}
    <h3 className="period-weeks-head">Week by week</h3>
    <div className="spenst-rows">
      {weeks.map((weekStart, index) => <WeekRow key={weekStart} season={season} weekStart={weekStart} label={`Week ${index + 1}`} periods={periods} sessions={sessions} showBlock={period.level === "phase"} />)}
    </div>
  </section>;
}

function WeekPanel({ season, weekIndex: index, periods, sessions }: { season: Season; weekIndex: number; periods: readonly Period[]; sessions: readonly TrainingSession[] }) {
  const weekStart = addDays(season.startsOn, index * 7);
  const phase = periodAt(periods, "phase", weekStart);
  const block = periodAt(periods, "block", weekStart);
  return <section className="spenst-card period-panel" aria-labelledby="week-title">
    <header className="period-panel-head">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          {phase && <Tag tone={kindTone[phase.kind]}>{phase.title}</Tag>}
          {block && <Tag tone="sage">{block.title}</Tag>}
        </div>
        <h2 id="week-title">Week {isoWeek(weekStart)}</h2>
        <p className="period-dates">{formatDay(weekStart, { weekday: "long", day: "numeric", month: "long" })} – {formatDay(addDays(weekStart, 6), { weekday: "long", day: "numeric", month: "long" })}</p>
      </div>
    </header>
    {(block?.focus || phase?.focus) && <div className="period-focus"><p className="period-focus-line">{block?.focus || phase?.focus}</p></div>}
    <div className="spenst-rows"><WeekRow season={season} weekStart={weekStart} label="Sessions" periods={periods} sessions={sessions} showBlock={false} expanded /></div>
  </section>;
}

/** One line of Ballou’s week table: dates, the block, a label, the sessions — and a way to add one. */
function WeekRow({ season, weekStart, label, periods, sessions, showBlock, expanded = false }: { season: Season; weekStart: string; label: string; periods: readonly Period[]; sessions: readonly TrainingSession[]; showBlock: boolean; expanded?: boolean }) {
  const { weekNotes, setWeekNote, createSession, exerciseById } = useSpenst();
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const weekEnd = addDays(weekStart, 6);
  const note = weekNotes.find((entry) => entry.seasonId === season.id && entry.weekStart === weekStart)?.label ?? "";
  const block = showBlock ? periodAt(periods, "block", weekStart) : null;
  const inWeek = sessions.filter((session) => session.scheduledOn && session.scheduledOn >= weekStart && session.scheduledOn <= weekEnd).sort((a, b) => (a.scheduledOn ?? "").localeCompare(b.scheduledOn ?? ""));

  async function add() {
    if (adding) return;
    setAdding(true);
    // On the Tuesday by default — the coach moves it in the builder.
    try { const id = await createSession({ title: "Session", scheduledOn: addDays(weekStart, 1) }); router.push(`/plan/sessions/${id}`); }
    catch { setAdding(false); }
  }

  return <div className={cn("week-row", expanded && "is-expanded")}>
    <div className="week-row-when">
      <strong>{label}</strong>
      <small>{shortDay(weekStart)}–{shortDay(weekEnd)}</small>
    </div>
    <div className="week-row-what">
      <div className="flex flex-wrap items-center gap-2">
        {block && <Tag tone="sage">{block.title}</Tag>}
        <TextCommitField label={`Note for the week starting ${shortDay(weekStart)}`} className="week-note-input" value={note} placeholder="Note, e.g. “Match week ×2”" onCommit={(next) => void setWeekNote(season.id, weekStart, next).catch(() => undefined)} />
      </div>
      <ul className="week-sessions">
        {inWeek.map((session) => {
          const summary = summarizeContent(session.content, exerciseById);
          return <li key={session.id}><Link href={`/plan/sessions/${session.id}`} className="week-session">
            <span className={cn("year-dot", session.status === "published" && "is-published")} aria-hidden="true" />
            <span className="min-w-0 flex-1"><strong>{session.scheduledOn ? formatDay(session.scheduledOn, { weekday: "short" }) : ""} · {session.title}</strong><small>{summary.exercises ? `${countLabel(summary.exercises, "exercise", "exercises")} · about ${summary.minutes} min` : "Empty"}{session.status === "draft" ? " · draft" : ""}</small></span>
            <ChevronRight size={16} aria-hidden="true" />
          </Link></li>;
        })}
        <li><button type="button" className="week-add" onClick={() => void add()} disabled={adding}><Plus size={14} />{adding ? "Creating …" : "New session"}</button></li>
      </ul>
    </div>
  </div>;
}
