import type { HandballPosition, Population, Sex } from "./types";

export const positionLabels: Record<HandballPosition, string> = {
  keeper: "Goalkeeper",
  wing: "Wing",
  back: "Back",
  centre: "Centre back",
  pivot: "Pivot",
};

export const sexLabels: Record<Sex, string> = { F: "Female", M: "Male" };

export const populationLabels: Record<Population, string> = { youth: "Youth", adult: "Senior" };
