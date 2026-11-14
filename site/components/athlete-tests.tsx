"use client";

import { ChartLine, Table2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { familyOf, formatChange, formatValue, groupHistory, ordinal, valueHistory, type ComparisonPoint, type DatedResult, type LatestValue, type ProfileTest } from "@/lib/power-profile";
import { detailsOutOf, niceTicks, resultDetailLines } from "@/lib/ovr-data";
import { cn, formatDay } from "@/lib/utils";

const dayMs = (date: string) => Date.parse(`${date}T00:00:00Z`);
const shortDay = (date: string) => formatDay(date, { day: "numeric", month: "short" });

export interface Comparison {
  /** "Squad average", "Backs' average" */
  label: string;
  athleteIds: ReadonlySet<string>;
}

interface Series {
  test: ProfileTest;
  own: LatestValue[];
  group: ComparisonPoint[];
}

/**
 * The athlete's tests over time: a card per test with its trend, and one
 * large chart for the chosen test — every test day, against the comparison
 * group's average and range. Up is always better, so time axes are flipped.
 */
export function AthleteTests({ athleteId, tests, results, comparison }: { athleteId: string; tests: readonly ProfileTest[]; results: readonly DatedResult[]; comparison: Comparison }) {
  const [chosen, setChosen] = useState<string | null>(null);
  const [view, setView] = useState<"chart" | "table">("chart");
  const series = useMemo<Series[]>(() => {
    const own = results.filter((result) => result.athleteId === athleteId);
    const history = valueHistory(own);
    return tests.map((test) => ({
      test,
      own: [...(history.get(test.test.key) ?? [])].reverse(),
      group: groupHistory(results, comparison.athleteIds, test.test.key),
    }));
  }, [athleteId, tests, results, comparison.athleteIds]);
  const focus = series.find((entry) => entry.test.test.key === chosen) ?? series.find((entry) => entry.own.length) ?? series[0];

  return <section className="spenst-card overflow-hidden" aria-labelledby="tests-heading">
    <div className="spenst-section-heading">
      <div><h2 id="tests-heading">Tests</h2><p>Every test day, against the {comparison.label.toLocaleLowerCase("en-GB")}. Up is better on every chart — times included.</p></div>
      <div className="spenst-segments" role="group" aria-label="Show as">
        <button type="button" aria-pressed={view === "chart"} onClick={() => setView("chart")}><ChartLine size={15} />Charts</button>
        <button type="button" aria-pressed={view === "table"} onClick={() => setView("table")}><Table2 size={15} />Table</button>
      </div>
    </div>
    {view === "chart" ? <div className="at-body">
      {focus && <ProgressChart series={focus} comparison={comparison.label} />}
      <div className="at-cards" role="group" aria-label="Choose a test">
        {series.map((entry) => <TestCard key={entry.test.test.key} series={entry} active={entry === focus} onSelect={() => setChosen(entry.test.test.key)} />)}
      </div>
    </div> : <TestsTable tests={tests} />}
  </section>;
}

function TestCard({ series, active, onSelect }: { series: Series; active: boolean; onSelect(): void }) {
  const { test } = series;
  return <button type="button" className={cn("at-card", active && "is-active")} aria-pressed={active} data-family={familyOf(test.test)} onClick={onSelect}>
    <span className="at-card-name"><i className="family-dot" />{test.test.shortName}</span>
    <strong className="tabular">{test.latest ? formatValue(test.latest.value, test.test.unit) : "–"}</strong>
    <span className="at-card-meta">
      {test.change !== null && <span className={cn("change", test.improved === true && "is-better", test.improved === false && "is-worse")}>{formatChange(test.change, test.test.unit)}</span>}
      {test.rank !== null && <span>{ordinal(test.rank)} of {test.ranked}</span>}
    </span>
    <Spark series={series} />
  </button>;
}

/** The trend in a card: the athlete's line and the group average, no axes. */
function Spark({ series }: { series: Series }) {
  const { own, group, test } = series;
  const values = [...own.map((point) => point.value), ...group.map((point) => point.average)];
  const dates = [...new Set([...own.map((point) => point.heldOn), ...group.map((point) => point.date)])].sort();
  if (own.length < 1 || dates.length < 2) return <span className="at-spark is-empty">{own.length ? "One test so far" : "Not tested"}</span>;
  const [lo, hi] = [Math.min(...values), Math.max(...values)];
  const flip = test.test.direction === "lower";
  const x = (date: string) => 4 + ((dayMs(date) - dayMs(dates[0])) / Math.max(1, dayMs(dates.at(-1)!) - dayMs(dates[0]))) * 152;
  const y = (value: number) => { const share = hi === lo ? 0.5 : (value - lo) / (hi - lo); return 4 + (flip ? share : 1 - share) * 32; };
  const line = (points: { date: string; value: number }[]) => points.map((point, index) => `${index ? "L" : "M"}${x(point.date).toFixed(1)} ${y(point.value).toFixed(1)}`).join(" ");
  return <svg className="at-spark" viewBox="0 0 160 40" aria-hidden="true">
    {group.length > 1 && <path className="at-spark-group" d={line(group.map((point) => ({ date: point.date, value: point.average })))} />}
    {own.length > 1 && <path className="at-spark-own" d={line(own.map((point) => ({ date: point.heldOn, value: point.value })))} />}
    {own.map((point) => <circle key={point.heldOn} className="at-spark-dot" cx={x(point.heldOn)} cy={y(point.value)} r={own.length > 1 && point !== own.at(-1) ? 1.8 : 3} />)}
  </svg>;
}

interface Hover { date: string; x: number; y: number }

/** One test, large: every test day with values, the group band and average, hover for detail. */
function ProgressChart({ series, comparison }: { series: Series; comparison: string }) {
  const { own, group, test } = series;
  const box = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<Hover | null>(null);
  // Drawn at the plot's real width, so text and marks keep their size on a phone.
  const [W, setW] = useState(640);
  useEffect(() => {
    const element = box.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setW(Math.max(280, Math.round(entry.contentRect.width))));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const H = W < 480 ? 200 : 240, PAD = { left: 48, right: 20, top: 20, bottom: 30 };
  const unit = test.test.unit;
  const dates = [...new Set([...own.map((point) => point.heldOn), ...group.map((point) => point.date)])].sort();
  const values = [...own.map((point) => point.value), ...group.flatMap((point) => [point.low, point.high])];

  const header = <div className="at-focus-head" data-family={familyOf(test.test)}>
    <div>
      <h3><i className="family-dot" />{test.test.name}{test.test.protocol && <small> · {test.test.protocol}</small>}</h3>
      <p>{own.length ? `${own.length} test ${own.length === 1 ? "day" : "days"} · ${test.test.direction === "lower" ? "lower" : "higher"} is better` : "Not tested yet"}</p>
    </div>
    {test.latest && <div className="at-focus-stats">
      <div><small>Latest</small><strong className="tabular">{formatValue(test.latest.value, unit)}</strong></div>
      {own.length > 1 && <div><small>Since first test</small><strong className={cn("tabular change", (test.test.direction === "higher" ? own.at(-1)!.value > own[0].value : own.at(-1)!.value < own[0].value) ? "is-better" : own.at(-1)!.value === own[0].value ? "" : "is-worse")}>{formatChange(own.at(-1)!.value - own[0].value, unit)}</strong></div>}
      {test.rank !== null && <div><small>In the squad</small><strong className="tabular">{ordinal(test.rank)} of {test.ranked}</strong></div>}
    </div>}
  </div>;

  if (!dates.length || !values.length) return <div className="at-focus">{header}<p className="at-empty">No results on this test yet.</p></div>;

  const [low, high] = [Math.min(...values), Math.max(...values)];
  const pad = (high - low) * 0.12 || Math.abs(high) * 0.05 || 1;
  const [lo, hi] = [low - pad, high + pad];
  const flip = test.test.direction === "lower";
  const first = dayMs(dates[0]), span = Math.max(1, dayMs(dates.at(-1)!) - first);
  const x = (date: string) => dates.length === 1 ? (PAD.left + W - PAD.right) / 2 : PAD.left + ((dayMs(date) - first) / span) * (W - PAD.left - PAD.right);
  const y = (value: number) => { const share = (value - lo) / (hi - lo); return PAD.top + (flip ? share : 1 - share) * (H - PAD.top - PAD.bottom); };
  const digits = unit === "s" ? 2 : unit === "m" ? 1 : 0;
  const ticks = niceTicks(lo, hi, 4).filter((tick) => tick >= lo && tick <= hi);
  const band = group.length > 1 ? `M${group.map((point) => `${x(point.date).toFixed(1)} ${y(point.high).toFixed(1)}`).join(" L")} L${[...group].reverse().map((point) => `${x(point.date).toFixed(1)} ${y(point.low).toFixed(1)}`).join(" L")} Z` : null;
  const path = (points: { date: string; value: number }[]) => points.map((point, index) => `${index ? "L" : "M"}${x(point.date).toFixed(1)} ${y(point.value).toFixed(1)}`).join(" ");
  const hovered = hover ? { mine: own.find((point) => point.heldOn === hover.date), theirs: group.find((point) => point.date === hover.date), index: own.findIndex((point) => point.heldOn === hover.date) } : null;

  function show(date: string, value: number) {
    const rect = box.current?.getBoundingClientRect();
    if (!rect) return;
    // Kept inside the plot: the tip is 220 px wide and centred on the point.
    setHover({ date, x: Math.min(Math.max(x(date), 110), rect.width - 110), y: y(value) });
  }

  return <div className="at-focus" data-family={familyOf(test.test)}>
    {header}
    <div className="at-plot" ref={box} onMouseLeave={() => setHover(null)}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${test.test.name} over time: ${own.map((point) => `${shortDay(point.heldOn)} ${formatValue(point.value, unit)}`).join(", ")}`}>
        {ticks.map((tick) => <g key={tick}>
          <line className="lv-grid" x1={PAD.left} x2={W - PAD.right} y1={y(tick)} y2={y(tick)} />
          <text className="lv-axis" x={PAD.left - 8} y={y(tick) + 3} textAnchor="end">{new Intl.NumberFormat("en-GB", { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(tick)}</text>
        </g>)}
        <text className="lv-axis" x={PAD.left - 8} y={PAD.top - 8} textAnchor="end">{unit}</text>
        {dates.map((date) => <text key={date} className="lv-axis" x={x(date)} y={H - 10} textAnchor="middle">{shortDay(date)}</text>)}
        {band && <path className="at-band" d={band} />}
        {group.length > 1 && <path className="at-group" d={path(group.map((point) => ({ date: point.date, value: point.average })))} />}
        {group.length === 1 && <line className="at-group" x1={x(group[0].date) - 18} x2={x(group[0].date) + 18} y1={y(group[0].average)} y2={y(group[0].average)} />}
        {own.length > 1 && <path className="at-own" d={path(own.map((point) => ({ date: point.heldOn, value: point.value })))} />}
        {hover && <line className="at-cursor" x1={x(hover.date)} x2={x(hover.date)} y1={PAD.top} y2={H - PAD.bottom} />}
        {own.map((point) => <circle key={point.heldOn} className={cn("at-point", hover?.date === point.heldOn && "is-hover")} cx={x(point.heldOn)} cy={y(point.value)} r={5} />)}
        {own.length > 0 && <text className="lv-label" x={x(own.at(-1)!.heldOn)} y={y(own.at(-1)!.value) - 12} textAnchor={own.length > 1 ? "end" : "middle"}>{formatValue(own.at(-1)!.value, unit)}</text>}
        {/* Hit areas per test day, wider than the marks. */}
        {dates.map((date) => {
          const value = own.find((point) => point.heldOn === date)?.value ?? group.find((point) => point.date === date)?.average ?? lo;
          return <rect key={date} className="at-hit" x={x(date) - 22} y={PAD.top} width={44} height={H - PAD.top - PAD.bottom} tabIndex={0}
            aria-label={shortDay(date)} onMouseEnter={() => show(date, value)} onFocus={() => show(date, value)} onBlur={() => setHover(null)} onClick={() => show(date, value)} />;
        })}
      </svg>
      {hover && hovered && <div className={cn("tr-tip", hover.y < 110 && "is-below")} role="tooltip" style={{ left: hover.x, top: hover.y }}>
        <strong>{formatDay(hover.date)}</strong>
        <span>{hovered.mine ? `${formatValue(hovered.mine.value, unit)}${hovered.mine.sides.left !== undefined ? ` (L ${formatValue(hovered.mine.sides.left, unit)} · R ${formatValue(hovered.mine.sides.right ?? 0, unit)})` : ""}` : "Not tested that day"}</span>
        {hovered.mine && resultDetailLines(hovered.mine).map((line) => <span key={line}>{line}</span>)}
        {hovered.mine && hovered.index > 0 && <span>{formatChange(hovered.mine.value - own[hovered.index - 1].value, unit)} since {shortDay(own[hovered.index - 1].heldOn)}</span>}
        {hovered.theirs && <span>{comparison}: {formatValue(hovered.theirs.average, unit)} ({hovered.theirs.athletes} tested)</span>}
      </div>}
    </div>
    {own.some((point) => point.details || point.sideDetails.left || point.sideDetails.right) && <ul className="at-history" aria-label={`${test.test.name}, every test day`}>
      {[...own].reverse().map((point) => <li key={point.testDayId}>
        <span>{shortDay(point.heldOn)}</span>
        <strong>{formatValue(point.value, unit)}</strong>
        <span className="attempt-summary">{resultDetailLines(point).join(" · ") || "Typed in"}{point.details && detailsOutOf(point.details) ? ` · ${detailsOutOf(point.details)}` : ""}</span>
      </li>)}
    </ul>}
    <div className="lv-legend">
      <span><i className="at-key-own" />This athlete</span>
      <span><i className="at-key-group" />{comparison}</span>
      {group.length > 1 && <span><i className="at-key-band" />Range, weakest to best</span>}
    </div>
  </div>;
}

function TestsTable({ tests }: { tests: readonly ProfileTest[] }) {
  return <div className="overflow-x-auto">
    <table className="data-table">
      <thead><tr><th scope="col">Test</th><th scope="col" className="num">Result</th><th scope="col" className="num">Since last</th><th scope="col" className="num">In the squad</th></tr></thead>
      <tbody>{tests.map((test) => <tr key={test.test.key}>
        <th scope="row" className="font-semibold" data-family={familyOf(test.test)}><span className="flex items-center gap-2"><i className="family-dot" />{test.test.name}</span>{test.latest && <small className="block text-xs font-normal text-[var(--ink-soft)]">{formatDay(test.latest.heldOn)}</small>}</th>
        <td className="num">{test.latest ? formatValue(test.latest.value, test.test.unit) : "–"}{resultDetailLines(test.latest).map((line) => <small key={line} className="attempt-summary">{line}</small>)}</td>
        <td className="num">{test.change === null ? <span className="text-[var(--ink-faint)]">–</span> : <span className={cn("change", test.improved === true && "is-better", test.improved === false && "is-worse")}>{formatChange(test.change, test.test.unit)}</span>}</td>
        <td className="num">{test.rank !== null ? <span className="tabular">{ordinal(test.rank)} <span className="text-[var(--ink-soft)]">of {test.ranked}</span></span> : "–"}</td>
      </tr>)}</tbody>
    </table>
  </div>;
}
