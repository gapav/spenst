"use client";

import { Users } from "lucide-react";
import { useEffect, useState } from "react";
import { useSpenst } from "@/components/app-provider";
import { AppShell } from "@/components/app-shell";
import Link from "next/link";
import { AddAthleteButton, EditAthleteButton } from "@/components/add-athlete";
import { BatterySettings } from "@/components/battery-settings";
import { CreateTeamButton } from "@/components/create-team";
import { LogoMark } from "@/components/logo";
import { PageHeading } from "@/components/page-heading";
import { TeamCrest } from "@/components/team-crest";
import { ThemeCard } from "@/components/theme-switch";
import { Avatar, EmptyState, Tag } from "@/components/ui";
import { populationLabels, positionLabels } from "@/lib/labels";
import { ageInYears } from "@/lib/maturity";
import { teamAthletes } from "@/lib/squad";
import { HelpTip } from "@/components/help-tip";

export default function TeamPage() {
  const { currentTeam, user, athletes, workspaceLoaded } = useSpenst();
  const [view, setView] = useState<"athletes" | "coaches" | "battery" | "settings">("athletes");
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => { const tick = () => setNow(new Date()); tick(); }, []);
  const squad = teamAthletes(athletes, currentTeam?.id);
  const tabs = [
    { id: "athletes" as const, label: "Athletes", count: squad.length },
    { id: "coaches" as const, label: "Coaches", count: currentTeam?.members.length ?? 0 },
    { id: "battery" as const, label: "Test battery", count: null },
    { id: "settings" as const, label: "Settings", count: null },
  ];

  return <AppShell><div className="spenst-page">
    <PageHeading eyebrow={currentTeam ? populationLabels[currentTeam.population] : "Röskr"} title={currentTeam?.name ?? "Team"} description="The squad, the coaching staff and your settings." actions={currentTeam && <div className="flex items-center gap-3"><CreateTeamButton /><TeamCrest team={currentTeam} size="lg" /></div>} />
    {!workspaceLoaded ? <p role="status" className="spenst-loading">Loading the team …</p> : !currentTeam
      ? <EmptyState icon={<Users size={24} />} title="You are not on a team yet" body={user?.isGlobalAdmin ? "Create the first team, and you’ll find the squad and the coaching staff here." : "When you are added to a team, you’ll find the squad and the coaching staff here."} action={<CreateTeamButton variant="primary" />} />
      : <>
        <div className="spenst-segments" role="group" aria-label="Show team information">{tabs.map((tab) => <button key={tab.id} aria-pressed={view === tab.id} onClick={() => setView(tab.id)}>{tab.label}{tab.count !== null && <span>{tab.count}</span>}</button>)}</div>
        <div className="mt-6">
          {view === "athletes" && <>
            <div className="mb-5 flex items-center gap-2">{currentTeam.role === "admin" && <AddAthleteButton />}<HelpTip label="Who sees the squad">Only the coaching staff can see the squad. We store names as “Firstname L.”, the birth month and — only with consent — height and weight.</HelpTip></div>
            <section className="spenst-card spenst-rows overflow-hidden">
              {squad.map((athlete) => <div key={athlete.id} className="athlete-row">
                <div className="athlete-row-copy"><strong><Link href={`/athletes/${athlete.id}`} className="hover:underline">{athlete.displayName}</Link></strong><small>{[now && `${ageInYears(athlete.birthMonth, now)} years`, athlete.position && positionLabels[athlete.position]].filter(Boolean).join(" · ")}</small></div>
                <Tag tone={athlete.measurementConsent ? "sage" : "neutral"}>{athlete.measurementConsent ? "Consent to measure" : "No measurements"}</Tag>
                <EditAthleteButton athlete={athlete} compact />
              </div>)}
            </section>
          </>}
          {view === "coaches" && <section className="spenst-card spenst-rows overflow-hidden">
            {currentTeam.members.map((member) => <div key={member.id} className="athlete-row">
              <Avatar name={member.fullName} initials={member.initials} color={member.color} />
              <div className="athlete-row-copy"><strong>{member.fullName} {member.id === user?.id && <Tag>You</Tag>}</strong><small>{member.email}</small></div>
              <Tag tone={member.teamRole === "admin" ? "orange" : "green"}>{member.teamRole === "admin" ? "Admin" : "Coach"}</Tag>
            </div>)}
          </section>}
          {view === "battery" && <BatterySettings />}
          {view === "settings" && <div className="grid gap-6 md:grid-cols-2">
            <ThemeCard />
            <section className="spenst-privacy-note"><LogoMark className="h-9 w-9" /><h3>Data about young athletes is borrowed, not owned.</h3><p>Test results and measurements are only visible to the coaches of the athlete’s teams. Growth and weight are stored only with consent, and can be deleted at any time.</p></section>
          </div>}
        </div>
      </>}
  </div></AppShell>;
}
