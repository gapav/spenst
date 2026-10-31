"use client";

import { useState } from "react";
import { durationText, formatTarget, parseDurationText, parseTargetText, type Target } from "@/lib/training";
import { cn } from "@/lib/utils";

const fieldText = (target: Target | undefined) => target ? formatTarget(target, (value) => String(value)) : "";

/**
 * One prescription field, typed the way a coach writes it — "5", "6–8",
 * "0.75–0.90" (a comma decimal works too). Commits on blur or Enter; an empty field removes the target.
 * Something it cannot read stays on screen, marked, until it is fixed.
 *
 * Every field commits what is in the input at blur, not the draft in state:
 * a blur can arrive in the same tick as the last keystroke (a quick tap away
 * on a phone), before React has rendered the draft into this closure.
 */
export function TargetField({ label, unit, value, onCommit, wide = false }: { label: string; unit?: string; value: Target | undefined; onCommit(next: Target | undefined): void; wide?: boolean }) {
  const [draft, setDraft] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  const text = draft ?? fieldText(value);

  function commit(typed: string) {
    if (typed === fieldText(value)) { setDraft(null); setInvalid(false); return; }
    if (!typed.trim()) { setDraft(null); setInvalid(false); if (value) onCommit(undefined); return; }
    const parsed = parseTargetText(typed);
    if (!parsed) { setDraft(typed); setInvalid(true); return; }
    setDraft(null); setInvalid(false);
    if (!value || parsed.min !== value.min || parsed.max !== value.max) onCommit(parsed);
  }

  return <label className={cn("metric-field", wide && "is-wide")}>
    <span>{label}{unit && <small> {unit}</small>}</span>
    <input
      className={cn("metric-input", invalid && "is-invalid")}
      inputMode="decimal"
      value={text}
      placeholder="–"
      aria-invalid={invalid || undefined}
      onChange={(event) => { setDraft(event.target.value); setInvalid(false); }}
      onBlur={(event) => commit(event.currentTarget.value)}
      onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}
    />
  </label>;
}

/** A whole number — sets — that must stay at least `min`. */
export function CountField({ label, value, min = 1, max = 99, onCommit }: { label: string; value: number; min?: number; max?: number; onCommit(next: number): void }) {
  const [draft, setDraft] = useState<string | null>(null);
  function commit(typed: string) {
    const parsed = Number(typed.trim());
    setDraft(null);
    if (Number.isInteger(parsed) && parsed >= min && parsed <= max && parsed !== value) onCommit(parsed);
  }
  return <label className="metric-field">
    <span>{label}</span>
    <input className="metric-input" inputMode="numeric" value={draft ?? String(value)} onChange={(event) => setDraft(event.target.value)} onBlur={(event) => commit(event.currentTarget.value)} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} />
  </label>;
}

/** Rest between sets: "90" or "2:30". Empty removes it. */
export function RestField({ value, onCommit }: { value: number | undefined; onCommit(next: number | undefined): void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  function commit(typed: string) {
    if (!typed.trim()) { setDraft(null); setInvalid(false); if (value !== undefined) onCommit(undefined); return; }
    const parsed = parseDurationText(typed);
    if (parsed === null) { setDraft(typed); setInvalid(true); return; }
    setDraft(null); setInvalid(false);
    if (parsed !== value) onCommit(parsed || undefined);
  }
  return <label className="metric-field">
    <span>Rest <small>m:ss</small></span>
    <input className={cn("metric-input", invalid && "is-invalid")} inputMode="numeric" value={draft ?? (value ? durationText(value) : "")} placeholder="–" aria-invalid={invalid || undefined} onChange={(event) => { setDraft(event.target.value); setInvalid(false); }} onBlur={(event) => commit(event.currentTarget.value)} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} />
  </label>;
}

/** Free text that saves on blur — titles and notes. */
export function TextCommitField({ value, onCommit, className, placeholder, multiline = false, label }: { value: string; onCommit(next: string): void; className?: string; placeholder?: string; multiline?: boolean; label: string }) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = (typed: string) => { if (typed !== value) onCommit(typed); setDraft(null); };
  const props = { className, value: draft ?? value, placeholder, "aria-label": label, onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft(event.target.value), onBlur: (event: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => commit(event.currentTarget.value) };
  return multiline ? <textarea {...props} rows={2} /> : <input {...props} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} />;
}
