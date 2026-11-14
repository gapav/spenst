"use client";

import { ArrowRight, CalendarDays, ChevronRight, Flag, Medal, Upload, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useSpenst } from "./app-provider";
import { AppShell } from "./app-shell";
import { WinButton } from "./win";
import { overviewHeadline, overviewHeadlines, overviewSalutation } from "@/lib/overview";
import { asymmetryFlags, summarizeSquad, teamAthletes, testDayProgress } from "@/lib/squad";
import { batteryFor, familyOf, formatValue, TESTS } from "@/lib/power-profile";
import { resultDetailLines } from "@/lib/ovr-data";
import { formatDay, localDateKey } from "@/lib/utils";

export function Overview() {
  const { user, currentTeam, athletes, testDays, results, measurements, workspaceLoaded, createTestDay, customBatteries } = useSpenst();
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The clock is the browser’s: read after mount so server and client agree.
  const [now, setNow] = useState<Date | null>(null);
  const [headline, setHeadline] = useState<string>(overviewHeadlines[0]);
  useEffect(() => {
    const draw = () => { setNow(new Date()); setHeadline(overviewHeadline()); };
    draw();
  }, []);

  const squad = useMemo(() => teamAthletes(athletes, currentTeam?.id), [athletes, currentTeam?.id]);
  const battery = batteryFor(currentTeam, customBatteries).tests;
  const summaries = useMemo(() => now ? summarizeSquad({ athletes: squad, results, testDays, measurements, asOf: now, battery }) : [], [squad, results, testDays, measurements, now, battery]);
  const flags = asymmetryFlags(summaries);
  // The squad's best on each test, from everyone's latest result: who sets the mark.
  const bests = currentTeam ? battery.flatMap((key) => {
    const leader = summaries.map((summary) => ({ summary, test: summary.profile.tests.find((test) => test.test.key === key) })).find(({ test }) => test?.rank === 1 && test.latest);
    return leader?.test?.latest ? [{ key, name: leader.summary.athlete.displayName, value: leader.test.latest.value, details: resultDetailLines(leader.test.latest) }] : [];
  }) : [];
  const latestDay = testDays.filter((day) => day.teamId === currentTeam?.id).sort((a, b) => b.heldOn.localeCompare(a.heldOn))[0] ?? null;
  const progress = latestDay ? testDayProgress(latestDay, athletes, results) : null;
  const firstName = user?.fullName.trim().split(/\s+/)[0] || "coach";
  const loading = !workspaceLoaded || !now;

  async function startTestDay() {
    if (creating || !currentTeam) return;
    setCreating(true); setError(null);
    try { const id = await createTestDay({ title: "Test day", heldOn: localDateKey(new Date()) }); router.push(`/testing?day=${id}`); }
    catch { setError("We couldn’t create the test day. Try again."); }
    finally { setCreating(false); }
  }

  return <AppShell><div className="overview">
    <div className="overview-topbar"><span className="overview-team">{currentTeam?.name ?? "Röskr"}</span></div>
    <header className="overview-welcome">
      <p className="overview-greeting">{overviewSalutation(now)}, {firstName}</p>
      <h1>{headline}</h1>
      <WinButton plain kind="gun" className="spenst-action" onClick={() => void startTestDay()} disabled={creating || loading || !currentTeam}>
        {creating ? "Setting up …" : "New test day"}<ArrowRight size={19} />
      </WinButton>
      <div className="overview-art-crop" aria-hidden="true"><OverviewArt /></div>
    </header>
    {error && <p role="alert" className="spenst-context-note">{error}</p>}
    {loading ? <div className="spenst-loading" role="status">Loading the team’s tests …</div> : !currentTeam
      ? <section className="overview-card overview-lead"><Users size={26} /><h2>Welcome to Röskr</h2><p className="text-[var(--ink-soft)]">When you are added to a team, its athletes and tests show up here.</p></section>
      : <>
        <div className="overview-cards">
          <section className="overview-card overview-lead" aria-labelledby="latest-day-heading">
            <div className="overview-card-label"><span>{latestDay ? "Latest test day" : "No test days yet"}</span><CalendarDays size={19} /></div>
            {latestDay && progress ? <>
              <h2 id="latest-day-heading">{latestDay.title}</h2>
              <p className="overview-lead-meta"><span>{formatDay(latestDay.heldOn, { weekday: "long", day: "numeric", month: "long" })}</span><span>{progress.tested} of {progress.squad} tested</span></p>
              <div className="overview-progress"><span className="spenst-bar"><span style={{ width: `${progress.squad ? (100 * progress.tested) / progress.squad : 0}%` }} /></span><small>{progress.tested === progress.squad ? "The whole squad is tested." : `${progress.squad - progress.tested} left to test.`}</small></div>
              <Link className="spenst-action spenst-action-secondary" href={`/testing?day=${latestDay.id}`}>{progress.tested === progress.squad ? "See the results" : "Continue recording"}<ArrowRight size={17} /></Link>
            </> : <>
              <h2 id="latest-day-heading">The first test sets the baseline.</h2>
              <p className="overview-lead-meta">Sprints, jumps and bar speed give every athlete a power profile — and a baseline to measure progress against.</p>
              <Link className="spenst-text-link" href="/testing">See the test battery<ArrowRight size={17} /></Link>
            </>}
          </section>
          <div className="overview-shortcuts">
            <Link href="/athletes" className="overview-card overview-shortcut"><span className="overview-shortcut-icon warn"><Flag size={24} strokeWidth={1.7} /></span><span><strong>{flags.length ? `${flags.length} with asymmetry` : "No asymmetry to follow up"}</strong><small>{flags.length ? flags.slice(0, 3).map((flag) => flag.athlete.displayName).join(", ") : "Split squat jump within 3% for everyone"}</small></span><ChevronRight size={19} /></Link>
            <Link href="/leaderboard" className="overview-card overview-shortcut"><span className="overview-shortcut-icon lime"><Medal size={24} strokeWidth={1.7} /></span><span><strong>Leaderboard</strong><small>Each test in order, and by how much</small></span><ChevronRight size={19} /></Link>
            <Link href="/testing/import" className="overview-card overview-shortcut"><span className="overview-shortcut-icon"><Upload size={24} strokeWidth={1.7} /></span><span><strong>Import from OVR</strong><small>The export fills in test days and every rep</small></span><ChevronRight size={19} /></Link>
          </div>
        </div>
        {bests.length > 0 && <section className="overview-card overview-band" aria-labelledby="squad-bests-heading">
          <h2 id="squad-bests-heading">Squad bests</h2>
          <p>The best latest result on each test · {squad.length} athletes</p>
          <ul className="squad-bests">{bests.map((best) => <li key={best.key} data-family={familyOf(TESTS[best.key])} title={[`${TESTS[best.key].name}: ${formatValue(best.value, TESTS[best.key].unit)} · ${best.name}`, ...best.details].join("\n")}><small><i className="family-dot" />{TESTS[best.key].shortName}</small><strong className="tabular">{formatValue(best.value, TESTS[best.key].unit)}</strong><span>{best.name}</span></li>)}</ul>
        </section>}
      </>}
  </div></AppShell>;
}

