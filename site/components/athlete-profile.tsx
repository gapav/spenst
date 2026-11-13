"use client";

import { ArrowLeft, Ruler, ShieldCheck, UserRound } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSpenst } from "./app-provider";
import { AppShell } from "./app-shell";
import { AthleteOvrData } from "./athlete-ovr-data";
import { EditAthleteButton } from "./add-athlete";
import { PageHeading } from "./page-heading";
import { AsymmetryStatus, FamilyLegend, PowerRadar } from "./profile-parts";
import { AthleteTests, type Comparison } from "./athlete-tests";
import { EmptyState } from "./ui";
import { ASYMMETRY_HIGH_PERCENT, ASYMMETRY_TAG_PERCENT } from "@/lib/asymmetry";
import { positionLabels } from "@/lib/labels";
import { ageInYears, decimalAge, maturityOffset, phvLabels, phvStatus } from "@/lib/maturity";
import { batteryFor, dateResults, formatValue, groupLatestAverage, positionInRange } from "@/lib/power-profile";
import { codDeficit } from "@/lib/sprint";
import { summarizeSquad } from "@/lib/squad";
import { formatDay } from "@/lib/utils";

const oneDecimal = new Intl.NumberFormat("en-GB", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function AthleteProfileScreen({ athleteId }: { athleteId: string }) {
  const { athletes, teams, currentTeam, results, testDays, measurements, workspaceLoaded, customBatteries } = useSpenst();
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => { const tick = () => setNow(new Date()); tick(); }, []);
  const athlete = athletes.find((candidate) => candidate.id === athleteId) ?? null;
  // The battery of the team being looked at, or the athlete's first team's.
  const battery = useMemo(() => {
    const team = athlete?.teamIds.includes(currentTeam?.id ?? "") ? currentTeam : teams.find((candidate) => athlete?.teamIds.includes(candidate.id));
    return batteryFor(team, customBatteries);
  }, [athlete, currentTeam, teams, customBatteries]);
  // Compared with the athletes they train with: everyone on any of their teams.
  const squad = useMemo(() => athlete ? athletes.filter((candidate) => candidate.teamIds.some((teamId) => athlete.teamIds.includes(teamId))) : [], [athlete, athletes]);
  const summary = useMemo(() => {
    if (!athlete || !now) return null;
    return summarizeSquad({ athletes: squad, results, testDays, measurements, asOf: now, battery: battery.tests }).find((entry) => entry.athlete.id === athlete.id) ?? null;
  }, [athlete, squad, now, results, testDays, measurements, battery]);
  const squadResults = useMemo(() => {
    const ids = new Set(squad.map((candidate) => candidate.id));
    return dateResults(results.filter((result) => ids.has(result.athleteId)), testDays);
  }, [squad, results, testDays]);
  // Compared with the others: the whole squad, or those who play the same position.
  const [compareWith, setCompareWith] = useState<"squad" | "position">("squad");
  const groups = useMemo(() => {
    const others = squad.filter((candidate) => candidate.id !== athlete?.id);
    const samePosition = athlete?.position ? others.filter((candidate) => candidate.position === athlete.position) : [];
    const position = athlete?.position ? positionLabels[athlete.position] : null;
    return {
      squad: { label: "Squad average", athleteIds: new Set(others.map((candidate) => candidate.id)), count: others.length } as Comparison & { count: number },
      position: { label: position ? `${position}s’ average` : "Position average", athleteIds: new Set(samePosition.map((candidate) => candidate.id)), count: samePosition.length } as Comparison & { count: number },
      positionName: position,
    };
  }, [squad, athlete]);
  const comparison = compareWith === "position" && groups.position.count > 0 ? groups.position : groups.squad;

  if (!workspaceLoaded || !now) return <AppShell><div className="spenst-page"><p role="status" className="spenst-loading">Loading the profile …</p></div></AppShell>;
  if (!athlete || !summary) return <AppShell><div className="spenst-page"><EmptyState icon={<UserRound size={24} />} title="Athlete not found" body="This athlete doesn’t exist, or isn’t on any of your teams." action={<Link className="spenst-action" href="/athletes">To the athletes</Link>} /></div></AppShell>;

  const { profile, asymmetry, measurement } = summary;
  const teamNames = teams.filter((team) => athlete.teamIds.includes(team.id)).map((team) => team.shortName).join(" · ");
  const split = profile.tests.find((test) => test.test.sided);
  const latestOf = (key: string) => profile.tests.find((test) => test.test.key === key)?.latest?.value ?? null;
  const sprint10 = latestOf("sprint_10m");
  const cod = latestOf("cod_505");
  const deficit = sprint10 !== null && cod !== null ? codDeficit(cod, sprint10) : null;
  // The offset is true on the day of the measurement, so age at PHV is read
  // from the age on that day, not today’s.
  const measuredAge = measurement ? decimalAge(athlete.birthMonth, new Date(`${measurement.measuredOn}T12:00:00Z`)) : null;
  const offset = profile.population === "youth" && measurement && measuredAge !== null ? maturityOffset({ sex: athlete.sex, ageYears: measuredAge, heightCm: measurement.heightCm, sittingHeightCm: measurement.sittingHeightCm }) : null;

  return <AppShell><div className="spenst-page">
    <Link href="/athletes" className="spenst-text-link mb-3 text-[var(--ink-soft)]"><ArrowLeft size={16} />All athletes</Link>
    <PageHeading
      eyebrow={teamNames || "Athlete"}
      title={athlete.displayName}
      description={[`${ageInYears(athlete.birthMonth, now)} years`, athlete.position && positionLabels[athlete.position], `${battery.name} battery`].filter(Boolean).join(" · ")}
      actions={<EditAthleteButton athlete={athlete} />}
    />

    <div className="compare-bar" role="group" aria-label="Compare with">
      <span>Compare with</span>
      <div className="spenst-segments">
        <button type="button" aria-pressed={comparison === groups.squad} onClick={() => setCompareWith("squad")}>Squad<small>{groups.squad.count}</small></button>
        <button type="button" aria-pressed={comparison === groups.position} disabled={!groups.position.count} title={!groups.positionName ? "No position on file" : !groups.position.count ? `Nobody else on the team plays ${groups.positionName.toLocaleLowerCase("en-GB")}` : undefined} onClick={() => setCompareWith("position")}>{groups.positionName ? `${groups.positionName}s` : "Position"}<small>{groups.position.count}</small></button>
      </div>
      <p>{comparison === groups.position ? `The other ${groups.positionName?.toLocaleLowerCase("en-GB")}s on the team` : "Everyone else on the team"}{comparison.athleteIds.size < 3 ? " — a small group, read it as a pointer, not a benchmark." : "."}</p>
    </div>
    <div className="profile-layout">
      <section className="spenst-card p-5" aria-labelledby="radar-heading">
        <h2 id="radar-heading" className="text-base font-semibold">Power profile</h2>
        <p className="mt-1 text-sm text-[var(--ink-soft)]">Each spoke runs from the squad’s weakest result on that test (centre) to its best (edge); the dashed line is the {comparison.label.toLocaleLowerCase("en-GB")}. A picture of this squad, not a score.</p>
        <div className="mt-4"><PowerRadar tests={profile.tests} reference={profile.tests.map((test) => { const average = groupLatestAverage(squadResults, comparison.athleteIds, test.test.key); return average === null ? null : positionInRange(test.squadRange, average); })} label={`Power profile for ${athlete.displayName}: ${profile.tests.map((test) => `${test.test.name} ${test.latest ? formatValue(test.latest.value, test.test.unit) : "not tested"}`).join(", ")}`} /></div>
        <FamilyLegend tests={profile.tests.map((test) => test.test)} />
      </section>

      <AthleteTests athleteId={athlete.id} tests={profile.tests} results={squadResults} comparison={comparison} />
    </div>

    <div className="mt-5 grid gap-5 lg:grid-cols-3">
      <section className="spenst-card p-5" aria-labelledby="asymmetry-heading">
        <h2 id="asymmetry-heading" className="text-base font-semibold">Asymmetry</h2>
        {asymmetry && split?.latest ? <>
          <div className="mt-3"><AsymmetryStatus value={asymmetry} detailed /></div>
          <div className="stat-grid mt-4">
            <div className="stat-tile"><small>Left</small><strong>{formatValue(split.latest.sides.left ?? 0, "W")}</strong></div>
            <div className="stat-tile"><small>Right</small><strong>{formatValue(split.latest.sides.right ?? 0, "W")}</strong></div>
          </div>
          <p className="mt-4 text-sm leading-6 text-[var(--ink-soft)]">Split squat jump, best rep per leg. Above {ASYMMETRY_TAG_PERCENT}% is tagged for extra single-leg volume on the weaker side; above {ASYMMETRY_HIGH_PERCENT}% needs close follow-up.</p>
        </> : <p className="mt-3 text-sm leading-6 text-[var(--ink-soft)]">Needs a split squat jump on both legs from the same test day.</p>}
      </section>

      <section className="spenst-card p-5" aria-labelledby="cod-heading">
        <h2 id="cod-heading" className="text-base font-semibold">Change of direction</h2>
        {deficit !== null ? <>
          <div className="stat-tile mt-4"><small>COD deficit</small><strong>{formatValue(deficit, "s")}</strong><span>505 minus 10 m sprint</span></div>
          <p className="mt-4 text-sm leading-6 text-[var(--ink-soft)]">Separates slow from poor at turning: a large deficit with a good 10 m time points at the turn, not the speed.</p>
        </> : <p className="mt-3 text-sm leading-6 text-[var(--ink-soft)]">Needs both the 505 and the 10 m sprint.</p>}
      </section>

      {profile.population === "youth" ? <section className="spenst-card p-5" aria-labelledby="maturity-heading">
        <h2 id="maturity-heading" className="flex items-center gap-2 text-base font-semibold"><Ruler size={17} />Maturity</h2>
        {!athlete.measurementConsent ? <div className="spenst-context-note mt-3"><ShieldCheck size={18} /><p>No consent to store height and weight, so power tests are not scored per kilo.</p></div>
          : offset === null || !measurement ? <p className="mt-3 text-sm leading-6 text-[var(--ink-soft)]">Measure height{athlete.sex === "M" ? ", sitting height" : ""} and weight to estimate where the athlete is in the growth spurt.</p>
          : <>
            <p className="mt-3"><span className="status status-info">{phvLabels[phvStatus(offset)]}</span></p>
            <div className="stat-grid mt-4">
              <div className="stat-tile"><small>Years from peak height velocity</small><strong>{offset > 0 ? "+" : ""}{oneDecimal.format(offset)}</strong><span>± about 1 year</span></div>
              <div className="stat-tile"><small>Estimated age at PHV</small><strong>{oneDecimal.format((measuredAge ?? 0) - offset)}</strong><span>measured {formatDay(measurement.measuredOn)}</span></div>
            </div>
            <p className="mt-4 text-sm leading-6 text-[var(--ink-soft)]">Moore et al. (2015). An estimate to read as a band, not a number to rank on — and one reason youth power tests are scored per kilo.</p>
          </>}
      </section> : <section className="spenst-card p-5" aria-labelledby="body-heading">
        <h2 id="body-heading" className="text-base font-semibold">Body mass</h2>
        {measurement ? <div className="stat-tile mt-4"><small>Latest measurement</small><strong>{oneDecimal.format(measurement.bodyMassKg)} kg</strong><span>{formatDay(measurement.measuredOn)}</span></div>
          : <p className="mt-3 text-sm leading-6 text-[var(--ink-soft)]">No measurement. Body mass is needed to correct jump power from OVR.</p>}
      </section>}
    </div>

    <div className="mt-5"><AthleteOvrData athlete={athlete} /></div>
  </div></AppShell>;
}
