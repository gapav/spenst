"use client";

import { ClipboardPaste, Copy, CopyPlus, Plus, Search, Star, Trash2, Trophy } from "lucide-react";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { useSpenst } from "./app-provider";
import { TextCommitField } from "./target-field";
import { Button, Modal, Tag, inputClass } from "./ui";
import { isCongestedWeek, matchDayLabel, matchKindLabels, matchTitle, type MatchDayLabel } from "@/lib/match-days";
import { compareSessions, pastePlacements, prescriptionText, progressionMatrix, rankCopySources, restOfPeriodWeeks, weekCopyPlacements, weekSummary, type Placement, type WeekSummary } from "@/lib/planning";
import { addDays, isoWeek, periodAt, seasonEndsOn, seasonWeeks, type Period, type Season } from "@/lib/season";
import { allSlots, summarizeContent, type Modality } from "@/lib/training";
import type { Match, MatchKind, SessionSlot, TrainingSession } from "@/lib/types";
import { cn, countLabel, formatDay } from "@/lib/utils";

/**
 * Planning a season week by week (decision 24, issues #5, #21 and #22).
 * Every week is a Monday–Sunday strip; every day has a “+” for a session or
 * a match, and carries its match-day label. Sessions are chips that open in
 * the drawer, show their content on hover, drag to another day (⌥ to copy),
 * and copy and paste with ⌘C / ⌘V. Every change can be undone from the toast.
 * Copies are independent: nothing links a copy to where it came from.
 *
 * `PlannerProvider` holds what the strips share — the selection, the
 * clipboard, the day being pointed at, the dialogs and the undo toast — and
 * the keyboard shortcuts.
 */

type Zone = SessionSlot | "keep";
type MatchDialogState = { mode: "create"; date: string } | { mode: "edit"; match: Match } | null;
type Toast = { id: number; message: string; undo?: () => Promise<unknown> } | null;

interface PlannerValue {
  season: Season;
  periods: readonly Period[];
  sessions: readonly TrainingSession[];
  matches: readonly Match[];
  today: string | null;
  selection: ReadonlySet<string>;
  clipboard: readonly string[];
  activeDay: string | null;
  dragging: readonly string[] | null;
  sessionsOn(date: string): TrainingSession[];
  matchesOn(date: string): Match[];
  matchDay(date: string): MatchDayLabel | null;
  setActiveDay(date: string | null): void;
  select(id: string, additive: boolean): void;
  openSession(id: string): void;
  addSession(date: string): void;
  paste(target: string): void;
  startDrag(id: string): readonly string[];
  endDrag(): void;
  drop(target: string, zone: Zone, copy: boolean): void;
  copyWeek(weekStart: string, targets: string[]): void;
  openMatch(state: MatchDialogState): void;
  openCopyOf(date: string): void;
  openCopyWeeks(weekStart: string): void;
  requestDelete(ids: string[]): void;
  showPreview(id: string, anchor: HTMLElement): void;
  hidePreview(): void;
}

const PlannerContext = createContext<PlannerValue | null>(null);
function usePlanner() {
  const value = useContext(PlannerContext);
  if (!value) throw new Error("usePlanner must be used inside <PlannerProvider>");
  return value;
}

const isTyping = (target: EventTarget | null) => target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
const inDialog = (target: EventTarget | null) => target instanceof HTMLElement && target.closest("[role=dialog]") !== null;
const slotLabel = (slot: SessionSlot) => slot === "am" ? "AM" : "PM";

