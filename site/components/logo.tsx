import Link from "next/link";

/**
 * A spring rising to a ball: the jump the profile measures and the ball the
 * athletes play with. Drawn in the same weight as Grep’s folded-page mark, and
 * like it, in `currentColor`, so it takes the ink of whatever it sits on.
 */
export function LogoMark({ className = "spenst-logo-mark" }: { className?: string }) {
  return <svg aria-hidden="true" viewBox="0 0 40 40" className={className}>
    <path d="M5 33 L13 25 L19.5 30 L28 19" fill="none" stroke="currentColor" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="32" cy="8.5" r="5" fill="currentColor" />
  </svg>;
}

export function Logo({ compact = false }: { compact?: boolean }) {
  return <Link href="/" className="spenst-logo" aria-label="Spenst home"><LogoMark />{!compact && <span className="spenst-logo-word" aria-hidden="true">spenst</span>}</Link>;
}
