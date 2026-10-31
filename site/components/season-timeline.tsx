"use client";

import { Flag } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { monthSpans, periodColumns, seasonWeeks, weekIndex, type Period, type PeriodLevel, type Season, type WeekNote } from "@/lib/season";
import type { TrainingSession } from "@/lib/types";
import { cn, countLabel } from "@/lib/utils";

export type TimelineSelection = { type: "period"; id: string } | { type: "week"; index: number } | null;

const LANE_ROW: Record<PeriodLevel, number> = { phase: 4, block: 3 };
const MAX_DOTS = 4;

/**
 * The year as a grid of weeks, Ballou-style: months on top, blocks (with their
 * velocity emphasis) over phases, the throughline running under everything,
 * and the sessions of each week at the bottom. Drag across empty weeks in a
 * lane to lay out a new phase or block; click a bar or a week to open it.
 *
 * Mouse drags, a finger taps; keyboard users get the “New phase” / “New block”
 * buttons above the grid, and every bar and week is a button.
 */
export function SeasonTimeline({ season, periods, weekNotes, sessions, today, selection, onSelect, onCreate }: {
  season: Season;
  periods: readonly Period[];
  weekNotes: readonly WeekNote[];
  sessions: readonly TrainingSession[];
  today: string | null;
  selection: TimelineSelection;
  onSelect(selection: TimelineSelection): void;
  onCreate(level: PeriodLevel, from: number, to: number): void;
}) {
  const weeks = seasonWeeks(season);
  const months = monthSpans(season);
  const todayColumn = today ? weekIndex(season, today) : null;
  const [drag, setDrag] = useState<{ level: PeriodLevel; from: number; to: number } | null>(null);
  const dragRef = useRef(drag);
  useEffect(() => { dragRef.current = drag; }, [drag]);
  const scroller = useRef<HTMLDivElement>(null);

  // Finish a drag wherever the pointer is let go — outside the grid included.
  useEffect(() => {
    if (!drag) return;
    const finish = () => {
      const current = dragRef.current;
      setDrag(null);
      if (current) onCreate(current.level, Math.min(current.from, current.to), Math.max(current.from, current.to));
    };
    window.addEventListener("pointerup", finish);
    return () => window.removeEventListener("pointerup", finish);
  }, [drag, onCreate]);

  // Open on the current week, not on August.
  useEffect(() => {
    const element = scroller.current;
    if (!element || todayColumn === null) return;
    const column = element.querySelector<HTMLElement>(`[data-week="${todayColumn}"]`);
    if (column) element.scrollLeft = Math.max(0, column.offsetLeft - element.clientWidth / 3);
  }, [season.id, todayColumn]);

  const taken = (level: PeriodLevel) => {
    const columns = new Set<number>();
    for (const period of periods) {
      if (period.level !== level) continue;
      const span = periodColumns(season, period);
      if (span) for (let index = span.from; index <= span.to; index += 1) columns.add(index);
    }
    return columns;
  };
  const takenColumns = { phase: taken("phase"), block: taken("block") };
  const inDrag = (level: PeriodLevel, index: number) => drag?.level === level && index >= Math.min(drag.from, drag.to) && index <= Math.max(drag.from, drag.to);
  const notes = new Map(weekNotes.map((note) => [note.weekStart, note.label]));
  const sessionsByWeek = new Map<number, TrainingSession[]>();
  for (const session of sessions) {
    const index = session.scheduledOn ? weekIndex(season, session.scheduledOn) : null;
    if (index !== null) sessionsByWeek.set(index, [...(sessionsByWeek.get(index) ?? []), session]);
  }
  const column = (index: number) => index + 2;

  return <div className="year-scroll thin-scrollbar" ref={scroller}>
    <div className="year-grid" style={{ gridTemplateColumns: `var(--year-label) repeat(${season.weeks}, minmax(var(--year-week), 1fr))`, ["--weeks" as string]: season.weeks }}>
      {/* Months */}
      <span className="year-label" style={{ gridRow: 1, gridColumn: 1 }} />
      {months.map((month) => <span key={`${month.from}`} className="year-month" style={{ gridRow: 1, gridColumn: `${column(month.from)} / ${column(month.to) + 1}` }}>{month.label}</span>)}

      {/* Week numbers */}
      <span className="year-label year-label-small" style={{ gridRow: 2, gridColumn: 1 }}>Week</span>
      {weeks.map((week) => <span key={week.index} data-week={week.index} className={cn("year-weekno", week.index === todayColumn && "is-today")} style={{ gridRow: 2, gridColumn: column(week.index) }}>{week.isoWeek}</span>)}

      {/* Blocks over phases, as in Ballou’s chart */}
      {(["block", "phase"] as const).map((level) => <div key={level} className="contents">
        <span className="year-label" style={{ gridRow: LANE_ROW[level], gridColumn: 1 }}>{level === "phase" ? "Phases" : "Blocks"}</span>
        {weeks.map((week) => {
          const free = !takenColumns[level].has(week.index);
          return <span
            key={week.index}
            className={cn("year-cell", free && "is-free", inDrag(level, week.index) && "is-dragging", week.index === todayColumn && "is-today")}
            style={{ gridRow: LANE_ROW[level], gridColumn: column(week.index) }}
            // Mouse and pen drag out a span. A finger on a phone has to be free
            // to scroll the year sideways, so touch taps instead: a tap fires
            // pointerup, a scroll ends in pointercancel.
            onPointerDown={(event) => { if (!free || event.pointerType === "touch" || event.button !== 0) return; event.preventDefault(); setDrag({ level, from: week.index, to: week.index }); }}
            onPointerUp={(event) => { if (free && event.pointerType === "touch") onCreate(level, week.index, week.index); }}
            onPointerEnter={() => { if (drag?.level === level) setDrag({ ...drag, to: week.index }); }}
            aria-hidden="true"
          />;
        })}
        {periods.filter((period) => period.level === level).map((period) => {
          const span = periodColumns(season, period);
          if (!span) return null;
          const selected = selection?.type === "period" && selection.id === period.id;
          return <button
            key={period.id}
            type="button"
            className={cn("year-bar", `is-${level}`, selected && "is-selected")}
            data-kind={period.kind}
            data-emphasis={period.emphasis ?? "none"}
            style={{ gridRow: LANE_ROW[level], gridColumn: `${column(span.from)} / ${column(span.to) + 1}` }}
            onClick={() => onSelect(selected ? null : { type: "period", id: period.id })}
            aria-pressed={selected}
            title={`${period.title}${period.focus ? ` — ${period.focus}` : ""}`}
          ><span>{period.title}</span></button>;
        })}
      </div>)}

      {/* The throughline: what runs under every phase */}
      {season.throughline && <>
        <span className="year-label year-label-small" style={{ gridRow: 5, gridColumn: 1 }}>Always</span>
        <div className="year-throughline" style={{ gridRow: 5, gridColumn: `2 / ${season.weeks + 2}` }}><span>{season.throughline}</span></div>
      </>}

      {/* Sessions per week */}
      <span className="year-label" style={{ gridRow: 6, gridColumn: 1 }}>Sessions</span>
      {weeks.map((week) => {
        const weekSessions = sessionsByWeek.get(week.index) ?? [];
        const note = notes.get(week.start);
        const selected = selection?.type === "week" && selection.index === week.index;
        const published = weekSessions.filter((session) => session.status === "published").length;
        return <button
          key={week.index}
          type="button"
          className={cn("year-week", selected && "is-selected", week.index === todayColumn && "is-today")}
          style={{ gridRow: 6, gridColumn: column(week.index) }}
          onClick={() => onSelect(selected ? null : { type: "week", index: week.index })}
          aria-pressed={selected}
          aria-label={`Week ${week.isoWeek}: ${countLabel(weekSessions.length, "session", "sessions")}${note ? `, ${note}` : ""}`}
          title={note ?? undefined}
        >
          {note && <Flag size={10} className="year-week-flag" aria-hidden="true" />}
          <span className="year-dots" aria-hidden="true">
            {weekSessions.slice(0, MAX_DOTS).map((session, index) => <i key={session.id} className={index < published ? "is-published" : ""} />)}
            {weekSessions.length > MAX_DOTS && <small>+{weekSessions.length - MAX_DOTS}</small>}
          </span>
        </button>;
      })}

      {todayColumn !== null && <span className="year-today" style={{ gridRow: "2 / 7", gridColumn: column(todayColumn) }} aria-hidden="true" />}
    </div>
  </div>;
}
