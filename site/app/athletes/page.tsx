"use client";

import { UserRound } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSpenst } from "@/components/app-provider";
import { AddAthleteButton } from "@/components/add-athlete";
import { AppShell } from "@/components/app-shell";
import { PageHeading } from "@/components/page-heading";
import { AsymmetryStatus } from "@/components/profile-parts";
import { EmptyState } from "@/components/ui";
import { positionLabels } from "@/lib/labels";
import { ageInYears } from "@/lib/maturity";
import { batteryFor } from "@/lib/power-profile";
import { summarizeSquad, teamAthletes } from "@/lib/squad";
import { formatDay } from "@/lib/utils";

export default function AthletesPage() {
  const { currentTeam, athletes, results, testDays, measurements, workspaceLoaded, customBatteries } = useSpenst();
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => { const tick = () => setNow(new Date()); tick(); }, []);

  const summaries = useMemo(() => {
    if (!now) return [];
    // Alphabetical: there is no score to sort by, by design.
    return summarizeSquad({ athletes: teamAthletes(athletes, currentTeam?.id), results, testDays, measurements, asOf: now, battery: batteryFor(currentTeam, customBatteries).tests });
  }, [athletes, currentTeam, results, testDays, measurements, now, customBatteries]);

  return <AppShell><div className="spenst-page">
    <PageHeading eyebrow={currentTeam?.name ?? "Röskr"} title="Athletes" description="Every athlete’s latest results and asymmetry. Open one for their profile against the squad." actions={currentTeam && <AddAthleteButton />} />
    {!workspaceLoaded || !now ? <p role="status" className="spenst-loading">Loading athletes …</p> : !summaries.length
      ? <EmptyState icon={<UserRound size={24} />} title="No athletes on the team yet" body={currentTeam?.role === "admin" ? "Add the squad one athlete at a time." : "Athletes are added to the team by a team admin."} action={<AddAthleteButton variant="primary" />} />
      : <>
        <section className="spenst-card spenst-rows overflow-hidden">
          {summaries.map(({ athlete, profile, asymmetry }) => <Link key={athlete.id} href={`/athletes/${athlete.id}`} className="athlete-row">
            <div className="athlete-row-copy">
              <strong>{athlete.displayName}</strong>
              <small>{[`${ageInYears(athlete.birthMonth, now)} years`, athlete.position && positionLabels[athlete.position]].filter(Boolean).join(" · ")}</small>
            </div>
            <div className="athlete-row-score">
              {asymmetry && asymmetry.level !== "ok" && <AsymmetryStatus value={asymmetry} />}
              <span className="athlete-row-tests">{profile.tests.filter((test) => test.latest).length} of {profile.tests.length} tests{(() => { const last = profile.tests.map((test) => test.latest?.heldOn).filter(Boolean).sort().at(-1); return last ? ` · ${formatDay(last as string, { day: "numeric", month: "short" })}` : ""; })()}</span>
            </div>
          </Link>)}
        </section>
      </>}
  </div></AppShell>;
}
