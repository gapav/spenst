"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useThemeAttribute, useThemePreference } from "@/hooks/use-theme-preference";
import type { ThemePreference } from "@/lib/theme";
import { cn } from "@/lib/utils";

const options: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
  { value: "system", label: "System", icon: Monitor },
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
];

/**
 * Light, dark, or whatever the device is set to. `compact` is the icon-only strip
 * at the foot of the sidebar, one click from every page; the labelled version
 * sits with the other personal settings on the team page.
 */
export function ThemeSwitch({ compact = false, className }: { compact?: boolean; className?: string }) {
  const [preference, setPreference] = useThemePreference();
  return <div role="group" aria-label="Appearance" className={cn("spenst-theme-switch", compact && "is-compact", className)}>
    {options.map(({ value, label, icon: Icon }) => <button
      key={value}
      type="button"
      aria-pressed={preference === value}
      aria-label={compact ? label : undefined}
      title={compact ? label : undefined}
      onClick={() => setPreference(value)}
    ><Icon size={compact ? 15 : 16} aria-hidden="true" />{!compact && <span>{label}</span>}</button>)}
  </div>;
}

export function ThemeCard() {
  return <section className="rounded-[24px] border border-[var(--line)] bg-[var(--surface)] p-5">
    <div className="flex items-start gap-3">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--paper)] text-[var(--ink-soft)]"><Moon size={20} /></span>
      <div className="min-w-0 flex-1">
        <h3 className="font-black">Appearance</h3>
        <p className="mt-1 text-sm leading-6 text-[var(--ink-soft)]">Dark is easier on the eyes in the evening. “System” switches when your phone or computer does.</p>
      </div>
    </div>
    <ThemeSwitch className="mt-4" />
  </section>;
}

/** Rendered once in the root layout; see `useThemeAttribute`. */
export function ThemeAttribute() {
  useThemeAttribute();
  return null;
}
