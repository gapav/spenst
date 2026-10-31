/**
 * Left–right asymmetry in the split squat jump. Ballou's strongest predictor of
 * soft-tissue, non-contact injury: symmetrical is a ratio of 1.0, he tags
 * anything 3% or more off it (he used to use 5%), and past 10% "something is
 * coming". Tagged athletes get extra single-leg volume on the weaker side.
 */

export type AsymmetryLevel = "ok" | "tagged" | "high";

export const ASYMMETRY_TAG_PERCENT = 3;
export const ASYMMETRY_HIGH_PERCENT = 10;

export interface Asymmetry {
  /** Right over left: above 1 is a stronger right leg. */
  ratio: number;
  /** How far the weaker leg trails the stronger one, in percent. */
  deficitPercent: number;
  weaker: "left" | "right" | null;
  level: AsymmetryLevel;
}

export function asymmetry(left: number, right: number, thresholds = { tag: ASYMMETRY_TAG_PERCENT, high: ASYMMETRY_HIGH_PERCENT }): Asymmetry | null {
  if (!(left > 0) || !(right > 0)) return null;
  const ratio = right / left;
  const deficitPercent = Math.round((1 - Math.min(left, right) / Math.max(left, right)) * 1000) / 10;
  const level: AsymmetryLevel = deficitPercent >= thresholds.high ? "high" : deficitPercent >= thresholds.tag ? "tagged" : "ok";
  return { ratio, deficitPercent, weaker: left === right ? null : left < right ? "left" : "right", level };
}

export const asymmetryLabels: Record<AsymmetryLevel, string> = {
  ok: "Symmetrical",
  tagged: "Follow up",
  high: "Large asymmetry",
};

export const sideLabels = { left: "left", right: "right" } as const;