export function PlannerProvider({ season, periods, sessions, matches, today, children }: { season: Season; periods: readonly Period[]; sessions: readonly TrainingSession[]; matches: readonly Match[]; today: string | null; children: ReactNode }) {
  const { createSession, copySessions, moveSessions, deleteSessions, restoreSessions } = useSpenst();
  const router = useRouter();
  const [chosen, setSelection] = useState<ReadonlySet<string>>(new Set());
  const [clipboard, setClipboard] = useState<string[]>([]);
  const [activeDay, setActiveDay] = useState<string | null>(null);
  const [dragging, setDragging] = useState<readonly string[] | null>(null);
  const [matchDialog, setMatchDialog] = useState<MatchDialogState>(null);
  const [copyOf, setCopyOf] = useState<string | null>(null);
  const [copyWeeks, setCopyWeeks] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string[] | null>(null);
  const [toast, setToast] = useState<Toast>(null);
  const [preview, setPreview] = useState<{ id: string; rect: DOMRect } | null>(null);
  const previewTimer = useRef<number | null>(null);

  const byDay = useMemo(() => {
    const map = new Map<string, TrainingSession[]>();
    for (const session of [...sessions].sort(compareSessions)) if (session.scheduledOn) map.set(session.scheduledOn, [...(map.get(session.scheduledOn) ?? []), session]);
    return map;
  }, [sessions]);
  const matchesByDay = useMemo(() => {
    const map = new Map<string, Match[]>();
    for (const match of matches) map.set(match.playedOn, [...(map.get(match.playedOn) ?? []), match]);
    return map;
  }, [matches]);
  const sessionById = useMemo(() => new Map(sessions.map((session) => [session.id, session])), [sessions]);

  const say = useCallback((message: string, undo?: () => Promise<unknown>) => setToast({ id: Date.now(), message, undo }), []);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), toast.undo ? 7000 : 3500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  // A selection only holds sessions that still exist — a deleted one drops out.
  const selection = useMemo<ReadonlySet<string>>(() => { const kept = [...chosen].filter((id) => sessionById.has(id)); return kept.length === chosen.size ? chosen : new Set(kept); }, [chosen, sessionById]);

  const copyTo = useCallback(async (sources: TrainingSession[], placements: Placement[], message: string) => {
    try {
      const ids = await copySessions(sources.map((source, index) => ({ source, placement: placements[index] })));
      say(message, () => deleteSessions(ids));
    } catch { /* the provider has said what went wrong */ }
  }, [copySessions, deleteSessions, say]);

  const paste = useCallback((target: string) => {
    const sources = clipboard.map((id) => sessionById.get(id)).filter((session): session is TrainingSession => Boolean(session));
    if (!sources.length) return;
    void copyTo(sources, pastePlacements(sources, target), `Pasted ${countLabel(sources.length, "session", "sessions")} on ${formatDay(target)}`);
  }, [clipboard, copyTo, sessionById]);

  const drop = useCallback((target: string, zone: Zone, copy: boolean) => {
    const ids = dragging ?? [];
    setDragging(null);
    const sources = ids.map((id) => sessionById.get(id)).filter((session): session is TrainingSession => Boolean(session));
    if (!sources.length) return;
    // The dragged session is the first id: it lands on the target, the rest keep their distance.
    const placements = pastePlacements(sources, target, sources[0].scheduledOn).map((placement) => zone === "keep" ? placement : { ...placement, slot: zone });
    if (copy) { void copyTo(sources, placements, `Copied ${countLabel(sources.length, "session", "sessions")} to ${formatDay(target)}`); return; }
    const moves = sources.map((source, index) => ({ id: source.id, ...placements[index] }));
    if (moves.every((move, index) => move.scheduledOn === sources[index].scheduledOn && move.slot === sources[index].slot)) return;
    const previous = sources.map((source) => ({ id: source.id, scheduledOn: source.scheduledOn, slot: source.slot }));
    void moveSessions(moves).then(() => say(`Moved ${countLabel(sources.length, "session", "sessions")} to ${formatDay(target)}`, () => moveSessions(previous))).catch(() => undefined);
  }, [copyTo, dragging, moveSessions, say, sessionById]);

  const copyWeek = useCallback((weekStart: string, targets: string[]) => {
    const sources = (byDay.size ? [...Array(7)].flatMap((_, index) => byDay.get(addDays(weekStart, index)) ?? []) : []);
    if (!sources.length || !targets.length) return;
    const all = targets.flatMap(() => sources);
    const placements = targets.flatMap((target) => weekCopyPlacements(sources, weekStart, target));
    void copyTo(all, placements, `Copied week ${isoWeek(weekStart)} to ${targets.length === 1 ? `week ${isoWeek(targets[0])}` : `${targets.length} weeks`}`);
  }, [byDay, copyTo]);

  const removeSessions = useCallback(async (ids: string[]) => {
    try {
      const removed = await deleteSessions(ids);
      if (removed.length) say(`Deleted ${countLabel(removed.length, "session", "sessions")}`, () => restoreSessions(removed));
    } catch { /* reported by the provider */ }
  }, [deleteSessions, restoreSessions, say]);

  const requestDelete = useCallback((ids: string[]) => {
    if (!ids.length) return;
    if (ids.length === 1) void removeSessions(ids);
    else setConfirmDelete(ids);
  }, [removeSessions]);

  const openSession = useCallback((id: string) => { setPreview(null); router.push(`/plan/sessions/${id}`); }, [router]);
  const addSession = useCallback((date: string) => {
    void createSession({ title: "Session", scheduledOn: date }).then(openSession).catch(() => undefined);
  }, [createSession, openSession]);

  const hidePreview = useCallback(() => { if (previewTimer.current) window.clearTimeout(previewTimer.current); previewTimer.current = null; setPreview(null); }, []);
  const showPreview = useCallback((id: string, anchor: HTMLElement) => {
    if (previewTimer.current) window.clearTimeout(previewTimer.current);
    previewTimer.current = window.setTimeout(() => setPreview({ id, rect: anchor.getBoundingClientRect() }), 300);
  }, []);

  // The shortcuts: ⌘C / ⌘V, Delete, Escape. Never while typing, and never
  // for a dialog (the drawer, a modal) that has the focus.
  useEffect(() => {
    const focusedSession = () => (document.activeElement as HTMLElement | null)?.closest<HTMLElement>("[data-session-id]")?.dataset.sessionId ?? null;
    const focusedDay = () => (document.activeElement as HTMLElement | null)?.closest<HTMLElement>("[data-day]")?.dataset.day ?? null;
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTyping(event.target) || inDialog(event.target) || document.querySelector("[role=dialog][aria-modal=true]")) return;
      const mod = event.metaKey || event.ctrlKey;
      const chosen = selection.size ? [...selection] : [focusedSession()].filter((id): id is string => id !== null);
      if (mod && event.key.toLowerCase() === "c" && chosen.length) {
        event.preventDefault();
        setClipboard(chosen);
        say(`Copied ${countLabel(chosen.length, "session", "sessions")}. Pick a day and press ${navigator.platform.includes("Mac") ? "⌘" : "Ctrl+"}V.`);
      } else if (mod && event.key.toLowerCase() === "v") {
        const target = activeDay ?? focusedDay();
        if (target && clipboard.length) { event.preventDefault(); paste(target); }
      } else if ((event.key === "Delete" || event.key === "Backspace") && chosen.length) {
        event.preventDefault();
        requestDelete(chosen);
      } else if (event.key === "Escape" && (selection.size || activeDay)) {
        // Handled: the season plan must not also close the panel.
        event.preventDefault();
        setSelection(new Set()); setActiveDay(null);
      }
    };
    // Capture, so this runs before the season plan's own Escape (which closes the panel)
    // however often this listener is re-added.
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [activeDay, clipboard.length, paste, requestDelete, say, selection]);

  const value = useMemo<PlannerValue>(() => ({
    season, periods, sessions, matches, today, selection, clipboard, activeDay, dragging,
    sessionsOn: (date) => byDay.get(date) ?? [],
    matchesOn: (date) => matchesByDay.get(date) ?? [],
    matchDay: (date) => matchDayLabel(date, matches),
    setActiveDay,
    select: (id, additive) => setSelection((current) => {
      if (!additive) return new Set([id]);
      const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next;
    }),
    openSession, addSession, paste,
    startDrag: (id) => {
      hidePreview();
      const ids = selection.has(id) ? [id, ...[...selection].filter((other) => other !== id)] : [id];
      setDragging(ids);
      return ids;
    },
    endDrag: () => setDragging(null),
    drop, copyWeek,
    openMatch: setMatchDialog, openCopyOf: setCopyOf, openCopyWeeks: setCopyWeeks,
    requestDelete, showPreview, hidePreview,
  }), [activeDay, addSession, byDay, clipboard, copyWeek, dragging, drop, hidePreview, matches, matchesByDay, openSession, paste, periods, requestDelete, season, selection, sessions, showPreview, today]);

  const previewed = preview ? sessionById.get(preview.id) ?? null : null;
  return <PlannerContext.Provider value={value}>
    {children}
    {matchDialog && <MatchDialog key={matchDialog.mode === "edit" ? matchDialog.match.id : matchDialog.date} state={matchDialog} onClose={() => setMatchDialog(null)} />}
    {copyOf && <CopyOfDialog date={copyOf} onClose={() => setCopyOf(null)} onPick={(source) => {
      setCopyOf(null);
      void copyTo([source], [{ scheduledOn: copyOf, slot: source.slot }], `Copied “${source.title}” to ${formatDay(copyOf)}`);
    }} />}
    {copyWeeks && <CopyWeeksDialog weekStart={copyWeeks} onClose={() => setCopyWeeks(null)} onCopy={(targets) => { setCopyWeeks(null); copyWeek(copyWeeks, targets); }} />}
    <Modal open={confirmDelete !== null} size="sm" title={`Delete ${countLabel(confirmDelete?.length ?? 0, "session", "sessions")}?`} description="You can undo it straight after." onClose={() => setConfirmDelete(null)}>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => setConfirmDelete(null)}>Cancel</Button>
        <Button variant="danger" onClick={() => { const ids = confirmDelete ?? []; setConfirmDelete(null); setSelection(new Set()); void removeSessions(ids); }}><Trash2 size={15} />Delete {countLabel(confirmDelete?.length ?? 0, "session", "sessions")}</Button>
      </div>
    </Modal>
    {previewed && preview && !dragging && <SessionPreview session={previewed} rect={preview.rect} />}
    {toast && typeof document !== "undefined" && createPortal(<div className="planner-toast" role="status" key={toast.id}>
      <span>{toast.message}</span>
      {toast.undo && <button type="button" onClick={() => { const undo = toast.undo; setToast(null); void undo?.().catch(() => undefined); }}>Undo</button>}
    </div>, document.body)}
  </PlannerContext.Provider>;
}

