"use client";

import { formatDay } from "@/lib/utils";

const WIDTH = 320;
const HEIGHT = 150;
const PAD = { left: 40, right: 14, top: 14, bottom: 24 };

/**
 * The best value of each day as a line: one series, its own scale, the
 * latest value labelled. Days are spaced by date, so a gap in training reads
 * as a gap.
 */
export function OvrTrendChart({ points, unit, digits, label, caption, family }: { points: { date: string; value: number }[]; unit: string; digits: number; label: string; caption?: string; family?: string }) {
  if (points.length < 2) return <div className="lv-empty">{points.length ? "One day so far — the trend starts with the next." : "No values to draw yet."}</div>;
  const format = (value: number) => new Intl.NumberFormat("en-GB", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
  const day = (date: string) => Date.parse(`${date}T00:00:00Z`);
  const [first, last] = [day(points[0].date), day(points.at(-1)!.date)];
  const values = points.map((point) => point.value);
  const [low, high] = [Math.min(...values), Math.max(...values)];
  const margin = (high - low) * 0.15 || Math.abs(high) * 0.05 || 1;
  const [yMin, yMax] = [low - margin, high + margin];
  const x = (date: string) => PAD.left + ((day(date) - first) / Math.max(1, last - first)) * (WIDTH - PAD.left - PAD.right);
  const y = (value: number) => PAD.top + (1 - (value - yMin) / (yMax - yMin)) * (HEIGHT - PAD.top - PAD.bottom);
  const path = points.map((point, index) => `${index ? "L" : "M"} ${x(point.date).toFixed(1)} ${y(point.value).toFixed(1)}`).join(" ");
  const end = points.at(-1)!;
  return <figure className="lv-chart" data-family={family}>
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={label}>
      {[low, high].map((tick) => <g key={tick}>
        <line className="lv-grid" x1={PAD.left} x2={WIDTH - PAD.right} y1={y(tick)} y2={y(tick)} />
        <text className="lv-axis" x={PAD.left - 6} y={y(tick) + 3} textAnchor="end">{format(tick)}</text>
      </g>)}
      <text className="lv-axis" x={PAD.left} y={HEIGHT - 6}>{formatDay(points[0].date, { day: "numeric", month: "short" })}</text>
      <text className="lv-axis" x={WIDTH - PAD.right} y={HEIGHT - 6} textAnchor="end">{formatDay(end.date, { day: "numeric", month: "short" })}</text>
      <path className="lv-current" d={path} fill="none" />
      {points.map((point) => <circle key={point.date} className="lv-point" cx={x(point.date)} cy={y(point.value)} r={3.5}><title>{formatDay(point.date)}: {format(point.value)} {unit}</title></circle>)}
      <text className="lv-label" x={x(end.date) - 6} y={y(end.value) - 9} textAnchor="end">{format(end.value)} {unit}</text>
    </svg>
    {caption && <figcaption className="lv-legend">{caption}</figcaption>}
  </figure>;
}
