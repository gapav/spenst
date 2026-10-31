"use client";

import { Medal } from "lucide-react";
import { useMemo, useState } from "react";
import { useSpenst } from "@/components/app-provider";
import { AppShell } from "@/components/app-shell";
import { PageHeading } from "@/components/page-heading";
import { EmptyState, inputClass } from "@/components/ui";
import { rankEntries } from "@/lib/leaderboard";
import { batteryFor, familyOf, formatChange, formatValue, shareOfBest, TESTS, type TestKey } from "@/lib/power-profile";
import { teamAthletes } from "@/lib/squad";
import type { TestResult } from "@/lib/types";
import { cn, formatDay } from "@/lib/utils";

/** One value per athlete for a test on a day; a sided test needs both legs and uses their mean. */
function dayValues(results: readonly TestResult[], testKey: TestKey): { athleteId: string; value: number }[] {
  const byAthlete = new Map<string, TestResult[]>();
  for (const result of results) if (result.testKey === testKey) byAthlete.set(result.athleteId, [...(byAthlete.get(result.athleteId) ?? []), result]);
  return [...byAthlete].flatMap(([athleteId, rows]) => {
    if (!TESTS[testKey].sided) { const row = rows.find((candidate) => candidate.side === null); return row ? [{ athleteId, value: row.value }] : []; }
    const left = rows.find((row) => row.side === "left"); const right = rows.find((row) => row.side === "right");
    return left && right ? [{ athleteId, value: (left.value + right.value) / 2 }] : [];
  });
}

export default function LeaderboardPage() {
  const { currentTeam, athletes, testDays, results, workspaceLoaded, customBatteries } = useSpenst();
  const teamDays = useMemo(() => testDays.filter((day) => day.teamId === currentTeam?.id).sort((a, b) => b.heldOn.localeCompare(a.heldOn)), [testDays, currentTeam?.id]);
  const [dayId, setDayId] = useState<string | null>(null);
  const [view, setView] = useState<TestKey | null>(null);
  const day = teamDays.find((candidate) => candidate.id === dayId) ?? teamDays[0] ?? null;
  const battery = currentTeam ? batteryFor(currentTeam, customBatteries).tests : [];
  const names = new Map(teamAthletes(athletes, currentTeam?.id).map((athlete) => [athlete.id, athlete.displayName]));
  const dayResults = day ? results.filter((result) => result.testDayId === day.id && names.has(result.athleteId)) : [];
  const lists = battery.map((key) => ({ key, ranked: rankEntries(dayValues(dayResults, key), (entry) => entry.value, TESTS[key].direction) }));
  const run = lists.filter((list) => list.ranked.length > 0);
  const active = run.find((list) => list.key === view) ?? run[0] ?? null;

  return <AppShell><div className="spenst-page">
    <PageHeading eyebrow={currentTeam?.name ?? "Spenst"} title="Leaderboard" description="Each test in order, as measured on the test day. No points and no totals — just who was quickest, highest or strongest, and by how much." actions={teamDays.length > 1 && <select className={cn(inputClass, "w-auto")} value={day?.id ?? ""} onChange={(event) => setDayId(event.target.value)} aria-label="Test day">{teamDays.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.title} · {formatDay(candidate.heldOn)}</option>)}</select>} />
    {!workspaceLoaded ? <p role="status" className="spenst-loading">Loading results …</p> : !day || !run.length
      ? <EmptyState icon={<Medal size={24} />} title="No results to rank" body="The leaderboard fills up once the test day has results." />
      : <>
        <div className="chip-row mb-4" role="group" aria-label="Choose a test">
          {run.map((list) => <button key={list.key} type="button" aria-pressed={active?.key === list.key} onClick={() => setView(list.key)}>{TESTS[list.key].name}</button>)}
        </div>
        {active && <section className="spenst-card spenst-rows overflow-hidden" aria-label={TESTS[active.key].name} data-family={familyOf(TESTS[active.key])}>
          {active.ranked.map(({ entry, rank }, index) => <div key={entry.athleteId} className={cn("board-row", rank === 1 && "is-leader")}>
            <span className="board-rank">{rank}</span>
            <span className="board-name">{names.get(entry.athleteId)}</span>
            {/* Share of the leader's result: for a time, the leader's time over this one. */}
            <span className="board-bar" aria-hidden="true"><span style={{ width: `${Math.round(shareOfBest(entry.value, active.ranked[0].entry.value, TESTS[active.key].direction) * 100)}%` }} /></span>
            <span className="board-value">{formatValue(entry.value, TESTS[active.key].unit)}</span>
            <span className="board-points">{index === 0 ? "" : formatChange(entry.value - active.ranked[0].entry.value, TESTS[active.key].unit)}</span>
          </div>)}
        </section>}
      </>}
  </div></AppShell>;
}