/**
 * Decorative: a power profile on a night panel. Seven spokes, as in
 * Spenst 7; the dashed ring is the squad’s best, and the one test this
 * profile leads touches it. The centre is the viewBox’s, so CSS places it.
 */
function OverviewArt() {
  const spokes = 7;
  const radius = 124;
  const at = (index: number, share: number) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * index) / spokes;
    return [Math.cos(angle) * radius * share, Math.sin(angle) * radius * share] as const;
  };
  const outline = (shares: readonly number[]) => shares.map((share, index) => at(index, share).map((value) => value.toFixed(1)).join(",")).join(" ");
  const ring = (share: number) => outline(Array.from({ length: spokes }, () => share));
  const [peakX, peakY] = at(0, 1);
  return <svg className="overview-art" viewBox="-135 -178 270 270" focusable="false">
    <polygon className="art-shape" points={outline([1, 0.7, 0.8, 0.62, 0.74, 0.64, 0.84])} />
    <polygon className="art-grid" points={ring(0.5)} />
    <polygon className="art-grid" points={ring(0.75)} />
    {Array.from({ length: spokes }, (_, index) => { const [x, y] = at(index, 1); return <line key={index} className="art-grid" x1={0} y1={0} x2={x.toFixed(1)} y2={y.toFixed(1)} />; })}
    <polygon className="art-best" points={ring(1)} />
    <circle className="art-peak" cx={peakX.toFixed(1)} cy={peakY.toFixed(1)} r={8} />
  </svg>;
}
