import type { Side } from "./types";

/**
 * Corrections an OVR Velocity export needs before it goes into a profile.
 *
 * Not yet confirmed against a real export: whether OVR Connect lets you enter
 * body mass per exercise, and what its CSV columns are. Check both before
 * wiring an importer to these.
 */

/**
 * OVR derives power from the load you enter and the bar's movement. In a jump
 * the athlete's body moves with the bar, so bar-only power undercounts it —
 * Ballou enters body weight plus the bar for exactly this reason. Force scales
 * with the moving mass, so scaling by (body + bar) / bar is a sound
 * approximation when the device was given the bar load only.
 */
export function correctJumpPower(input: { power: number; barKg: number; bodyMassKg: number }): number {
  const { power, barKg, bodyMassKg } = input;
  if (!(barKg > 0)) throw new Error("The bar load must be above 0 kg");
  if (!(bodyMassKg > 0)) throw new Error("Body mass must be above 0 kg");
  return power * ((bodyMassKg + barKg) / barKg);
}

/**
 * OVR records every rep on its own, so an alternating split squat jump comes
 * out as one list: reps 1, 3, 5, 7 on the leg the athlete started on, 2, 4, 6, 8
 * on the other. Logging each leg as its own set is safer; this is for exports
 * where that was not done.
 */
export function splitAlternatingReps(reps: readonly number[], firstLeg: Side): Record<Side, number[]> {
  const other: Side = firstLeg === "left" ? "right" : "left";
  const split: Record<Side, number[]> = { left: [], right: [] };
  reps.forEach((rep, index) => split[index % 2 === 0 ? firstLeg : other].push(rep));
  return split;
}

/** Ballou ranks on the best rep, not the average. */
export function bestRep(reps: readonly number[]): number | null {
  return reps.length ? Math.max(...reps) : null;
}