// ---------------------------------------------------------------------------
// A week

const MIX: { label: string; modalities: Modality[]; color: string }[] = [
  { label: "Strength", modalities: ["strength", "isometric"], color: "var(--mix-strength)" },
  { label: "Power and Olympic", modalities: ["power", "olympic", "med-ball"], color: "var(--mix-power)" },
  { label: "Plyometrics", modalities: ["plyometric"], color: "var(--mix-plyometric)" },
  { label: "Sprint", modalities: ["sprint"], color: "var(--mix-sprint)" },
  { label: "Prep and conditioning", modalities: ["prep", "conditioning"], color: "var(--mix-prep)" },
];

/** “3 sessions · about 140 min · 45 contacts”, and the week's mix of work as one small stacked bar. */
export function WeekSummaryLine({ summary, compact = false }: { summary: WeekSummary; compact?: boolean }) {
  const parts = MIX.map((family) => ({ ...family, sets: family.modalities.reduce((total, modality) => total + (summary.modalities[modality] ?? 0), 0) })).filter((part) => part.sets > 0);
  const total = parts.reduce((sum, part) => sum + part.sets, 0);
  const description = parts.map((part) => `${part.label} ${countLabel(part.sets, "set", "sets")}`).join(", ");
  if (!summary.sessions) return <span className="week-summary is-empty">No sessions</span>;
  return <span className={cn("week-summary", compact && "is-compact")}>
    <span>{countLabel(summary.sessions, "session", "sessions")} · about {summary.minutes} min{summary.contacts > 0 ? ` · ${summary.contacts} contacts` : ""}</span>
    {total > 0 && <span className="mix-bar" role="img" aria-label={`Mix: ${description}`} title={description}>
      {parts.map((part) => <i key={part.label} style={{ flexGrow: part.sets, background: part.color }} />)}
    </span>}
  </span>;
}

