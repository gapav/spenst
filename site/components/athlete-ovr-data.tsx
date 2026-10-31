"use client";

import { Database } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSpenst } from "./app-provider";
import { OvrTrendChart } from "./ovr-trend-chart";
import { Button, Tag } from "./ui";
import { columnsWithData, exercisesIn, formatCell, sessionOrder, trendByDate, trendMetrics } from "@/lib/ovr-data";
import type { OvrRow } from "@/lib/ovr-import";
import type { Athlete } from "@/lib/types";
import { countLabel, formatDay } from "@/lib/utils";

const sheetLabels = { velocity: "Velocity", jump: "Jump", sprint: "Sprint" } as const;
const SESSIONS_SHOWN = 4;

/**
 * Everything OVR recorded for the athlete — test days and training alike —
 * by exercise: the best of each day as a trend, and every rep of every
 * session with every column OVR wrote.
 */
export function AthleteOvrData({ athlete }: { athlete: Athlete }) {
  const { loadOvrRows, ovrRowsVersion } = useSpenst();
  const [rows, setRows] = useState<OvrRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null);
  const [metricKey, setMetricKey] = useState<string | null>(null);
  const [shown, setShown] = useState(SESSIONS_SHOWN);

  useEffect(() => {
    let live = true;
    loadOvrRows(athlete.id).then((loaded) => { if (live) { setRows(loaded); setFailed(false); } }).catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [athlete.id, loadOvrRows, ovrRowsVersion]);

  const exercises = useMemo(() => exercisesIn(rows ?? []), [rows]);
  const exercise = exercises.find((candidate) => candidate.key === chosen) ?? exercises[0] ?? null;
  const metrics = useMemo(() => trendMetrics(exercise?.rows ?? []), [exercise]);
  const metric = metrics.find((candidate) => candidate.key === metricKey) ?? metrics[0] ?? null;
  const trend = useMemo(() => exercise && metric ? trendByDate(exercise.rows, metric) : [], [exercise, metric]);
  const { columns, extra } = useMemo(() => columnsWithData(exercise?.rows ?? []), [exercise]);
  const days = useMemo(() => {
    const byDay = new Map<string, OvrRow[]>();
    for (const row of exercise?.rows ?? []) byDay.set(row.performedOn, [...(byDay.get(row.performedOn) ?? []), row]);
    return [...byDay].sort((a, b) => b[0].localeCompare(a[0])).map(([date, dayRows]) => ({ date, rows: [...dayRows].sort(sessionOrder) }));
  }, [exercise]);

  return <section className="spenst-card p-5" aria-labelledby="ovr-data-heading">
    <h2 id="ovr-data-heading" className="flex items-center gap-2 text-base font-semibold"><Database size={17} />OVR data</h2>
    <p className="mt-1 text-sm leading-6 text-[var(--ink-soft)]">Every rep, jump and sprint OVR recorded for {athlete.displayName}, training included, with every column of the export.</p>
    {failed ? <p role="alert" className="mt-4 text-sm text-[var(--danger)]">Couldn’t load the OVR data.</p>
      : rows === null ? <p role="status" className="spenst-loading mt-4">Loading OVR data …</p>
      : !exercises.length ? <p className="mt-4 text-sm text-[var(--ink-soft)]">Nothing yet. <Link href="/testing/import" className="font-semibold text-[var(--ink)] underline underline-offset-4">Import an OVR export</Link> and it appears here.</p>
      : exercise && <>
        <div className="chip-row mt-4" role="group" aria-label="Exercise">
          {exercises.map((candidate) => <button key={candidate.key} type="button" aria-pressed={candidate.key === exercise.key} onClick={() => { setChosen(candidate.key); setMetricKey(null); setShown(SESSIONS_SHOWN); }}>
            {candidate.exercise} <small>{countLabel(candidate.days, "day", "days")}</small>
          </button>)}
        </div>

        <div className="ovr-overview">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Tag tone="neutral">{sheetLabels[exercise.sheet]}</Tag>
              <span className="text-sm text-[var(--ink-soft)]">{countLabel(exercise.rows.length, exercise.sheet === "sprint" ? "split" : exercise.sheet === "jump" ? "jump" : "rep", exercise.sheet === "sprint" ? "splits" : exercise.sheet === "jump" ? "jumps" : "reps")} on {countLabel(exercise.days, "day", "days")}</span>
            </div>
            {metrics.length > 0 && <label className="ovr-metric"><span>Trend</span>
              <select className="metric-input" value={metric?.key ?? ""} onChange={(event) => setMetricKey(event.target.value)}>
                {metrics.map((candidate) => <option key={candidate.key} value={candidate.key}>{candidate.label}</option>)}
              </select>
            </label>}
          </div>
          {metric && <OvrTrendChart family={exercise.sheet === "sprint" ? "speed" : exercise.sheet === "jump" ? "vertical" : "upper"} points={trend} unit={metric.unit} digits={metric.unit === "W" ? 0 : metric.unit === "kg" ? 1 : metric.unit === "s" ? 3 : 2} caption={`Best of each day · ${metric.best === "min" ? "lower" : "higher"} is better`} label={`${exercise.exercise}: ${metric.label.toLocaleLowerCase("en-GB")}, best of each day`} />}
        </div>

        <div className="ovr-days">
          {days.slice(0, shown).map(({ date, rows: dayRows }) => <div key={date} className="ovr-day">
            <h3>{formatDay(date, { weekday: "short", day: "numeric", month: "short", year: "numeric" })} <small>{countLabel(dayRows.length, "row", "rows")}</small></h3>
            <div className="overflow-x-auto">
              <table className="data-table ovr-table">
                <thead><tr>
                  {columns.map((column) => <th key={column.key} scope="col" className={column.digits !== undefined ? "num" : undefined}>{column.label}{column.unit ? <small> {column.unit}</small> : null}</th>)}
                  {extra.map((key) => <th key={key} scope="col">{key}</th>)}
                </tr></thead>
                <tbody>{dayRows.map((row) => <tr key={row.rowKey}>
                  {columns.map((column) => <td key={column.key} className={column.digits !== undefined ? "num" : undefined}>{formatCell(column, row[column.key])}</td>)}
                  {extra.map((key) => <td key={key}>{row.extra[key] ?? "—"}</td>)}
                </tr>)}</tbody>
              </table>
            </div>
          </div>)}
        </div>
        {days.length > shown && <Button variant="ghost" size="sm" className="mt-3" onClick={() => setShown(shown + 10)}>Show {Math.min(10, days.length - shown)} earlier {days.length - shown === 1 ? "day" : "days"}</Button>}
      </>}
  </section>;
}
