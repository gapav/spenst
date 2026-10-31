/**
 * Velocity-based training: the zones a set is programmed in, the green/red
 * call on each rep, and the set-to-set adjustment Ballou's staff make live.
 *
 * The zone edges are Ballou's, measured on Elite Form; they are a conceptual
 * frame — which quality a block is after — not numbers to apply to every lift,
 * because velocity is exercise- and device-specific.
 */

export type ZoneId = "absolute-strength" | "accelerative-strength" | "strength-speed" | "speed-strength";
export type VelocityMetric = "mean" | "peak";

export interface VelocityZone {
  id: ZoneId;
  label: string;
  /** m/s, inclusive. */
  min: number;
  /** m/s, exclusive. */
  max: number;
}

export const VELOCITY_ZONES: readonly VelocityZone[] = [
  { id: "absolute-strength", label: "Absolute strength", min: 0.2, max: 0.5 },
  { id: "accelerative-strength", label: "Accelerative strength", min: 0.5, max: 0.75 },
  { id: "strength-speed", label: "Strength-speed", min: 0.75, max: 0.9 },
  { id: "speed-strength", label: "Speed-strength", min: 0.9, max: 1.3 },
];

/**
 * Below this, "bad things are coming" with inefficient lifters, so the app
 * warns rather than programs. Ballou rides 0.3 but does not go under it.
 */
export const VELOCITY_FLOOR = 0.3;

/** Strength lifts are read on mean velocity; Olympic lifts and jumps on peak. */
export function metricFor(kind: "strength" | "olympic" | "jump"): VelocityMetric {
  return kind === "strength" ? "mean" : "peak";
}

export function zoneFor(velocity: number): VelocityZone | null {
  return VELOCITY_ZONES.find((zone) => velocity >= zone.min && velocity < zone.max) ?? null;
}

/** Green if the rep met the target velocity, red if not — what the athlete sees on the screen. */
export function repLight(velocity: number, target: number): "green" | "red" {
  return velocity >= target ? "green" : "red";
}

export interface AutoregulationRule {
  /** Minimum velocity for a green rep, m/s. */
  target: number;
  /** Any rep this fast means the load is too light: bump it. Ballou: 1.05 on a 0.90 speed-squat day. */
  bumpAbove: number;
  bumpKg: number;
  /** How many reps of the set must be green to move up. Ballou's default is all of them. */
  greensToAdvance?: number;
}

export type SetVerdict = { action: "bump"; addKg: number } | { action: "advance" } | { action: "hold" };

/**
 * The call after a set. "Hold" is Ballou's "he does not move up to the next
 * weight" — the athlete repeats the load until the bar moves fast enough.
 */
export function setVerdict(reps: readonly number[], rule: AutoregulationRule): SetVerdict {
  if (!reps.length) return { action: "hold" };
  if (reps.some((velocity) => velocity >= rule.bumpAbove)) return { action: "bump", addKg: rule.bumpKg };
  const greens = reps.filter((velocity) => repLight(velocity, rule.target) === "green").length;
  return greens >= (rule.greensToAdvance ?? reps.length) ? { action: "advance" } : { action: "hold" };
}

/**
 * Estimated 1RM from a load–velocity line, read off at the minimum velocity
 * threshold. Not used for prescription: velocity-derived maxes vary a lot
 * between days and lifts.
 */
export function estimateOneRepMax(points: readonly { loadKg: number; velocity: number }[], minimumVelocity: number): number | null {
  if (points.length < 2 || new Set(points.map((point) => point.loadKg)).size < 2) return null;
  const n = points.length;
  const meanLoad = points.reduce((sum, point) => sum + point.loadKg, 0) / n;
  const meanVelocity = points.reduce((sum, point) => sum + point.velocity, 0) / n;
  const covariance = points.reduce((sum, point) => sum + (point.loadKg - meanLoad) * (point.velocity - meanVelocity), 0);
  const variance = points.reduce((sum, point) => sum + (point.loadKg - meanLoad) ** 2, 0);
  const slope = covariance / variance;
  if (!(slope < 0)) return null;
  const intercept = meanVelocity - slope * meanLoad;
  return Math.round(((minimumVelocity - intercept) / slope) * 10) / 10;
}