export function MixLegend() {
  return <ul className="mix-legend" aria-label="Colours in the mix bar">
    {MIX.map((family) => <li key={family.label}><i style={{ background: family.color }} />{family.label}</li>)}
  </ul>;
}

/** One week as seven days, with its label, block, summary and a way to copy it. */
export function WeekStrip({ weekStart, label, showBlock }: { weekStart: string; label: string; showBlock: boolean }) {
  const { season, periods, matches, sessionsOn } = usePlanner();
  const { weekNotes, setWeekNote, exerciseById } = useSpenst();
  const note = weekNotes.find((entry) => entry.seasonId === season.id && entry.weekStart === weekStart)?.label ?? "";
  const block = showBlock ? periodAt(periods, "block", weekStart) : null;
  const days = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
  const inWeek = days.flatMap(sessionsOn);
  const congested = isCongestedWeek(weekStart, matches);
  return <section className="week-strip" aria-label={`${label}, ${formatDay(weekStart, { day: "numeric", month: "short" })} to ${formatDay(addDays(weekStart, 6), { day: "numeric", month: "short" })}`}>
    <header className="week-strip-head">
      <div className="week-strip-when"><strong>{label}</strong><small>Week {isoWeek(weekStart)} · {formatDay(weekStart, { day: "numeric", month: "short" })}–{formatDay(addDays(weekStart, 6), { day: "numeric", month: "short" })}</small></div>
      {block && <Tag tone="sage">{block.title}</Tag>}
      {congested && <Tag tone="rose">Congested</Tag>}
      <TextCommitField label={`Note for the week starting ${formatDay(weekStart)}`} className="week-note-input" value={note} placeholder="Note, e.g. “Deload”" onCommit={(next) => void setWeekNote(season.id, weekStart, next).catch(() => undefined)} />
      <WeekSummaryLine summary={weekSummary(inWeek, exerciseById)} />
      <CopyWeekMenu weekStart={weekStart} disabled={!inWeek.length} />
    </header>
    <div className="day-grid">{days.map((date) => <DayCell key={date} date={date} />)}</div>
  </section>;
}

function CopyWeekMenu({ weekStart, disabled }: { weekStart: string; disabled: boolean }) {
  const { season, periods, copyWeek, openCopyWeeks } = usePlanner();
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const next = addDays(weekStart, 7);
  const block = periodAt(periods, "block", weekStart);
  const rest = block ? restOfPeriodWeeks(weekStart, block) : [];
  const close = () => setOpen(false);
  return <>
    <Button ref={anchor} variant="ghost" size="sm" className="week-copy" disabled={disabled} onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="menu" title={disabled ? "Nothing to copy yet" : undefined}><Copy size={15} />Copy week</Button>
    {open && <Popover anchor={anchor} onClose={close}>
      <MenuItem disabled={next > seasonEndsOn(season)} onClick={() => { close(); copyWeek(weekStart, [next]); }}>To next week <small>week {isoWeek(next)}</small></MenuItem>
      {block && <MenuItem disabled={!rest.length} onClick={() => { close(); copyWeek(weekStart, rest); }}>To the rest of the block <small>{rest.length ? countLabel(rest.length, "week", "weeks") : "this is its last week"}</small></MenuItem>}
      <MenuItem onClick={() => { close(); openCopyWeeks(weekStart); }}>To weeks …</MenuItem>
    </Popover>}
  </>;
}

// ---------------------------------------------------------------------------
// A day

