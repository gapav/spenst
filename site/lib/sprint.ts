/**
 * Change-of-direction deficit: the 505 time minus the 10 m sprint time. It
 * separates an athlete who is slow from one who is poor at turning — two
 * athletes with the same 505 can need opposite work.
 */
export function codDeficit(cod505Seconds: number, sprint10mSeconds: number): number | null {
  if (!(cod505Seconds > 0) || !(sprint10mSeconds > 0)) return null;
  return Math.round((cod505Seconds - sprint10mSeconds) * 100) / 100;
}
