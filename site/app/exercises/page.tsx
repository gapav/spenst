"use client";

import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useSpenst } from "@/components/app-provider";
import { AppShell } from "@/components/app-shell";
import { PageHeading } from "@/components/page-heading";
import { Tag, inputClass } from "@/components/ui";
import { MODALITY_ORDER, searchExercises } from "@/lib/exercise-library";
import { metricLabels, modalityLabels, type Modality } from "@/lib/training";

export default function ExercisesPage() {
  const { exercises } = useSpenst();
  const [query, setQuery] = useState("");
  const [modality, setModality] = useState<Modality | null>(null);
  const results = useMemo(() => searchExercises(exercises, query, modality), [exercises, query, modality]);
  const groups = MODALITY_ORDER.map((key) => ({ key, entries: results.filter((exercise) => exercise.modality === key) })).filter((group) => group.entries.length);

  return <AppShell><div className="spenst-page">
    <PageHeading eyebrow="Library" title="Exercises" description="Sessions are built from here. Each exercise knows what it can be measured in, and the builder offers exactly those fields." />
    <div className="relative max-w-xl">
      <Search size={17} className="pointer-events-none absolute left-3.5 top-3.5 text-[var(--ink-soft)]" aria-hidden="true" />
      <input className={`${inputClass} pl-10`} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search exercises" aria-label="Search exercises" />
    </div>
    <div className="chip-row mt-3" role="group" aria-label="Exercise type">
      <button type="button" aria-pressed={modality === null} onClick={() => setModality(null)}>All <small className="tabular">{exercises.length}</small></button>
      {MODALITY_ORDER.map((key) => <button key={key} type="button" aria-pressed={modality === key} onClick={() => setModality(key)}>{modalityLabels[key]} <small className="tabular">{exercises.filter((exercise) => exercise.modality === key).length}</small></button>)}
    </div>
    <div className="mt-5 grid gap-5">
      {groups.map(({ key, entries }) => <section key={key} aria-labelledby={`modality-${key}`}>
        <h2 id={`modality-${key}`} className="group-head">{modalityLabels[key]} <span>{entries.length}</span></h2>
        <div className="spenst-card spenst-rows overflow-hidden">
          {entries.map((exercise) => <div key={exercise.id} className="exercise-row">
            <div className="min-w-0 flex-1">
              <strong>{exercise.name}</strong>
              {exercise.cue && <p>{exercise.cue}</p>}
            </div>
            <div className="flex flex-wrap justify-end gap-1.5">
              {exercise.unilateral && <Tag tone="apricot">One side at a time</Tag>}
              {exercise.metrics.map((metric) => <Tag key={metric} tone={metric === "velocity" ? "sage" : "neutral"}>{metric === "velocity" && exercise.velocityMetric ? `${metricLabels[metric]} (${exercise.velocityMetric === "mean" ? "mean" : "peak"})` : metricLabels[metric]}</Tag>)}
            </div>
          </div>)}
        </div>
      </section>)}
      {!groups.length && <p className="spenst-context-note">No exercises match the search.</p>}
    </div>
  </div></AppShell>;
}
