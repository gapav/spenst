import type { Sex } from "./types";

const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;

/**
 * Decimal age on `asOf`. Only the birth month is stored, so the athlete is
 * taken to be born on the 15th — at most half a month off, which is noise next
 * to the ±1 year the maturity equations carry.
 */
export function decimalAge(birthMonth: string, asOf: Date): number {
  const [year, month] = birthMonth.split("-").map(Number);
  const born = Date.UTC(year, month - 1, 15);
  return (asOf.getTime() - born) / YEAR_MS;
}

/**
 * The age class: the age the athlete turns this calendar year. Norwegian
 * sport groups athletes by birth year, so this, not the birthday,
 * decides eligibility, battery and norm group.
 */
export function ageClass(birthMonth: string, asOf: Date): number {
  return asOf.getFullYear() - Number(birthMonth.slice(0, 4));
}

/** Whole years, as a coach would say it. */
export function ageInYears(birthMonth: string, asOf: Date): number {
  return Math.floor(decimalAge(birthMonth, asOf));
}

/**
 * Years from peak height velocity, by Moore et al. (2015), the simplified
 * Mirwald equations: negative before the growth spurt, positive after it.
 * Boys need sitting height, girls only standing height. The error is roughly
 * ±1 year, and it grows the further a child is from PHV, so the result is a
 * band to read, not a number to rank on.
 */
export function maturityOffset(input: { sex: Sex; ageYears: number; heightCm: number; sittingHeightCm: number | null }): number | null {
  const { sex, ageYears, heightCm, sittingHeightCm } = input;
  if (!(ageYears > 0) || !(heightCm > 0)) return null;
  if (sex === "F") return -7.709133 + 0.0042232 * (ageYears * heightCm);
  if (!sittingHeightCm || sittingHeightCm <= 0) return null;
  return -8.128741 + 0.0070346 * (ageYears * sittingHeightCm);
}

export type PhvStatus = "pre" | "circa" | "post";

/** Within a year either side of PHV is "circa" — the window where load needs the most care. */
export function phvStatus(offset: number): PhvStatus {
  if (offset < -1) return "pre";
  if (offset > 1) return "post";
  return "circa";
}

export const phvLabels: Record<PhvStatus, string> = {
  pre: "Pre-PHV",
  circa: "Circa-PHV",
  post: "Post-PHV",
};
