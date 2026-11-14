"use client";

import { Flag, Star } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { monthSpans, periodColumns, periodKindLabels, seasonWeeks, weekIndex, type Period, type PeriodLevel, type Season, type WeekNote } from "@/lib/season";
import { VELOCITY_ZONES } from "@/lib/vbt";
import { fitLabel, type LabelFit } from "@/lib/fit-label";
import { isCongestedWeek, matchTitle } from "@/lib/match-days";
import type { Match, TrainingSession } from "@/lib/types";
import { cn, countLabel } from "@/lib/utils";

export type TimelineSelection = { type: "period"; id: string } | { type: "week"; index: number } | null;

const LANE_ROW: Record<PeriodLevel, number> = { phase: 4, block: 3 };
const MAX_DOTS = 4;

/**
 * The year as a grid of weeks, Ballou-style: months on top, blocks (with their
 * velocity emphasis) over phases, the sessions of each week, and the matches — with congested weeks marked —
 * at the bottom. Drag across empty weeks in a
 * lane to lay out a new phase or block; click a bar or a week to open it.
 *
 * Each row explains its own colours and marks under its name, listing only
 * what this season uses, so there is no legend under the grid.
 *
 * Mouse drags, a finger taps; keyboard users get the “New phase” / “New block”
 * buttons above the grid, and every bar and week is a button.
 */