function DayCell({ date, compact = false, detailed = false }: { date: string; compact?: boolean; detailed?: boolean }) {
  const { sessionsOn, matchesOn, matchDay, activeDay, setActiveDay, dragging, drop, today, endDrag } = usePlanner();
  const [over, setOver] = useState<Zone | null>(null);
  const sessions = sessionsOn(date);
  const matches = matchesOn(date);
  const label = matchDay(date);
  const empty = !sessions.length && !matches.length;
  const zoneOf = (target: EventTarget | null): Zone => (target instanceof HTMLElement ? target.closest<HTMLElement>("[data-zone]")?.dataset.zone as Zone | undefined : undefined) ?? "keep";
  return <div
    className={cn("day-cell", compact && "is-compact", empty && "is-empty", activeDay === date && "is-active", date === today && "is-today", matches.length > 0 && "has-match", over && "is-drop-target")}
    data-day={date}
    onClick={(event) => { if (!(event.target as HTMLElement).closest("button, a, input")) setActiveDay(activeDay === date ? null : date); }}
    onDragOver={(event) => {
      if (!dragging) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = event.altKey ? "copy" : "move";
      const zone = zoneOf(event.target);
      if (zone !== over) setOver(zone);
    }}
    onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(null); }}
    onDrop={(event) => { event.preventDefault(); const zone = zoneOf(event.target); setOver(null); drop(date, zone, event.altKey); endDrag(); }}
  >
    <div className="day-head">
      <span className="day-name">{formatDay(date, { weekday: "short" })} <b>{formatDay(date, { day: "numeric" })}</b></span>
      {label && <span className={cn("md-label", label.label === "MD" && "is-match")} title={`${label.label} — ${matchTitle(label.match)}`}>{label.label}</span>}
      <AddMenu date={date} />
    </div>
    {!empty && <ul className="day-items">
      {matches.map((match) => <MatchChip key={match.id} match={match} />)}
      {sessions.map((session) => <SessionChip key={session.id} session={session} detailed={detailed} />)}
    </ul>}
    {dragging && over && <div className="day-drop-zones" aria-hidden="true">
      <span data-zone="am" className={cn(over === "am" && "is-over")}>AM</span>
      <span data-zone="keep" className={cn(over === "keep" && "is-over")}>Here</span>
      <span data-zone="pm" className={cn(over === "pm" && "is-over")}>PM</span>
    </div>}
  </div>;
}

