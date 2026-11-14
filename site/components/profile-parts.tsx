import { AlertTriangle, CheckCircle2, Flag } from "lucide-react";
import { asymmetryLabels, sideLabels, type Asymmetry } from "@/lib/asymmetry";
import { familyLabels, familyOf, FAMILY_ORDER, formatValue, type ProfileTest } from "@/lib/power-profile";
import { resultDetailLines } from "@/lib/ovr-data";
import { cn } from "@/lib/utils";

const asymmetryIcons = { ok: CheckCircle2, tagged: Flag, high: AlertTriangle } as const;

export function AsymmetryStatus({ value, detailed = false }: { value: Asymmetry; detailed?: boolean }) {
  const Icon = asymmetryIcons[value.level];
  const percent = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 1 }).format(value.deficitPercent);
  return <span className={cn("status", `status-${value.level}`)}><Icon size={13} aria-hidden="true" />{detailed ? asymmetryLabels[value.level] + " · " : ""}{percent}%{value.weaker && value.level !== "ok" ? `, weaker ${sideLabels[value.weaker]}` : ""}</span>;
}

const RADIUS = 110;
const RINGS = [0.25, 0.5, 0.75, 1];

/**
 * One spoke per test, spanning the squad: the centre is the squad's weakest
 * result on that test and the edge its best, so the shape shows where the
 * athlete sits among the people they train with. The dashed outline is the
 * squad median. A description of this squad — not a score, not a norm. A test
 * without a result keeps its spoke with a hollow marker.
 */
/**
 * `reference` places a comparison group's average on each spoke (0–1 along the
 * squad's range); without it, the squad median.
 */
export function PowerRadar({ tests, label, reference }: { tests: readonly ProfileTest[]; label: string; reference?: readonly (number | null)[] }) {
  const count = tests.length;
  const angle = (index: number) => -Math.PI / 2 + (2 * Math.PI * index) / count;
  const point = (index: number, share: number) => [Math.cos(angle(index)) * share * RADIUS, Math.sin(angle(index)) * share * RADIUS] as const;
  const ring = (share: number) => tests.map((_, index) => point(index, share).join(",")).join(" ");
  const measured = tests.map((test, index) => ({ test, index })).filter(({ test }) => test.inSquadRange !== null);
  const medians = tests.map((test, index) => ({ index, share: reference ? reference[index] ?? null : test.squadMedianInRange })).filter((entry): entry is { index: number; share: number } => entry.share !== null);
  const percent = (share: number) => `${Math.round(share * 100)} %`;

  return <svg className="radar" viewBox="-205 -158 410 330" role="img" aria-label={label}>
    {RINGS.map((share) => <polygon key={share} className="radar-grid" points={ring(share)} />)}
    {tests.map((_, index) => { const [x, y] = point(index, 1); return <line key={index} className="radar-spoke" x1={0} y1={0} x2={x} y2={y} />; })}
    {medians.length >= 3 && <polygon className="radar-reference" points={medians.map(({ index, share }) => point(index, 0.06 + 0.94 * share).join(",")).join(" ")} />}
    {measured.length >= 3 && <polygon className="radar-area" points={measured.map(({ test, index }) => point(index, 0.06 + 0.94 * (test.inSquadRange as number)).join(",")).join(" ")} />}
    {tests.map((test, index) => {
      // A little off the centre, so the squad's weakest still shows as a point.
      const [x, y] = point(index, 0.06 + 0.94 * (test.inSquadRange ?? 0));
      // The hover names the attempt behind the value, when OVR measured it.
      const title = [`${test.test.name}: ${test.latest ? `${formatValue(test.latest.value, test.test.unit)} · ${percent(test.ofSquadBest ?? 0)} of the squad’s best${test.rank ? ` · ${test.rank} of ${test.ranked}` : ""}` : "not tested"}`, ...resultDetailLines(test.latest)].join("\n");
      const [rimX, rimY] = point(index, 1);
      return <g key={test.test.key} data-family={familyOf(test.test)}>
        <title>{title}</title>
        <circle className="radar-rim" cx={rimX} cy={rimY} r={3.5} />
        <circle className="radar-hit" cx={x} cy={y} r={12} />
        {test.inSquadRange === null
          ? <circle className="radar-point-missing" cx={point(index, 0.12)[0]} cy={point(index, 0.12)[1]} r={4} />
          : <circle className="radar-point" cx={x} cy={y} r={4.5} />}
      </g>;
    })}
    {tests.map((test, index) => {
      const [x, y] = point(index, 1 + 18 / RADIUS);
      const anchor = Math.abs(x) < 8 ? "middle" : x > 0 ? "start" : "end";
      const baseline = y < -RADIUS ? -6 : y > RADIUS ? 10 : 3;
      return <text key={test.test.key} x={x} y={y + baseline} textAnchor={anchor}>
        <tspan className="radar-label">{test.test.shortName}</tspan>
        <tspan className="radar-label-score" x={x} dy={13}>{test.latest ? formatValue(test.latest.value, test.test.unit) : "–"}</tspan>
      </text>;
    })}
  </svg>;
}

/** The colour key for the families a set of tests uses. */
export function FamilyLegend({ tests }: { tests: readonly { quality: ProfileTest["test"]["quality"] }[] }) {
  const families = FAMILY_ORDER.filter((family) => tests.some((test) => familyOf(test) === family));
  return <div className="family-legend" aria-hidden="true">{families.map((family) => <span key={family} data-family={family}><i className="family-dot" />{familyLabels[family]}</span>)}</div>;
}
