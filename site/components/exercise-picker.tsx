"use client";

import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Modal, inputClass } from "./ui";
import { MODALITY_ORDER, searchExercises } from "@/lib/exercise-library";
import { metricLabels, modalityLabels, type Exercise, type Modality } from "@/lib/training";

/** The library in a dialog: search, narrow by modality, and one tap adds the exercise. */
export function ExercisePicker({ open, exercises, onPick, onClose, preferred, suggested = [], title = "Add an exercise" }: { open: boolean; exercises: readonly Exercise[]; onPick(exercise: Exercise): void; onClose(): void; preferred?: Modality | null; suggested?: readonly string[]; title?: string }) {
  const [query, setQuery] = useState("");
  const [modality, setModality] = useState<Modality | null>(preferred ?? null);
  const results = useMemo(() => searchExercises(exercises, query, modality), [exercises, query, modality]);
  const available = MODALITY_ORDER.filter((candidate) => exercises.some((exercise) => exercise.modality === candidate));
  const suggestions = suggested.flatMap((id) => exercises.find((exercise) => exercise.id === id) ?? []);

  return <Modal open={open} title={title} description="The exercise comes with suggested sets and reps you can change afterwards." onClose={onClose} size="lg">
    {suggestions.length > 0 && <div className="mb-4 flex flex-wrap items-center gap-2"><span className="text-xs font-semibold text-[var(--ink-soft)]">Suggested</span>{suggestions.map((exercise) => <button key={exercise.id} type="button" className="picker-suggestion" onClick={() => onPick(exercise)}>{exercise.name}</button>)}</div>}
    <div className="relative">
      <Search size={17} className="pointer-events-none absolute left-3.5 top-3.5 text-[var(--ink-soft)]" aria-hidden="true" />
      <input className={`${inputClass} pl-10`} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search exercises" aria-label="Search exercises" autoFocus />
    </div>
    <div className="chip-row mt-3" role="group" aria-label="Exercise type">
      <button type="button" aria-pressed={modality === null} onClick={() => setModality(null)}>All</button>
      {available.map((candidate) => <button key={candidate} type="button" aria-pressed={modality === candidate} onClick={() => setModality(candidate)}>{modalityLabels[candidate]}</button>)}
    </div>
    <ul className="picker-list mt-3">
      {results.map((exercise) => <li key={exercise.id}>
        <button type="button" className="picker-row" onClick={() => onPick(exercise)}>
          <span className="min-w-0 flex-1">
            <strong>{exercise.name}</strong>
            <small>{modalityLabels[exercise.modality]}{exercise.unilateral ? " · one side at a time" : ""} · {exercise.metrics.filter((metric) => metric !== "power").map((metric) => metricLabels[metric].toLocaleLowerCase("en-GB")).join(", ")}</small>
          </span>
        </button>
      </li>)}
      {!results.length && <li className="px-2 py-6 text-center text-sm text-[var(--ink-soft)]">No exercises match the search.</li>}
    </ul>
  </Modal>;
}