function AddMenu({ date }: { date: string }) {
  const { addSession, openMatch, openCopyOf, paste, clipboard } = usePlanner();
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const close = () => setOpen(false);
  return <>
    <button ref={anchor} type="button" className="day-add" aria-label={`Add to ${formatDay(date, { weekday: "long", day: "numeric", month: "long" })}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}><Plus size={15} /></button>
    {open && <Popover anchor={anchor} onClose={close}>
      <MenuItem onClick={() => { close(); addSession(date); }}><Plus size={15} />Session</MenuItem>
      <MenuItem onClick={() => { close(); openCopyOf(date); }}><CopyPlus size={15} />Copy of …</MenuItem>
      {clipboard.length > 0 && <MenuItem onClick={() => { close(); paste(date); }}><ClipboardPaste size={15} />Paste {countLabel(clipboard.length, "session", "sessions")}</MenuItem>}
      <MenuItem onClick={() => { close(); openMatch({ mode: "create", date }); }}><Trophy size={15} />Match</MenuItem>
    </Popover>}
  </>;
}

function MatchChip({ match }: { match: Match }) {
  const { openMatch } = usePlanner();
  return <li><button type="button" className={cn("match-chip", match.priority && "is-priority")} onClick={() => openMatch({ mode: "edit", match })} title={[matchKindLabels[match.kind], match.note].filter(Boolean).join(" — ")}>
    <Trophy size={13} aria-hidden="true" />
    <span className="min-w-0 flex-1"><strong>{matchTitle(match)}</strong><small>{[match.kickOff, match.kind !== "league" ? matchKindLabels[match.kind] : null].filter(Boolean).join(" · ") || "Match"}</small></span>
    {match.priority && <Star size={12} aria-label="Priority match" />}
  </button></li>;
}

function SessionChip({ session, detailed }: { session: TrainingSession; detailed: boolean }) {
  const { selection, select, openSession, startDrag, endDrag, showPreview, hidePreview } = usePlanner();
  const { exerciseById } = useSpenst();
  const summary = summarizeContent(session.content, exerciseById);
  const selected = selection.has(session.id);
  return <li><button
    type="button"
    draggable
    data-session-id={session.id}
    className={cn("session-chip", selected && "is-selected", session.status === "draft" && "is-draft")}
    aria-pressed={selected}
    aria-label={`${session.title}${session.slot ? `, ${slotLabel(session.slot)}` : ""}${session.status === "draft" ? ", draft" : ""}. Enter opens it; Shift-click selects.`}
    onClick={(event) => {
      if (event.shiftKey || event.metaKey || event.ctrlKey) select(session.id, true);
      else openSession(session.id);
    }}
    onDragStart={(event) => {
      const ids = startDrag(session.id);
      event.dataTransfer.effectAllowed = "copyMove";
      event.dataTransfer.setData("text/plain", ids.join(","));
    }}
    onDragEnd={endDrag}
    onMouseEnter={(event) => showPreview(session.id, event.currentTarget)}
    onMouseLeave={hidePreview}
    onFocus={(event) => showPreview(session.id, event.currentTarget)}
    onBlur={hidePreview}
  >
    <span className="chip-line">
      {session.slot && <span className="slot-badge">{slotLabel(session.slot)}</span>}
      <strong>{session.title}</strong>
    </span>
    <small>{summary.exercises ? `about ${summary.minutes} min` : "Empty"}{session.status === "draft" ? " · draft" : ""}</small>
    {detailed && summary.exercises > 0 && <ul className="chip-exercises">{allSlots(session.content).map((slot) => <li key={slot.id}>{exerciseById.get(slot.exerciseId)?.name ?? "Exercise"}</li>)}</ul>}
  </button></li>;
}

function SessionPreview({ session, rect }: { session: TrainingSession; rect: DOMRect }) {
  const { exerciseById } = useSpenst();
  const width = 320;
  const left = Math.min(Math.max(8, rect.left), window.innerWidth - width - 8);
  const below = rect.bottom + 8;
  const style = below + 240 > window.innerHeight ? { left, bottom: window.innerHeight - rect.top + 8, width } : { left, top: below, width };
  return createPortal(<div className="session-preview" style={style} role="tooltip">
    <p className="session-preview-title">{session.title}{session.status === "draft" && <span> · draft</span>}</p>
    {!session.content.sections.length && <p className="session-preview-empty">Nothing in it yet.</p>}
    {session.content.sections.map((section) => <div key={section.id}>
      <p className="session-preview-section">{section.title}</p>
      <ul>{section.slots.map((slot) => <li key={slot.id}><span>{exerciseById.get(slot.exerciseId)?.name ?? "Exercise"}</span><small>{prescriptionText(slot.setGroups)}</small></li>)}</ul>
    </div>)}
  </div>, document.body);
}

// ---------------------------------------------------------------------------
// A block at a glance

/** The block's weeks as rows and Monday–Sunday as columns. */
export function CalendarGrid({ weeks, detailed, showBlock }: { weeks: readonly string[]; detailed: boolean; showBlock: boolean }) {
  const { sessionsOn, matches, periods, season } = usePlanner();
  const { exerciseById, weekNotes } = useSpenst();
  return <div className="calendar-grid" role="grid" aria-label="Calendar">
    <div className="calendar-row is-head" role="row">
      <span role="columnheader">Week</span>
      {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => <span key={day} role="columnheader">{day}</span>)}
    </div>
    {weeks.map((weekStart) => {
      const days = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
      const note = weekNotes.find((entry) => entry.seasonId === season.id && entry.weekStart === weekStart)?.label;
      const block = showBlock ? periodAt(periods, "block", weekStart) : null;
      return <div key={weekStart} className="calendar-row" role="row">
        <div className="calendar-week" role="rowheader">
          <strong>Week {isoWeek(weekStart)}</strong>
          <small>{formatDay(weekStart, { day: "numeric", month: "short" })}</small>
          {block && <small className="calendar-block">{block.title}</small>}
          {note && <small className="calendar-note">{note}</small>}
          {isCongestedWeek(weekStart, matches) && <Tag tone="rose">Congested</Tag>}
          <WeekSummaryLine summary={weekSummary(days.flatMap(sessionsOn), exerciseById)} compact />
        </div>
        {days.map((date) => <DayCell key={date} date={date} compact detailed={detailed} />)}
      </div>;
    })}
  </div>;
}

/** Exercise × week: does the work progress across the block? Read-only (decision 24); progressions are #14. */
export function ProgressionTable({ weeks }: { weeks: readonly string[] }) {
  const { sessions, sessionsOn, openSession } = usePlanner();
  const { exerciseById } = useSpenst();
  const matrix = useMemo(() => progressionMatrix(weeks, [...sessions]), [weeks, sessions]);
  if (!matrix.rows.length) return <p className="planner-empty">No exercises in these weeks yet. Add sessions in the Weeks view, then come back to see how the work progresses.</p>;
  return <div className="progression-scroll thin-scrollbar">
    <table className="progression-table">
      <thead>
        <tr>
          <th scope="col" className="progression-exercise">Exercise</th>
          {weeks.map((week) => <th key={week} scope="col">
            <strong>Week {isoWeek(week)}</strong>
            <small>{formatDay(week, { day: "numeric", month: "short" })}</small>
            <WeekSummaryLine summary={weekSummary(Array.from({ length: 7 }, (_, index) => addDays(week, index)).flatMap(sessionsOn), exerciseById)} compact />
          </th>)}
        </tr>
      </thead>
      <tbody>
        {matrix.rows.map((row, rowIndex) => {
          const heading = rowIndex === 0 || matrix.rows[rowIndex - 1].section !== row.section ? row.section : null;
          return <tr key={row.exerciseId} className={cn(heading && "starts-section")}>
            <th scope="row" className="progression-exercise">{heading && <span className="progression-section">{sectionName(heading)}</span>}{exerciseById.get(row.exerciseId)?.name ?? "Exercise"}</th>
            {row.cells.map((cell, index) => <td key={matrix.weeks[index]} className={cn(cell.changed && "is-changed")}>
              {cell.entries.map((entry) => <button key={entry.sessionId} type="button" className="progression-entry" onClick={() => openSession(entry.sessionId)} title="Open the session">
                {row.cells[index].entries.length > 1 && <small>{formatDay(entry.scheduledOn, { weekday: "short" })}</small>}
                <span>{entry.text}</span>
              </button>)}
            </td>)}
          </tr>;
        })}
      </tbody>
    </table>
    <p className="progression-key"><i aria-hidden="true" /> Changed from the week before</p>
  </div>;
}

const sectionName = (kind: string) => ({ prep: "Warm-up", speed: "Speed", main: "Main", accessory: "Accessory", conditioning: "Conditioning", custom: "Other" } as Record<string, string>)[kind] ?? kind;

// ---------------------------------------------------------------------------
// Dialogs and menus

function MatchDialog({ state, onClose }: { state: Exclude<MatchDialogState, null>; onClose(): void }) {
  const { createMatch, updateMatch, deleteMatch } = useSpenst();
  const start = state.mode === "edit" ? state.match : { playedOn: state.date, kickOff: null, opponent: "", home: true, kind: "league" as MatchKind, priority: false, note: "" };
  const [draft, setDraft] = useState({ ...start, kickOff: start.kickOff ?? "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const set = (patch: Partial<typeof draft>) => setDraft((current) => ({ ...current, ...patch }));
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!draft.opponent.trim()) { setError("Name the opponent."); return; }
    setBusy(true);
    const input = { playedOn: draft.playedOn, kickOff: draft.kickOff || null, opponent: draft.opponent, home: draft.home, kind: draft.kind, priority: draft.priority, note: draft.note };
    try {
      if (state.mode === "create") await createMatch(input); else await updateMatch(state.match.id, input);
      onClose();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "The match wasn’t saved."); setBusy(false); }
  }
  return <Modal open size="sm" title={state.mode === "create" ? "New match" : "Edit match"} description="Matches set the match-day labels (MD-3, MD-1) on the days before them." onClose={onClose}>
    <form className="grid gap-4" onSubmit={(event) => void save(event)}>
      <label className="grid gap-1.5 text-sm font-semibold">Opponent<input className={inputClass} value={draft.opponent} onChange={(event) => set({ opponent: event.target.value })} placeholder="e.g. Fjellby" autoFocus maxLength={80} /></label>
      <div className="grid grid-cols-2 gap-3">
        <label className="grid gap-1.5 text-sm font-semibold">Date<input className={inputClass} type="date" value={draft.playedOn} onChange={(event) => event.target.value && set({ playedOn: event.target.value })} required /></label>
        <label className="grid gap-1.5 text-sm font-semibold">Kick-off<input className={inputClass} type="time" value={draft.kickOff} onChange={(event) => set({ kickOff: event.target.value })} /></label>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="grid gap-1.5 text-sm font-semibold">Where<select className={inputClass} value={draft.home ? "home" : "away"} onChange={(event) => set({ home: event.target.value === "home" })}><option value="home">Home</option><option value="away">Away</option></select></label>
        <label className="grid gap-1.5 text-sm font-semibold">Kind<select className={inputClass} value={draft.kind} onChange={(event) => set({ kind: event.target.value as MatchKind })}>{(Object.keys(matchKindLabels) as MatchKind[]).map((kind) => <option key={kind} value={kind}>{matchKindLabels[kind]}</option>)}</select></label>
      </div>
      <label className="flex items-center gap-2.5 text-sm font-semibold"><input type="checkbox" className="h-4 w-4" checked={draft.priority} onChange={(event) => set({ priority: event.target.checked })} />Priority match <span className="font-normal text-[var(--ink-soft)]">— a decisive one to taper towards</span></label>
      <label className="grid gap-1.5 text-sm font-semibold">Note<input className={inputClass} value={draft.note} onChange={(event) => set({ note: event.target.value })} placeholder="e.g. Cup, round 3" maxLength={500} /></label>
      {error && <p role="alert" className="rounded-xl bg-[var(--danger-bg)] px-3 py-2 text-sm font-semibold text-[var(--danger)]">{error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        {state.mode === "edit" && (confirm
          ? <Button type="button" variant="danger" onClick={() => { onClose(); void deleteMatch(state.match.id).catch(() => undefined); }}><Trash2 size={15} />Delete the match</Button>
          : <Button type="button" variant="ghost" className="text-[var(--danger)]" onClick={() => setConfirm(true)}><Trash2 size={15} />Delete</Button>)}
        <div className="ml-auto flex gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button disabled={busy}>{busy ? "Saving …" : "Save"}</Button></div>
      </div>
    </form>
  </Modal>;
}

function CopyOfDialog({ date, onClose, onPick }: { date: string; onClose(): void; onPick(source: TrainingSession): void }) {
  const { sessions, matchDay } = usePlanner();
  const { exerciseById } = useSpenst();
  const [query, setQuery] = useState("");
  const ranked = useMemo(() => rankCopySources(sessions, date, (day) => matchDay(day)?.label ?? null), [date, matchDay, sessions]);
  const needle = query.trim().toLocaleLowerCase("en-GB");
  const shown = (needle ? ranked.filter((session) => [session.title, ...allSlots(session.content).map((slot) => exerciseById.get(slot.exerciseId)?.name ?? "")].join(" ").toLocaleLowerCase("en-GB").includes(needle)) : ranked).slice(0, 40);
  const target = matchDay(date);
  return <Modal open size="md" title={`Copy a session to ${formatDay(date, { weekday: "long", day: "numeric", month: "long" })}`} description={target ? `Sessions on ${target.label} days come first, then other ${formatDay(date, { weekday: "long" })}s, then the most recent.` : `Sessions on other ${formatDay(date, { weekday: "long" })}s come first, then the most recent.`} onClose={onClose}>
    <label className="relative mb-4 block"><Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ink-faint)]" aria-hidden="true" /><input className={cn(inputClass, "pl-9")} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name or exercise" aria-label="Search sessions" autoFocus /></label>
    {!shown.length && <p className="planner-empty">{sessions.length ? "No session matches." : "No sessions yet."}</p>}
    <ul className="copy-of-list">
      {shown.map((session) => {
        const summary = summarizeContent(session.content, exerciseById);
        const label = session.scheduledOn ? matchDay(session.scheduledOn)?.label : null;
        return <li key={session.id}><button type="button" onClick={() => onPick(session)}>
          <span className="min-w-0 flex-1"><strong>{session.title}</strong><small>{session.scheduledOn ? formatDay(session.scheduledOn) : "No date"}{session.slot ? ` · ${slotLabel(session.slot)}` : ""}{label ? ` · ${label}` : ""} · {summary.exercises ? `${countLabel(summary.exercises, "exercise", "exercises")}, about ${summary.minutes} min` : "empty"}</small></span>
          <CopyPlus size={16} aria-hidden="true" />
        </button></li>;
      })}
    </ul>
  </Modal>;
}

function CopyWeeksDialog({ weekStart, onClose, onCopy }: { weekStart: string; onClose(): void; onCopy(targets: string[]): void }) {
  const { season, periods, sessionsOn } = usePlanner();
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const weeks = seasonWeeks(season).filter((week) => week.start !== weekStart);
  const toggle = (week: string) => setChosen((current) => { const next = new Set(current); if (next.has(week)) next.delete(week); else next.add(week); return next; });
  return <Modal open size="md" title={`Copy week ${isoWeek(weekStart)} to …`} description="Each session goes to the same weekday and time of day, as a draft, beside whatever the week already has." onClose={onClose}>
    <ul className="copy-weeks-list thin-scrollbar">
      {weeks.map((week) => {
        const block = periodAt(periods, "block", week.start) ?? periodAt(periods, "phase", week.start);
        const count = Array.from({ length: 7 }, (_, index) => addDays(week.start, index)).flatMap(sessionsOn).length;
        return <li key={week.start}><label>
          <input type="checkbox" checked={chosen.has(week.start)} onChange={() => toggle(week.start)} />
          <strong>Week {week.isoWeek}</strong>
          <span>{formatDay(week.start, { day: "numeric", month: "short" })}</span>
          <small>{[block?.title, count ? countLabel(count, "session", "sessions") : null].filter(Boolean).join(" · ")}</small>
        </label></li>;
      })}
    </ul>
    <div className="mt-5 flex justify-end gap-2">
      <Button variant="ghost" onClick={onClose}>Cancel</Button>
      <Button disabled={!chosen.size} onClick={() => onCopy([...chosen].sort())}><Copy size={15} />Copy to {countLabel(chosen.size, "week", "weeks")}</Button>
    </div>
  </Modal>;
}

/** A small menu under its button, in the body so no card clips it. Escape or a click outside closes it. */
function Popover({ anchor: anchorRef, onClose, children }: { anchor: RefObject<HTMLElement | null>; onClose(): void; children: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  // The latest `onClose`, so the effect below runs once per opening rather than on every render.
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; });
  useEffect(() => {
    const onClose = () => closeRef.current();
    const anchor = anchorRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const width = 240;
    setPosition({ top: rect.bottom + 6, left: Math.min(Math.max(8, rect.right - width), window.innerWidth - width - 8) });
    panel.current?.querySelector<HTMLElement>("button:not(:disabled)")?.focus();
    const onPointer = (event: PointerEvent) => { if (!panel.current?.contains(event.target as Node) && !anchor.contains(event.target as Node)) onClose(); };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); anchor.focus(); }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        const items = [...(panel.current?.querySelectorAll<HTMLElement>("button:not(:disabled)") ?? [])];
        const index = items.indexOf(document.activeElement as HTMLElement);
        items[(index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
        event.preventDefault();
      }
    };
    const onScroll = () => onClose();
    document.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("scroll", onScroll, true);
    return () => { document.removeEventListener("pointerdown", onPointer); window.removeEventListener("keydown", onKey, true); window.removeEventListener("scroll", onScroll, true); };
  }, [anchorRef]);
  if (typeof document === "undefined") return null;
  return createPortal(<div ref={panel} role="menu" className="planner-menu" style={position ?? { visibility: "hidden" }}>{children}</div>, document.body);
}

function MenuItem({ children, onClick, disabled }: { children: ReactNode; onClick(): void; disabled?: boolean }) {
  return <button type="button" role="menuitem" className="planner-menu-item" onClick={onClick} disabled={disabled}>{children}</button>;
}
