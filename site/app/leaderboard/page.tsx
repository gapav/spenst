"use client";

import { Medal } from "lucide-react";
import { useMemo, useState } from "react";
import { useSpenst } from "@/components/app-provider";
import { AppShell } from "@/components/app-shell";
import { PageHeading } from "@/components/page-heading";
import { EmptyState, inputClass } from "@/components/ui";
import { rankEntries } from "@/lib/leaderboard";
import { detailsOutOf, RESULT_METRICS, resultDetailLines, resultMetrics, type AttemptMetric } from "@/lib/ovr-data";
import { batteryFor, familyOf, formatChange, formatValue, shareOfBest, TESTS, type TestKey } from "@/lib/power-profile";
import { teamAthletes } from "@/lib/squad";
import type { AttemptDetailKey, AttemptDetails, Side, TestResult } from "@/lib/types";
import { cn, formatDay } from "@/lib/utils";

type RankMetric = AttemptMetric & { key: AttemptDetailKey };

interface Entry {
  athleteId: string;
  value: number;
  details: AttemptDetails | null;
  sideDetails: Partial<Record<Side, AttemptDetails>>;
}

/**
 * One value per athlete for a test on a day; a sided test needs both legs and
 * uses their mean. Ranked on the scored value, or on another metric stored
 * with the result's best attempt (decision 27) — then only results with it.
 */
function dayValues(results: readonly TestResult[], testKey: TestKey, metric: RankMetric | null): Entry[] {
  const read = (result: TestResult) => metric ? result.details?.[metric.key] : result.value;
  const byAthlete = new Map<string, TestResult[]>();
  for (const result of results) if (result.testKey === testKey) byAthlete.set(result.athleteId, [...(byAthlete.get(result.athleteId) ?? []), result]);
  return [...byAthlete].flatMap(([athleteId, rows]): Entry[] => {
    if (!TESTS[testKey].sided) {
      const row = rows.find((candidate) => candidate.side === null);
      const value = row ? read(row) : undefined;
      return row && typeof value === "number" ? [{ athleteId, value, details: row.details ?? null, sideDetails: {} }] : [];
    }
    const left = rows.find((row) => row.side === "left"); const right = rows.find((row) => row.side === "right");
    const [l, r] = [left && read(left), right && read(right)];
    if (!left || !right || typeof l !== "number" || typeof r !== "number") return [];
    const sideDetails: Partial<Record<Side, AttemptDetails>> = {};
    if (left.details) sideDetails.left = left.details;
    if (right.details) sideDetails.right = right.details;
    return [{ athleteId, value: (l + r) / 2, details: null, sideDetails }];
  });
}

const formatMetric = (value: number, metric: RankMetric) => `${new Intl.NumberFormat("en-GB", { minimumFractionDigits: metric.digits, maximumFractionDigits: metric.digits }).format(value)}${metric.unit ? ` ${metric.unit}` : ""}`;
const formatMetricChange = (change: number, metric: RankMetric) => `${change > 0 ? "+" : change < 0 ? "−" : "±"}${formatMetric(Math.abs(change), metric)}`;

