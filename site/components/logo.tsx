import Link from "next/link";

/**
 * ᚱ, the rune Raidō — the R of the runic alphabet, “the ride, the journey”:
 * the initial and a season of progress in one sign (decision 26). Straight
 * strokes and firm corners, because runes were cut, not drawn. In
 * `currentColor`; the classes colour it brass (`--mark`).
 *
 * At 32 px and up it sits in a thin ring. Below that the ring disappears, so
 * `plain` drops it and thickens the rune instead.
 */
export function LogoMark({ className = "spenst-logo-mark", plain = false }: { className?: string; plain?: boolean }) {
  if (plain) return <svg aria-hidden="true" viewBox="0 0 48 48" className={className}>
    <path d="M14 6 V42 M14 6 L32 15 L14 24 L34 42" fill="none" stroke="currentColor" strokeWidth="5.5" strokeLinecap="butt" strokeLinejoin="miter" />
  </svg>;
  return <svg aria-hidden="true" viewBox="0 0 48 48" className={className}>
    <circle cx="24" cy="24" r="22.5" fill="none" stroke="currentColor" strokeWidth="2" />
    <path d="M18 11 V37 M18 11 L30 17 L18 23 L31 37" fill="none" stroke="currentColor" strokeWidth="3.75" strokeLinecap="butt" strokeLinejoin="miter" />
  </svg>;
}

/** The lockup: the mark and “röskr” in Inter Tight. The ö stays in the name; `roskr` is for URLs and code. */
export function Logo({ compact = false }: { compact?: boolean }) {
  return <Link href="/" className="spenst-logo" aria-label="Röskr home"><LogoMark />{!compact && <span className="spenst-logo-word" aria-hidden="true">röskr</span>}</Link>;
}