export function SeasonTimeline({ season, periods, weekNotes, sessions, matches, today, selection, onSelect, onCreate }: {
  season: Season;
  periods: readonly Period[];
  weekNotes: readonly WeekNote[];
  sessions: readonly TrainingSession[];
  matches: readonly Match[];
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
  const matchesByWeek = new Map<number, Match[]>();
  for (const match of matches) {
    const index = weekIndex(season, match.playedOn);
    if (index !== null) matchesByWeek.set(index, [...(matchesByWeek.get(index) ?? []), match]);
  }
  const column = (index: number) => index + 2;
  const key = seasonKey(season, periods, weekNotes, [...sessionsByWeek.values()].flat(), matches, matchesByWeek);

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
        <RowLabel row={LANE_ROW[level]} name={level === "phase" ? "Phases" : "Blocks"} entries={key[level === "phase" ? "phases" : "blocks"]} />
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
            aria-label={period.title}
          ><FittedLabel title={period.title} /></button>;
        })}
      </div>)}

      {/* Sessions per week */}
      <RowLabel row={5} name="Sessions" entries={key.sessions} />
      {weeks.map((week) => {
        const weekSessions = sessionsByWeek.get(week.index) ?? [];
        const note = notes.get(week.start);
        const selected = selection?.type === "week" && selection.index === week.index;
        const published = weekSessions.filter((session) => session.status === "published").length;
        return <button
          key={week.index}
          type="button"
          className={cn("year-week", selected && "is-selected", week.index === todayColumn && "is-today")}
          style={{ gridRow: 5, gridColumn: column(week.index) }}
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

      {/* Matches, with the congested weeks marked so they show across the year */}
      <RowLabel row={6} name="Matches" entries={key.matches} />
      {weeks.map((week) => {
        const weekMatches = matchesByWeek.get(week.index) ?? [];
        const congested = isCongestedWeek(week.start, matches);
        const selected = selection?.type === "week" && selection.index === week.index;
        if (!weekMatches.length) return <span key={week.index} className="year-matches is-none" style={{ gridRow: 6, gridColumn: column(week.index) }} aria-hidden="true" />;
        const label = `Week ${week.isoWeek}: ${weekMatches.map(matchTitle).join(", ")}${congested ? " — congested" : ""}`;
        return <button
          key={week.index}
          type="button"
          className={cn("year-matches", congested && "is-congested", selected && "is-selected")}
          style={{ gridRow: 6, gridColumn: column(week.index) }}
          onClick={() => onSelect(selected ? null : { type: "week", index: week.index })}
          aria-label={label}
          title={label}
        >
          {weekMatches.map((match) => match.priority ? <Star key={match.id} size={9} className="year-match-star" aria-hidden="true" /> : <i key={match.id} className="year-match" aria-hidden="true" />)}
        </button>;
      })}

      {todayColumn !== null && <span className="year-today" style={{ gridRow: "2 / 7", gridColumn: column(todayColumn) }} aria-hidden="true" />}
    </div>
  </div>;
}

type KeyEntry = { mark: ReactNode; label: string };

/** What each row of this season shows, in the order of the full key: only what is there. */
function seasonKey(season: Season, periods: readonly Period[], weekNotes: readonly WeekNote[], sessions: readonly TrainingSession[], matches: readonly Match[], matchesByWeek: ReadonlyMap<number, Match[]>) {
  const blocks = periods.filter((period) => period.level === "block");
  const kinds = new Set(periods.filter((period) => period.level === "phase").map((period) => period.kind));
  const weeks = seasonWeeks(season);
  const congested = [...matchesByWeek.keys()].some((index) => isCongestedWeek(weeks[index].start, matches));
  const allMatches = [...matchesByWeek.values()].flat();
  return {
    blocks: [
      ...VELOCITY_ZONES.filter((zone) => blocks.some((block) => block.emphasis === zone.id)).map((zone) => ({ mark: <i className="year-swatch" data-emphasis={zone.id} />, label: zone.label })),
      ...(blocks.some((block) => !block.emphasis) ? [{ mark: <i className="year-swatch year-swatch-none" />, label: "No zone" }] : []),
    ],
    phases: (["training", "competition", "break"] as const).filter((kind) => kinds.has(kind)).map((kind) => ({ mark: <i className="year-swatch" data-kind={kind} />, label: periodKindLabels[kind] })),
    sessions: [
      ...(sessions.some((session) => session.status === "published") ? [{ mark: <i className="year-dot is-published" />, label: "Published" }] : []),
      ...(sessions.some((session) => session.status !== "published") ? [{ mark: <i className="year-dot" />, label: "Draft" }] : []),
      ...(weekNotes.length ? [{ mark: <Flag size={10} className="year-week-flag" />, label: "Week note" }] : []),
    ],
    matches: [
      ...(allMatches.some((match) => !match.priority) ? [{ mark: <i className="year-match" />, label: "Match" }] : []),
      ...(allMatches.some((match) => match.priority) ? [{ mark: <Star size={9} className="year-match-star" />, label: "Priority" }] : []),
      ...(congested ? [{ mark: <i className="year-swatch year-swatch-congested" />, label: "Congested week" }] : []),
    ],
  } satisfies Record<string, KeyEntry[]>;
}

/** A row’s name, with the key to its marks underneath. */
function RowLabel({ row, name, entries }: { row: number; name: string; entries: readonly KeyEntry[] }) {
  return <div className="year-label year-label-keyed" style={{ gridRow: row, gridColumn: 1 }}>
    <span>{name}</span>
    {entries.length > 0 && <ul className="year-label-key" aria-label={`${name}: key`}>
      {entries.map((entry) => <li key={entry.label}><span className="year-label-mark" aria-hidden="true">{entry.mark}</span>{entry.label}</li>)}
    </ul>}
  </div>;
}

const LABEL_LINE_HEIGHT = 16;
/** The tallest a vertical title may make its lane — room for about a dozen letters. */
const LABEL_MAX_HEIGHT = 112;

/**
 * A bar's title, fitted to the bar's width (`lib/fit-label.ts`) with the bar's
 * own font, again whenever the bar resizes or the web font arrives. A vertical
 * title sets its own length, which is what makes the lane taller. Before it has
 * measured, or without a canvas, it is one line with an ellipsis.
 */
function FittedLabel({ title }: { title: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [fit, setFit] = useState<LabelFit>({ mode: "line", text: title });

  useEffect(() => {
    const bar = ref.current?.parentElement;
    const context = document.createElement("canvas").getContext("2d");
    if (!bar || !context) return;
    let cancelled = false;
    const update = () => {
      if (cancelled || !bar.clientWidth) return;
      const style = getComputedStyle(bar);
      context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      const next = fitLabel(title, { width: bar.clientWidth, lineHeight: LABEL_LINE_HEIGHT, maxHeight: LABEL_MAX_HEIGHT }, (text) => context.measureText(text).width);
      setFit((current) => JSON.stringify(current) === JSON.stringify(next) ? current : next);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(bar);
    document.fonts?.ready.then(update);
    return () => { cancelled = true; observer.disconnect(); };
  }, [title]);

  return <span
    ref={ref}
    className="year-bar-label"
    data-fit={fit.mode}
    // A little slack, so the browser breaks the lines where the measure did.
    style={fit.mode === "vertical" ? { height: fit.length + 2 } : undefined}
    aria-hidden="true"
  >{fit.text}</span>;
}
