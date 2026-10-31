"use client";
/* eslint-disable @next/next/no-img-element -- club logos are served straight from the public storage bucket */

import { useState } from "react";
import type { Team } from "@/lib/types";
import { cn, initials } from "@/lib/utils";

const crestSize = {
  sm: "h-8 w-8 rounded-lg text-[10px]",
  md: "h-10 w-10 rounded-xl text-xs",
  lg: "h-14 w-14 rounded-2xl text-sm",
  xl: "h-20 w-20 rounded-[20px] text-lg",
} as const;

export type CrestSubject = Pick<Team, "shortName" | "logoUrl">;

/**
 * The club logo wherever a team is named. Decorative by default: every place it
 * is used either spells the team out beside it or labels the wrapping control,
 * so the crest itself stays out of the accessibility tree.
 */
export function TeamCrest({ team, size = "md", className }: { team: CrestSubject; size?: keyof typeof crestSize; className?: string }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const shell = cn("grid shrink-0 place-items-center overflow-hidden border border-[var(--line)] bg-[var(--paper-deep)] font-black tracking-[-.02em] text-[var(--ink)]", crestSize[size], className);
  // A logo the browser cannot load would otherwise leave a broken box in the
  // sidebar on every page, so fall back to the initials for good.
  if (!team.logoUrl || team.logoUrl === failedUrl) return <span aria-hidden="true" className={shell}>{initials(team.shortName) || "?"}</span>;
  return <span aria-hidden="true" className={cn(shell, "bg-[var(--logo-plate)]")}><img src={team.logoUrl} alt="" className="h-full w-full object-contain" onError={() => setFailedUrl(team.logoUrl)} /></span>;
}
