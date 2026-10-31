"use client";

import { CalendarRange, ChevronDown, ClipboardList, Home, Library, LogOut, Medal, Menu, PanelLeftClose, PanelLeftOpen, UserRound, Users, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useSpenst } from "./app-provider";
import { Logo } from "./logo";
import { TeamCrest } from "./team-crest";
import { ThemeSwitch } from "./theme-switch";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/", label: "Overview", icon: Home },
  { href: "/plan", label: "Season plan", icon: CalendarRange },
  { href: "/testing", label: "Testing", icon: ClipboardList },
  { href: "/athletes", label: "Athletes", icon: UserRound },
  { href: "/leaderboard", label: "Leaderboard", icon: Medal },
  { href: "/exercises", label: "Exercises", icon: Library },
  { href: "/team", label: "Team", icon: Users },
];
const activeRoute = (pathname: string, href: string) => href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");

/** Grep’s shell — the same sidebar, drawer, bottom bar and notice — around Spenst’s pages. */
export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, authLoading, isDemoMode, teams, currentTeam, setCurrentTeamId, sidebarCollapsed, setSidebarCollapsed, signOut, notice, clearNotice } = useSpenst();
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const drawer = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!mobileOpen) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusable = () => Array.from(drawer.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), select:not([disabled])') ?? []);
    focusable()[0]?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); setMobileOpen(false); }
      if (event.key !== "Tab") return;
      const elements = focusable(); const first = elements[0]; const last = elements.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    const onResize = () => { if (window.innerWidth >= 1024) setMobileOpen(false); };
    document.addEventListener("keydown", onKeyDown); window.addEventListener("resize", onResize);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener("keydown", onKeyDown); window.removeEventListener("resize", onResize); previousFocus?.focus(); };
  }, [mobileOpen]);

  function switchTeam(id: string) {
    setCurrentTeamId(id); setMobileOpen(false);
    // An athlete or a session belongs to the squad it was opened from.
    if (pathname.startsWith("/athletes/")) router.push("/athletes");
    if (pathname.startsWith("/plan/")) router.push("/plan");
  }

  function navigation(mobile = false) {
    const expanded = !sidebarCollapsed || mobile;
    return <>
      <div className="spenst-sidebar-brand"><Logo compact={!expanded} />{mobile && <button className="spenst-icon-button" onClick={() => setMobileOpen(false)} aria-label="Close the menu"><X size={21} /></button>}</div>
      {expanded ? <div className="spenst-team-switcher">
        <label htmlFor={mobile ? "mobile-team" : "desktop-team"}>Your team</label>
        {teams.length ? <div className="spenst-team-control">{currentTeam && <TeamCrest team={currentTeam} size="sm" />}<select id={mobile ? "mobile-team" : "desktop-team"} value={currentTeam?.id ?? ""} onChange={(event) => switchTeam(event.target.value)}>{teams.map((team) => <option key={team.id} value={team.id}>{team.shortName}</option>)}</select><ChevronDown size={15} aria-hidden="true" /></div> : <p>No teams yet</p>}
      </div> : currentTeam && <Link className="spenst-collapsed-team" href="/team" aria-label={"Team: " + currentTeam.shortName}><TeamCrest team={currentTeam} size="sm" /></Link>}
      <nav className="spenst-nav" aria-label={mobile ? "All pages" : "Main menu"}>{nav.map(({ href, label, icon: Icon }) => <Link key={href} href={href} aria-current={activeRoute(pathname, href) ? "page" : undefined} onClick={() => setMobileOpen(false)} title={!expanded ? label : undefined} aria-label={label}><Icon size={19} strokeWidth={1.8} />{expanded && <span>{label}</span>}</Link>)}</nav>
      <div className="spenst-sidebar-footer">
        {expanded && <>
          {isDemoMode && <p className="spenst-demo-label"><span />Demo mode · nothing is saved</p>}
          <div className="spenst-theme-row"><span>Appearance</span><ThemeSwitch compact /></div>
          <div className="spenst-profile"><span className="spenst-avatar">{user?.initials ?? "T"}</span><div><strong>{user?.fullName}</strong><small>{currentTeam?.role === "admin" ? "Team admin" : "Coach"}</small></div><button className="spenst-icon-button" onClick={() => void signOut()} aria-label="Sign out"><LogOut size={17} /></button></div>
        </>}
      </div>
    </>;
  }

  if (authLoading) return <div className="spenst-auth-gate" role="status">Loading …</div>;
  if (!user) return <div className="spenst-auth-gate"><section className="overview-card"><Logo /><h1>Your team’s tests and profiles live here</h1><p>Sign in to record tests and follow how your athletes develop.</p><Link href={"/sign-in?next=" + encodeURIComponent(pathname)} className="spenst-action">Sign in</Link></section></div>;

  return <div className={cn("spenst-shell", sidebarCollapsed && "spenst-shell-collapsed")}>
    <a href="#main-content" className="spenst-skip-link">Skip to content</a>
    <aside id="app-sidebar" className="spenst-sidebar" inert={mobileOpen || undefined}>{navigation()}<button className="spenst-sidebar-toggle spenst-icon-button" onClick={() => setSidebarCollapsed(!sidebarCollapsed)} aria-controls="app-sidebar" aria-label={sidebarCollapsed ? "Expand the sidebar" : "Collapse the sidebar"} aria-expanded={!sidebarCollapsed}>{sidebarCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}</button></aside>
    <div className="spenst-content" inert={mobileOpen || undefined}>
      <header className="spenst-mobile-header"><Logo /><button className="spenst-icon-button" onClick={() => setMobileOpen(true)} aria-label="Open the menu" aria-expanded={mobileOpen} aria-controls="mobile-navigation"><Menu size={22} /></button></header>
      <main id="main-content" tabIndex={-1} className="spenst-main spenst-main-with-mobile-nav">{children}</main>
      <nav className="spenst-mobile-nav" aria-label="Quick menu">{[nav[0], nav[1], nav[2]].map(({ href, label, icon: Icon }) => <Link key={href} href={href} aria-current={activeRoute(pathname, href) ? "page" : undefined}><Icon size={21} strokeWidth={1.8} /><span>{label}</span></Link>)}<button onClick={() => setMobileOpen(true)} aria-expanded={mobileOpen} aria-controls="mobile-navigation"><Menu size={21} /><span>More</span></button></nav>
    </div>
    {mobileOpen && <div className="spenst-drawer-overlay" onClick={(event) => { if (event.target === event.currentTarget) setMobileOpen(false); }}><div ref={drawer} id="mobile-navigation" className="spenst-drawer" role="dialog" aria-modal="true" aria-label="Navigation">{navigation(true)}</div></div>}
    {notice && <div role="status" className="spenst-notice"><span>{notice}</span><button className="spenst-icon-button" onClick={clearNotice} aria-label="Dismiss"><X size={18} /></button></div>}
  </div>;
}
