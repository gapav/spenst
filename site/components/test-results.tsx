"use client";

import { ChartScatter, PenLine, Scale, Table2, X } from "lucide-react";
import Link from "next/link";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { attemptFields, bestAttempt, bestOf, columnsWithData, formatCell, niceTicks, type Attempt, type AttemptMetric, type OvrColumn } from "@/lib/ovr-data";
import { HelpTip } from "./help-tip";
import { deviceLabels, familyOf, familyLabels, type TestDefinition } from "@/lib/power-profile";
import type { Athlete, Side, TestResult } from "@/lib/types";
import { cn } from "@/lib/utils";
import { asymmetry, ASYMMETRY_HIGH_PERCENT, ASYMMETRY_TAG_PERCENT, asymmetryLabels } from "@/lib/asymmetry";

const format = (value: number, digits: number) => new Intl.NumberFormat("en-GB", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
const withUnit = (value: number, metric: Pick<AttemptMetric, "digits" | "unit">) => `${format(value, metric.digits)}${metric.unit ? ` ${metric.unit}` : ""}`;
/** The distance to the leader: "+0.05 s", "−420 W". */
const gap = (difference: number, metric: Pick<AttemptMetric, "digits" | "unit">) => `${difference > 0 ? "+" : difference < 0 ? "−" : "±"}${withUnit(Math.abs(difference), metric)}`;

interface Tip { x: number; y: number; title: string; lines: string[] }

interface Line {
  athlete: Athlete;
  /** The value the row is ranked on: the result for the scored metric, else the best attempt. */
  value: number | null;
  sides: Partial<Record<Side, number>>;
  attempts: Attempt[];
}

/** What an attempt's tooltip says: every column OVR filled for it, the load and start included. */
function attemptLines(attempt: Attempt): string[] {
  return attemptFields(attempt.rows).filter((field) => !["Set", "Rep", "Run"].includes(field.label)).map((field) => `${field.label} ${field.text}`);
}

/** The attempt a value is: the athlete's attempt (on a leg) with that value of the metric. */
function attemptWith(attempts: readonly Attempt[], metric: AttemptMetric, value: number, side: Side | null = null): Attempt | null {
  return attempts.find((attempt) => (side === null || attempt.side === side) && typeof attempt.values[metric.key] === "number" && Math.abs((attempt.values[metric.key] as number) - value) < 0.0005) ?? null;
}

/** What each velocity metric means, kept in a help tip rather than on the page. */
function MetricHelp({ metrics }: { metrics: readonly AttemptMetric[] }) {
  if (!metrics.some((metric) => ["romCm", "tpvS", "durationS", "eaIndex"].includes(metric.key))) return null;
  return <HelpTip label="What the metrics mean">
    <p><strong>Peak and mean power, peak and mean velocity</strong>: the bar’s best instant, and its average over the rep. Higher is better.</p>
    <p><strong>ROM</strong>: how far the bar travelled. Higher ranks first, but read it as context: a longer pull is not always a better one.</p>
    <p><strong>Time to peak</strong> (TPV): how soon the bar reached its peak velocity. <strong>Duration</strong>: how long the rep took. Lower is better for both.</p>
    <p><strong>EA index</strong>: OVR’s own index for the rep. Higher is better.</p>
    <p><strong>Load</strong> is shown beside every rep, never ranked.</p>
  </HelpTip>;
}

/**
 * A test on a test day, read from OVR: the squad ranked, every attempt as a
 * small dot and the scored best as a large one in its tier colour, so the
 * spread is as visible as the result. Hover or tap a dot for the rep; choose
 * an athlete for their attempts one by one.
 */
export function TestResults({ test, squad, results, metrics, attempts, entry, recording, onRecord }: {
  test: TestDefinition; squad: Athlete[]; results: TestResult[]; metrics: AttemptMetric[]; attempts: Attempt[];
  /** Typed-in tests: the entry list, shown while recording. */
  entry?: ReactNode; recording?: boolean; onRecord?: (recording: boolean) => void;
}) {
  const [metricKey, setMetricKey] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // One-leg tests open on the difference between the legs: it is what the test is for.
  const [view, setView] = useState<"asymmetry" | "chart" | "table">(test.sided ? "asymmetry" : "chart");
  const [tip, setTip] = useState<Tip | null>(null);
  const chart = useRef<HTMLDivElement>(null);

  // Without OVR rows the chart still shows the results, on the test's own unit.
  const scored: AttemptMetric = metrics[0] ?? { key: "result", label: "Result", unit: test.unit, digits: test.unit === "s" ? 2 : test.unit === "m" ? 1 : 0, best: test.direction === "lower" ? "min" : "max" };
  const metric = metrics.find((candidate) => candidate.key === metricKey) ?? scored;
  const isScored = metric.key === scored.key;

  const lines = useMemo<Line[]>(() => squad.map((athlete) => {
    const own = attempts.filter((attempt) => attempt.athleteId === athlete.id && typeof attempt.values[metric.key] === "number");
    if (!isScored) return { athlete, value: bestOf(own.map((attempt) => attempt.values[metric.key] as number), metric.best), sides: {}, attempts: own };
    const mine = results.filter((result) => result.athleteId === athlete.id && result.testKey === test.key);
    const sides = Object.fromEntries(mine.filter((result) => result.side).map((result) => [result.side, result.value])) as Partial<Record<Side, number>>;
    const whole = mine.find((result) => result.side === null)?.value ?? null;
    const value = test.sided ? (sides.left !== undefined && sides.right !== undefined ? (sides.left + sides.right) / 2 : null) : whole;
    return { athlete, value, sides, attempts: own };
  }), [squad, attempts, metric.key, metric.best, isScored, results, test.key, test.sided]);

  const better = (a: number, b: number) => metric.best === "max" ? b - a : a - b;
  const ranked = [...lines].sort((a, b) => a.value === null ? 1 : b.value === null ? -1 : better(a.value, b.value));
  const tested = ranked.filter((line) => line.value !== null);
  const everything = ranked.flatMap((line) => [...line.attempts.map((attempt) => attempt.values[metric.key] as number), ...(line.value !== null ? [line.value] : []), ...Object.values(line.sides)]);
  const [low, high] = everything.length ? [Math.min(...everything), Math.max(...everything)] : [0, 1];
  const pad = (high - low) * 0.08 || Math.abs(high) * 0.05 || 1;
  const [lo, hi] = [low - pad, high + pad];
  const ticks = niceTicks(lo, hi, 4).filter((tick) => tick >= lo && tick <= hi);
  const at = (value: number) => `${((value - lo) / (hi - lo)) * 100}%`;
  const values = tested.map((line) => line.value as number);
  const median = values.length ? [...values].sort((a, b) => a - b)[Math.floor((values.length - 1) / 2)] : null;
  const leader = tested[0] ?? null;
  const selected = ranked.find((line) => line.athlete.id === selectedId) ?? null;
  // Load is context: what the bar weighed, beside the reps, never a ranking.
  const loads = [...new Set(attempts.map((attempt) => attempt.values.loadKg).filter((value): value is number => typeof value === "number"))].sort((a, b) => a - b);

  /** The best's tooltip: the value, then every column of the attempt it is. */
  function bestLines(line: Line, value: number, side: Side | null = null): string[] {
    const attempt = attemptWith(line.attempts, metric, value, side);
    const own = side ? line.attempts.filter((candidate) => candidate.side === side) : line.attempts;
    return [withUnit(value, metric), ...(attempt ? [`${attempt.label} · best of ${own.length}`, ...attemptLines(attempt)] : [])];
  }

  function show(event: React.SyntheticEvent<HTMLElement>, title: string, tipLines: string[]) {
    const box = chart.current?.getBoundingClientRect();
    const mark = event.currentTarget.getBoundingClientRect();
    if (!box) return;
    setTip({ x: Math.min(Math.max(mark.left + mark.width / 2 - box.left, 120), box.width - 120), y: mark.top - box.top, title, lines: tipLines });
  }

  return <section className="spenst-card tr" aria-labelledby="tr-heading" data-family={familyOf(test)}>
    <header className="tr-head">
      <div className="min-w-0">
        <h2 id="tr-heading">{test.name}</h2>
        <p><span className="tr-family"><i className="family-dot" />{familyLabels[familyOf(test)]}</span> · {deviceLabels[test.device]} · {metrics.length ? "read from the OVR export" : "results"} · {metric.best === "min" ? "lower" : "higher"} is better{test.sided ? " · one result per leg" : ""}</p>
      </div>
      <div className="tr-head-actions">
      {onRecord && <button type="button" className={cn("spenst-action", recording ? "spenst-action-secondary" : "")} aria-pressed={recording} onClick={() => onRecord(!recording)}>{recording ? <><X size={16} />Done recording</> : <><PenLine size={16} />Record results</>}</button>}
      <div className="spenst-segments" role="group" aria-label="Show as">
        {test.sided && <button type="button" aria-pressed={view === "asymmetry"} onClick={() => setView("asymmetry")}><Scale size={15} />Left vs right</button>}
        <button type="button" aria-pressed={view === "chart"} onClick={() => setView("chart")}><ChartScatter size={15} />{test.sided ? "Attempts" : "Chart"}</button>
        <button type="button" aria-pressed={view === "table"} onClick={() => setView("table")}><Table2 size={15} />Table</button>
      </div>
      </div>
    </header>
    {recording && entry}

    <div className="tr-stats">
      <div className="stat-tile"><small>Best</small><strong>{leader ? withUnit(leader.value as number, metric) : "—"}</strong><span>{leader?.athlete.displayName ?? "Nobody yet"}</span></div>
      <div className="stat-tile"><small>Squad median</small><strong>{median !== null ? withUnit(median, metric) : "—"}</strong><span>{metric.label.toLocaleLowerCase("en-GB")}</span></div>
      <div className="stat-tile"><small>Tested</small><strong>{tested.length} of {squad.length}</strong><span>{attempts.length ? `${attempts.length} ${attempts[0].rows[0].sheet === "sprint" ? "runs" : attempts[0].rows[0].sheet === "jump" ? "jumps" : "reps"} in OVR` : onRecord ? "typed in" : "no OVR rows"}</span></div>
    </div>

    {metrics.length > 1 && <div className="tr-metrics tr-metrics-row">
      <div className="chip-row" role="group" aria-label="Metric">
        {metrics.map((candidate, index) => <button key={candidate.key} type="button" aria-pressed={candidate.key === metric.key} onClick={() => setMetricKey(candidate.key)}>{candidate.label}{index === 0 && <small>the test</small>}</button>)}
      </div>
      <MetricHelp metrics={metrics} />
    </div>}
    {loads.length > 0 && <p className="tr-context">Load {loads.length === 1 ? `${format(loads[0], loads[0] % 1 ? 1 : 0)} kg` : `${format(loads[0], 0)}–${format(loads.at(-1) as number, 0)} kg`} · shown with every rep, not ranked</p>}

    {view === "asymmetry" ? <>
      <AsymmetryView lines={ranked} metric={metric} isScored={isScored} selectedId={selectedId} onSelect={(id) => setSelectedId(selectedId === id ? null : id)} />
      {selected && <AttemptDetail line={selected} metric={metric} scored={scored} metrics={metrics} onClose={() => setSelectedId(null)} />}
    </> : view === "chart" ? <>
      <div className="tr-legend">
        <span><i className="tr-key-best" />Best</span>
        {attempts.length > 0 && <span><i className="tr-key-attempt" />Every other attempt</span>}
        {test.sided && isScored && <span><i className="tr-key-side" />Left · <i className="tr-key-side is-right" />Right</span>}
        {!attempts.length && onRecord && <HelpTip label="Where these results come from" align="end" className="ml-auto">Typed in from the {test.device === "tape" ? "tape measure" : "My Jump app"} — the best of 2–3 attempts per athlete.</HelpTip>}
      </div>
      <div className="tr-chart" ref={chart} onMouseLeave={() => setTip(null)}>
        <div className="tr-axis" aria-hidden="true">
          <span />
          <div className="tr-axis-scale">{ticks.map((tick) => <span key={tick} style={{ left: at(tick) }}>{format(tick, metric.digits > 2 ? 2 : metric.digits)}</span>)}</div>
          <span className="tr-axis-unit">{metric.unit}</span>
        </div>
        {ranked.map((line, index) => {
          const sideValues = test.sided && isScored ? (["left", "right"] as const).filter((side) => line.sides[side] !== undefined) : [];
          return <div key={line.athlete.id} className={cn("tr-row", line.value === null && "is-untested", selectedId === line.athlete.id && "is-selected")}>
            <button type="button" className="tr-name" aria-expanded={selectedId === line.athlete.id} onClick={() => setSelectedId(selectedId === line.athlete.id ? null : line.athlete.id)}>
              <span className="tr-rank">{line.value === null ? "–" : index + 1}</span><span className="truncate">{line.athlete.displayName}</span>
            </button>
            <div className="tr-plot">
              {ticks.map((tick) => <span key={tick} className="tr-grid" style={{ left: at(tick) }} />)}
              {line.value === null && <span className="tr-none">Not tested</span>}
              {sideValues.length === 2 && <span className="tr-span" style={{ left: at(Math.min(line.sides.left as number, line.sides.right as number)), width: `${(Math.abs((line.sides.left as number) - (line.sides.right as number)) / (hi - lo)) * 100}%` }} />}
              {line.attempts.map((attempt) => <button key={attempt.key} type="button" className="tr-dot" style={{ left: at(attempt.values[metric.key] as number) }} aria-label={`${line.athlete.displayName}, ${attempt.label}: ${withUnit(attempt.values[metric.key] as number, metric)}`}
                onMouseEnter={(event) => show(event, `${line.athlete.displayName} · ${attempt.label}`, attemptLines(attempt))} onFocus={(event) => show(event, `${line.athlete.displayName} · ${attempt.label}`, attemptLines(attempt))} onBlur={() => setTip(null)}
                onClick={(event) => { show(event, `${line.athlete.displayName} · ${attempt.label}`, attemptLines(attempt)); setSelectedId(line.athlete.id); }} />)}
              {sideValues.map((side) => <button key={side} type="button" className={cn("tr-best", side === "right" && "is-right")} style={{ left: at(line.sides[side] as number) }} aria-label={`${line.athlete.displayName}, ${side}: ${withUnit(line.sides[side] as number, metric)}`}
                onMouseEnter={(event) => show(event, `${line.athlete.displayName} · ${side} leg`, bestLines(line, line.sides[side] as number, side))} onFocus={(event) => show(event, `${line.athlete.displayName} · ${side} leg`, bestLines(line, line.sides[side] as number, side))} onBlur={() => setTip(null)} onClick={() => setSelectedId(line.athlete.id)} />)}
              {line.value !== null && !sideValues.length && <button type="button" className="tr-best" style={{ left: at(line.value) }} aria-label={`${line.athlete.displayName}, best: ${withUnit(line.value, metric)}`}
                onMouseEnter={(event) => show(event, `${line.athlete.displayName} · best`, bestLines(line, line.value as number))}
                onFocus={(event) => show(event, `${line.athlete.displayName} · best`, bestLines(line, line.value as number))} onBlur={() => setTip(null)} onClick={() => setSelectedId(line.athlete.id)} />}
            </div>
            <div className="tr-value">
              {line.value !== null ? <>
                <strong className="tabular">{test.sided && isScored && sideValues.length === 2 ? `${format(line.sides.left as number, metric.digits)} / ${format(line.sides.right as number, metric.digits)}` : format(line.value, metric.digits)}</strong>
                {index > 0 && ranked[0].value !== null ? <small className="tabular">{gap(line.value - (ranked[0].value as number), metric)}</small> : <small>{metric.unit}</small>}
              </> : <small>—</small>}
            </div>
          </div>;
        })}
        {tip && <div className="tr-tip" role="tooltip" style={{ left: tip.x, top: tip.y }}><strong>{tip.title}</strong>{tip.lines.map((line) => <span key={line}>{line}</span>)}</div>}
      </div>
      {selected && <AttemptDetail line={selected} metric={metric} scored={scored} metrics={metrics} onClose={() => setSelectedId(null)} />}
      {!attempts.length && !onRecord && <p className="tr-note">No OVR rows behind these results. <Link href="/testing/import">Import the OVR export</Link> to see every attempt.</p>}
    </> : <ResultsTable ranked={ranked} metrics={metrics.length ? metrics : [scored]} test={test} />}
  </section>;
}

/** Each leg's value for the metric: the recorded result, or the best rep on that leg. */
function legValues(line: Line, metric: AttemptMetric, isScored: boolean): { left: number; right: number } | null {
  if (isScored) return line.sides.left !== undefined && line.sides.right !== undefined ? { left: line.sides.left, right: line.sides.right } : null;
  const best = (side: "left" | "right") => bestOf(line.attempts.filter((attempt) => attempt.side === side).map((attempt) => attempt.values[metric.key]).filter((value): value is number => typeof value === "number"), metric.best);
  const [left, right] = [best("left"), best("right")];
  return left !== null && right !== null ? { left, right } : null;
}

/**
 * Left against right, per athlete: the gap as a bar toward the weaker leg on
 * Ballou's zones (3 % follow up, 10 % large), and beside it both legs on one
 * power scale — how even, and how strong.
 */
function AsymmetryView({ lines, metric, isScored, selectedId, onSelect }: { lines: Line[]; metric: AttemptMetric; isScored: boolean; selectedId: string | null; onSelect(id: string): void }) {
  const [sort, setSort] = useState<"gap" | "power">("gap");
  const [tip, setTip] = useState<Tip | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const rows = lines.map((line) => {
    const legs = legValues(line, metric, isScored);
    return { line, legs, gap: legs ? asymmetry(legs.left, legs.right) : null };
  });
  const sorted = [...rows].sort((a, b) => !a.legs ? 1 : !b.legs ? -1
    : sort === "gap" ? (b.gap?.deficitPercent ?? 0) - (a.gap?.deficitPercent ?? 0)
    : (b.legs.left + b.legs.right) - (a.legs.left + a.legs.right));
  const tested = rows.filter((row) => row.legs);
  const flagged = tested.filter((row) => row.gap && row.gap.level !== "ok").length;
  // The gap axis: symmetric, at least to 12 %, wider if someone is further out.
  const reach = Math.max(12, Math.ceil(Math.max(0, ...tested.map((row) => row.gap?.deficitPercent ?? 0)) / 2) * 2 + 2);
  const gapAt = (percent: number) => `${50 + (percent / reach) * 50}%`;
  const power = tested.flatMap((row) => [row.legs!.left, row.legs!.right]);
  const [low, high] = power.length ? [Math.min(...power), Math.max(...power)] : [0, 1];
  const pad = (high - low) * 0.1 || high * 0.05 || 1;
  const [lo, hi] = [low - pad, high + pad];
  const ticks = niceTicks(lo, hi, 3).filter((tick) => tick >= lo && tick <= hi);
  const at = (value: number) => `${((value - lo) / (hi - lo)) * 100}%`;
  const signed = (row: (typeof rows)[number]) => !row.gap ? 0 : row.gap.weaker === "left" ? -row.gap.deficitPercent : row.gap.deficitPercent;

  function show(event: React.SyntheticEvent<HTMLElement>, row: (typeof rows)[number]) {
    const area = box.current?.getBoundingClientRect();
    const mark = event.currentTarget.getBoundingClientRect();
    if (!area || !row.legs) return;
    const lines = [
      `Left ${withUnit(row.legs.left, metric)}`, `Right ${withUnit(row.legs.right, metric)}`,
      row.gap ? `${row.gap.deficitPercent.toLocaleString("en-GB")} %${row.gap.weaker ? ` weaker ${row.gap.weaker}` : ""} · ${asymmetryLabels[row.gap.level]}` : "",
    ].filter(Boolean);
    setTip({ x: Math.min(Math.max(mark.left + mark.width / 2 - area.left, 120), area.width - 120), y: mark.top - area.top, title: row.line.athlete.displayName, lines });
  }

  return <div className="as-wrap">
    <div className="as-toolbar">
      <p><strong>{flagged}</strong> of {tested.length} past {ASYMMETRY_TAG_PERCENT} % · {metric.label.toLocaleLowerCase("en-GB")}, {isScored ? "the recorded result per leg" : "best rep per leg"}</p>
      <div className="spenst-segments" role="group" aria-label="Sort by">
        <button type="button" aria-pressed={sort === "gap"} onClick={() => setSort("gap")}>Biggest gap</button>
        <button type="button" aria-pressed={sort === "power"} onClick={() => setSort("power")}>Most power</button>
      </div>
    </div>
    <div className="as-chart" ref={box} onMouseLeave={() => setTip(null)}>
      <div className="as-row as-head" aria-hidden="true">
        <span />
        <div className="as-gap-axis" data-short="Bars point to the weaker leg"><span style={{ left: "0%" }}>← left weaker</span><span className="as-zero" style={{ left: "50%" }}>0</span><span style={{ left: "100%" }}>right weaker →</span></div>
        <div className="as-power-axis">{ticks.map((tick) => <span key={tick} style={{ left: at(tick) }}>{format(tick, metric.digits > 2 ? 2 : metric.digits)}</span>)}</div>
        <span className="as-unit">{metric.unit}</span>
      </div>
      {sorted.map((row) => {
        const value = signed(row);
        return <div key={row.line.athlete.id} className={cn("as-row", !row.legs && "is-untested", selectedId === row.line.athlete.id && "is-selected")}
          onMouseEnter={(event) => show(event, row)} onFocus={(event) => show(event, row)}>
          <button type="button" className="tr-name" aria-expanded={selectedId === row.line.athlete.id} onClick={() => onSelect(row.line.athlete.id)}><span className="truncate">{row.line.athlete.displayName}</span></button>
          <div className="as-gap" role="img" aria-label={row.gap ? `${row.gap.deficitPercent} percent, weaker ${row.gap.weaker ?? "neither"}` : "Not tested on both legs"}>
            <span className="as-zone is-high" style={{ left: 0, width: gapAt(-ASYMMETRY_HIGH_PERCENT) }} />
            <span className="as-zone is-tagged" style={{ left: gapAt(-ASYMMETRY_HIGH_PERCENT), width: `${((ASYMMETRY_HIGH_PERCENT - ASYMMETRY_TAG_PERCENT) / reach) * 50}%` }} />
            <span className="as-zone is-tagged" style={{ left: gapAt(ASYMMETRY_TAG_PERCENT), width: `${((ASYMMETRY_HIGH_PERCENT - ASYMMETRY_TAG_PERCENT) / reach) * 50}%` }} />
            <span className="as-zone is-high" style={{ left: gapAt(ASYMMETRY_HIGH_PERCENT), right: 0 }} />
            <span className="as-centre" />
            {row.gap && <span className={cn("as-bar", `is-${row.gap.level}`)} style={value < 0 ? { right: "50%", width: `${(-value / reach) * 50}%` } : { left: "50%", width: `${(value / reach) * 50}%` }} />}
            {row.gap && <span className={cn("as-gap-label", value < 0 ? "is-left" : "is-right")} style={value < 0 ? { right: `calc(50% + ${(-value / reach) * 50}% + 6px)` } : { left: `calc(50% + ${(value / reach) * 50}% + 6px)` }}>{row.gap.deficitPercent.toLocaleString("en-GB", { maximumFractionDigits: 1 })} %</span>}
            {!row.legs && <span className="tr-none">Not tested on both legs</span>}
          </div>
          <div className="as-power">
            {ticks.map((tick) => <span key={tick} className="tr-grid" style={{ left: at(tick) }} />)}
            {row.legs && <>
              <span className="as-link" style={{ left: at(Math.min(row.legs.left, row.legs.right)), width: `${(Math.abs(row.legs.left - row.legs.right) / (hi - lo)) * 100}%` }} />
              <span className="as-leg is-left" style={{ left: at(row.legs.left) }} title={`Left ${withUnit(row.legs.left, metric)}`}><b>L</b></span>
              <span className="as-leg is-right" style={{ left: at(row.legs.right) }} title={`Right ${withUnit(row.legs.right, metric)}`}><b>R</b></span>
            </>}
          </div>
          <div className="as-values tabular">{row.legs ? <><span>L <strong>{format(row.legs.left, metric.digits)}</strong></span><span>R <strong>{format(row.legs.right, metric.digits)}</strong></span></> : "—"}</div>
        </div>;
      })}
      {tip && <div className="tr-tip" role="tooltip" style={{ left: tip.x, top: tip.y }}><strong>{tip.title}</strong>{tip.lines.map((line) => <span key={line}>{line}</span>)}</div>}
    </div>
    <div className="tr-legend">
      <span><i className="as-key is-ok" />Under {ASYMMETRY_TAG_PERCENT} %</span>
      <span><i className="as-key is-tagged" />{ASYMMETRY_TAG_PERCENT}–{ASYMMETRY_HIGH_PERCENT} % · follow up</span>
      <span><i className="as-key is-high" />Over {ASYMMETRY_HIGH_PERCENT} % · large</span>
      <span><b className="as-key-leg">L</b><b className="as-key-leg is-right">R</b>Each leg, same scale</span>
      <HelpTip label="How the legs are split" align="end" className="ml-auto">Legs from alternating reps: in each set, reps 1, 3, 5, 7 are the starting leg (left foot forward unless the import says otherwise). Click a name for every rep.</HelpTip>
    </div>
  </div>;
}

/** One athlete's attempts, in order: a bar per rep for each metric, or each run's splits. */
function AttemptDetail({ line, metric, scored, metrics, onClose }: { line: Line; metric: AttemptMetric; scored: AttemptMetric; metrics: AttemptMetric[]; onClose(): void }) {
  const [hover, setHover] = useState<string | null>(null);
  const summary = bestAttempt(line.attempts.flatMap((attempt) => attempt.rows));
  const bestIn = (attempts: readonly Attempt[]) => attempts.reduce<Attempt | null>((top, attempt) => {
    const value = attempt.values[scored.key];
    if (typeof value !== "number") return top;
    const current = top?.values[scored.key];
    return typeof current !== "number" || (scored.best === "max" ? value > current : value < current) ? attempt : top;
  }, null)?.key;
  const bestKey = bestIn(line.attempts);
  // A one-leg test has a best rep per leg: both are results.
  const sided = line.attempts.some((attempt) => attempt.side);
  const bestKeys = new Set(sided ? [bestIn(line.attempts.filter((attempt) => attempt.side === "left")), bestIn(line.attempts.filter((attempt) => attempt.side === "right"))].filter(Boolean) : [bestKey].filter(Boolean));
  const sprint = line.attempts[0]?.rows[0].sheet === "sprint";

  return <div className="tr-detail">
    <header>
      <div className="min-w-0"><h3>{line.athlete.displayName}</h3><p>{summary ? `${summary.summary} · ${summary.outOf}` : "Entered by hand — no OVR attempts behind this result."}</p></div>
      <div className="flex items-center gap-1">
        {line.attempts.length > 0 && !sprint && <HelpTip label="What the bars show" align="end">{sided ? "Every rep in order, a gap between sets; L and R per leg. The highlighted reps are each leg’s best — the results" : "Set · rep. The highlighted rep is the one the result comes from"}{metric.key !== scored.key ? ` (best ${scored.label.toLocaleLowerCase("en-GB")})` : ""}.</HelpTip>}
        <button type="button" className="spenst-icon-button" aria-label="Close" onClick={onClose}><X size={16} /></button>
      </div>
    </header>
    {line.attempts.length > 0 && (sprint ? <SprintRuns attempts={line.attempts} bestKey={bestKey ?? null} /> : <div className="tr-multiples">
      {[metric, ...metrics.filter((candidate) => candidate.key !== metric.key), ...extraMetrics(line.attempts, metrics)].map((shown) => {
        const values = line.attempts.map((attempt) => attempt.values[shown.key] ?? (attempt.rows[0] as unknown as Record<string, unknown>)[shown.key]).filter((value): value is number => typeof value === "number");
        const top = Math.max(...values, 0);
        return <figure key={shown.key} className={cn("tr-multiple", shown.key === metric.key && "is-lead")}>
          <figcaption>{shown.label}{shown.unit ? <small> {shown.unit}</small> : null}{sided && (["left", "right"] as const).map((side) => {
            const leg = line.attempts.find((attempt) => bestKeys.has(attempt.key) && attempt.side === side);
            const raw = leg ? leg.values[shown.key] ?? (leg.rows[0] as unknown as Record<string, unknown>)[shown.key] : null;
            return typeof raw === "number" ? <span key={side} className="tr-leg-best">{side === "left" ? "L" : "R"} <b className="tabular">{format(raw, shown.digits)}</b></span> : null;
          })}</figcaption>
          <div className={cn("tr-bars", sided && "is-sided")}>
            {line.attempts.map((attempt, index) => {
              const raw = attempt.values[shown.key] ?? (attempt.rows[0] as unknown as Record<string, unknown>)[shown.key];
              const value = typeof raw === "number" ? raw : null;
              const newSet = index > 0 && attempt.rows[0].setNumber !== line.attempts[index - 1].rows[0].setNumber;
              return <div key={attempt.key} className={cn("tr-bar", bestKeys.has(attempt.key) && "is-best", newSet && "is-new-set", attempt.side === "right" && "is-right", hover === attempt.key && "is-hover")} onMouseEnter={() => setHover(attempt.key)} onMouseLeave={() => setHover(null)} title={`${attempt.label}: ${typeof value === "number" ? withUnit(value, shown) : "—"}`}>
                <span className="tr-bar-value tabular">{typeof value === "number" ? format(value, shown.digits) : ""}</span>
                <span className="tr-bar-area"><span className="tr-bar-fill" style={{ height: typeof value === "number" && top > 0 ? `${(value / top) * 100}%` : "0%" }} /></span>
                <span className="tr-bar-label">{attempt.side ? (attempt.side === "left" ? "L" : "R") : `${attempt.rows[0].setNumber ?? ""}·${attempt.rows[0].repNumber ?? ""}`}</span>
              </div>;
            })}
          </div>
        </figure>;
      })}
    </div>)}
    {[...bestKeys].map((key) => {
      const best = line.attempts.find((attempt) => attempt.key === key);
      if (!best) return null;
      return <div key={key}>
        <p className="attempt-fields-title">{sided ? `${best.side === "left" ? "Left" : "Right"} leg’s best` : "Best attempt"} · {best.label}</p>
        <dl className="attempt-fields">{attemptFields(best.rows).map((field) => <div key={field.label}><dt>{field.label}</dt><dd>{field.text}</dd></div>)}</dl>
      </div>;
    })}
  </div>;
}

/** "L" or "R" for a one-leg exercise named that way in OVR, so both legs' reps read apart. */

/** Columns not in the comparison, drawn one per rep too: load, ROM, time to peak, duration, EA index … */
const NOT_PER_REP = new Set(["setNumber", "repNumber", "sprintNumber", "splitNumber"]);
function extraMetrics(attempts: readonly Attempt[], shown: readonly AttemptMetric[]): (AttemptMetric & { column: OvrColumn })[] {
  const rows = attempts.flatMap((attempt) => attempt.rows);
  return columnsWithData(rows).columns
    .filter((column) => column.digits !== undefined && !NOT_PER_REP.has(column.key) && !shown.some((metric) => metric.key === column.key))
    .filter((column) => rows.some((row) => typeof row[column.key] === "number"))
    .map((column) => ({ key: column.key, label: column.label, unit: column.unit ?? "", digits: column.digits ?? 0, best: "max" as const, column }));
}

/** Each run as its splits laid end to end, on one time scale. */
function SprintRuns({ attempts, bestKey }: { attempts: Attempt[]; bestKey: string | null }) {
  const totals = attempts.map((attempt) => attempt.rows.reduce((sum, row) => sum + (row.splitTimeS ?? 0), 0));
  const longest = Math.max(...totals, 0.001);
  const splitCount = Math.max(...attempts.map((attempt) => attempt.rows.length));
  return <div className="tr-runs">
    {attempts.map((attempt, index) => {
      let covered = 0;
      return <div key={attempt.key} className={cn("tr-run", attempt.key === bestKey && "is-best")}>
        <span className="tr-run-label">{attempt.label}</span>
        <div className="tr-run-track">
          {attempt.rows.map((row, split) => {
            const from = covered; covered += row.distanceM ?? 0;
            return <span key={row.rowKey} className="tr-split" data-split={Math.min(split, 2)} style={{ width: `${((row.splitTimeS ?? 0) / longest) * 100}%` }} title={`${row.distanceM !== null ? `${from}–${covered} m` : "Split"}: ${format(row.splitTimeS ?? 0, 3)} s${row.speedKmh ? `, ${format(row.speedKmh, 1)} km/h` : ""}`}>
              <span className="tabular">{format(row.splitTimeS ?? 0, 2)}</span>
            </span>;
          })}
        </div>
        <span className="tr-run-total tabular">{format(totals[index], 3)} s</span>
      </div>;
    })}
    {splitCount > 1 && <div className="tr-legend" aria-hidden="true">{Array.from({ length: Math.min(splitCount, 3) }, (_, split) => <span key={split}><i className="tr-key-split" data-split={split} />Split {split + 1}</span>)}</div>}
  </div>;
}

/** Every row OVR recorded behind the test, with every column, athletes in ranking order. */
function ResultsTable({ ranked, metrics, test }: { ranked: Line[]; metrics: AttemptMetric[]; test: TestDefinition }) {
  const rows = ranked.flatMap((line) => line.attempts.flatMap((attempt) => attempt.rows));
  const { columns, extra } = columnsWithData(rows);
  const shown = columns.filter((column) => !["groups", "sport", "position"].includes(column.key));
  const rowId = (row: { athleteId: string; rowKey: string }) => `${row.athleteId}|${row.rowKey}`;
  const bestKeys = new Set(ranked.flatMap((line) => bestAttempt(line.attempts.flatMap((attempt) => attempt.rows))?.rows.map(rowId) ?? []));
  if (!rows.length) return <div className="overflow-x-auto">
    <table className="data-table ovr-table">
      <thead><tr><th scope="col">Athlete</th><th scope="col" className="num">{metrics[0]?.label ?? "Result"}</th></tr></thead>
      <tbody>{ranked.map((line) => <tr key={line.athlete.id}><th scope="row">{line.athlete.displayName}</th><td className="num">{line.value === null ? "—" : format(line.value, metrics[0]?.digits ?? 2)}</td></tr>)}</tbody>
    </table>
  </div>;
  return <div className="overflow-x-auto">
    <table className="data-table ovr-table">
      <thead><tr>
        <th scope="col"><span className="inline-flex items-center gap-1">Athlete<HelpTip label="What this table shows">{test.name}: every row OVR recorded, every column. The highlighted rows are each athlete’s best.</HelpTip></span></th>
        {shown.map((column) => <th key={column.key} scope="col" className={column.digits !== undefined ? "num" : undefined}>{column.label}{column.unit ? <small> {column.unit}</small> : null}</th>)}
        {extra.map((key) => <th key={key} scope="col">{key}</th>)}
      </tr></thead>
      <tbody>{ranked.flatMap((line) => {
        const own = line.attempts.flatMap((attempt) => attempt.rows);
        return own.map((row, index) => <tr key={rowId(row)} className={bestKeys.has(rowId(row)) ? "is-best" : undefined}>
          {index === 0 ? <th scope="row" rowSpan={own.length}>{line.athlete.displayName}</th> : null}
          {shown.map((column) => <td key={column.key} className={column.digits !== undefined ? "num" : undefined}>{formatCell(column, row[column.key])}</td>)}
          {extra.map((key) => <td key={key}>{row.extra[key] ?? "—"}</td>)}
        </tr>);
      })}</tbody>
    </table>
  </div>;
}