export default function LeaderboardPage() {
  const { currentTeam, athletes, testDays, results, workspaceLoaded, customBatteries } = useSpenst();
  const teamDays = useMemo(() => testDays.filter((day) => day.teamId === currentTeam?.id).sort((a, b) => b.heldOn.localeCompare(a.heldOn)), [testDays, currentTeam?.id]);
  const [dayId, setDayId] = useState<string | null>(null);
  const [view, setView] = useState<TestKey | null>(null);
  const [metricKey, setMetricKey] = useState<AttemptDetailKey | null>(null);
  const day = teamDays.find((candidate) => candidate.id === dayId) ?? teamDays[0] ?? null;
  const battery = currentTeam ? batteryFor(currentTeam, customBatteries).tests : [];
  const names = new Map(teamAthletes(athletes, currentTeam?.id).map((athlete) => [athlete.id, athlete.displayName]));
  const dayResults = day ? results.filter((result) => result.testDayId === day.id && names.has(result.athleteId)) : [];
  const lists = battery.map((key) => ({ key, ranked: rankEntries(dayValues(dayResults, key, null), (entry) => entry.value, TESTS[key].direction) }));
  const run = lists.filter((list) => list.ranked.length > 0);
  const chosen = run.find((list) => list.key === view) ?? run[0] ?? null;
  // The other metrics stored with this test's results; the scored one stays the default.
  const metrics = chosen ? resultMetrics(dayResults.filter((result) => result.testKey === chosen.key)) : [];
  const metric = metrics.find((candidate) => candidate.key === metricKey) ?? null;
  const sheet = chosen ? dayResults.find((result) => result.testKey === chosen.key && result.details)?.details?.sheet : undefined;
  const scoredLabel = sheet ? RESULT_METRICS[sheet][0].label : "Result";
  const active = chosen && metric
    ? { key: chosen.key, ranked: rankEntries(dayValues(dayResults, chosen.key, metric), (entry) => entry.value, metric.best === "min" ? "lower" : "higher") }
    : chosen;
  const test = active ? TESTS[active.key] : null;
  const show = (value: number) => metric ? formatMetric(value, metric) : formatValue(value, test!.unit);
  const change = (value: number) => metric ? formatMetricChange(value, metric) : formatChange(value, test!.unit);
  const direction = metric ? (metric.best === "min" ? "lower" : "higher") : test?.direction ?? "higher";

  return <AppShell><div className="spenst-page">
    <PageHeading eyebrow={currentTeam?.name ?? "Röskr"} title="Leaderboard" description="Each test in order, as measured on the test day. No points and no totals — just who was quickest, highest or strongest, and by how much." actions={teamDays.length > 1 && <select className={cn(inputClass, "w-auto")} value={day?.id ?? ""} onChange={(event) => setDayId(event.target.value)} aria-label="Test day">{teamDays.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.title} · {formatDay(candidate.heldOn)}</option>)}</select>} />
    {!workspaceLoaded ? <p role="status" className="spenst-loading">Loading results …</p> : !day || !run.length
      ? <EmptyState icon={<Medal size={24} />} title="No results to rank" body="The leaderboard fills up once the test day has results." />
      : <>
        <div className="chip-row mb-4" role="group" aria-label="Choose a test">
          {run.map((list) => <button key={list.key} type="button" aria-pressed={chosen?.key === list.key} onClick={() => setView(list.key)}>{TESTS[list.key].name}</button>)}
        </div>
        {metrics.length > 0 && test && <div className="chip-row mb-4" role="group" aria-label="Rank on">
          <button type="button" aria-pressed={!metric} onClick={() => setMetricKey(null)}>{scoredLabel}<small>the test</small></button>
          {metrics.map((candidate) => <button key={candidate.key} type="button" aria-pressed={metric?.key === candidate.key} onClick={() => setMetricKey(candidate.key)}>{candidate.label}</button>)}
        </div>}
        {active && test && <>
          <p className="mb-3 text-sm text-[var(--ink-soft)]">Ranked on {metric ? `${metric.label.toLocaleLowerCase("en-GB")}, from each result’s best attempt` : sheet ? `${scoredLabel.toLocaleLowerCase("en-GB")}, the test’s result` : "the test’s result"} · {direction} is better{test.sided ? " · mean of both legs" : ""}</p>
          <section className="spenst-card spenst-rows overflow-hidden" aria-label={`${test.name}, ranked on ${metric ? metric.label : "the result"}`} data-family={familyOf(test)}>
            {active.ranked.map(({ entry, rank }, index) => {
              const details = resultDetailLines(entry);
              const outOf = detailsOutOf(entry.details);
              return <div key={entry.athleteId} className={cn("board-row", rank === 1 && "is-leader")} title={[`${names.get(entry.athleteId)}: ${show(entry.value)}`, ...details, outOf].filter(Boolean).join("\n")}>
                <span className="board-rank">{rank}</span>
                <span className="board-name">{names.get(entry.athleteId)}{details.length > 0 && <span className="board-detail">{details.join(" · ")}</span>}</span>
                {/* Share of the leader's result: for a time, the leader's time over this one. */}
                <span className="board-bar" aria-hidden="true"><span style={{ width: `${Math.round(shareOfBest(entry.value, active.ranked[0].entry.value, direction) * 100)}%` }} /></span>
                <span className="board-value">{show(entry.value)}</span>
                <span className="board-points">{index === 0 ? "" : change(entry.value - active.ranked[0].entry.value)}</span>
              </div>;
            })}
          </section>
        </>}
      </>}
  </div></AppShell>;
}
