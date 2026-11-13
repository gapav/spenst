"use client";

import { Pencil, Trash2, UserMinus, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { useSpenst } from "./app-provider";
import { Button, Field, inputClass, Modal } from "./ui";
import { positionLabels, sexLabels } from "@/lib/labels";
import { latestBirthMonth, minimizeAthleteName, MIN_AGE_CLASS, type NewAthleteInput } from "@/lib/roster";
import type { Athlete, HandballPosition, Sex } from "@/lib/types";

const POSITIONS = Object.keys(positionLabels) as HandballPosition[];
const EMPTY: NewAthleteInput = { name: "", birthMonth: "", sex: null, position: null, measurementConsent: false };

const messageOf = (caught: unknown, fallback: string) => caught instanceof Error ? caught.message : fallback;

/** The fields shared by adding and editing an athlete. */
function AthleteFields({ draft, onChange, consentWarning }: { draft: NewAthleteInput; onChange(patch: Partial<NewAthleteInput>): void; consentWarning?: boolean }) {
  const stored = minimizeAthleteName(draft.name);
  return <>
    <Field label="Name" hint={stored && stored !== draft.name.trim() ? `Stored as “${stored}”` : "Stored as first name and the last name’s initial."}>
      <input className={inputClass} value={draft.name} onChange={(event) => onChange({ name: event.target.value })} autoFocus required autoComplete="off" placeholder="Ida Kristiansen" />
    </Field>
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Birth month" hint="The day is not stored.">
        <input type="month" className={inputClass} value={draft.birthMonth} max={latestBirthMonth(new Date())} onChange={(event) => onChange({ birthMonth: event.target.value })} required />
      </Field>
      <Field label="Sex">
        <select className={inputClass} value={draft.sex ?? ""} onChange={(event) => onChange({ sex: (event.target.value || null) as Sex | null })} required>
          <option value="" disabled>Choose</option>
          {(["F", "M"] as const).map((option) => <option key={option} value={option}>{sexLabels[option]}</option>)}
        </select>
      </Field>
    </div>
    <Field label="Position" hint="Optional.">
      <select className={inputClass} value={draft.position ?? ""} onChange={(event) => onChange({ position: (event.target.value || null) as HandballPosition | null })}>
        <option value="">None</option>
        {POSITIONS.map((option) => <option key={option} value={option}>{positionLabels[option]}</option>)}
      </select>
    </Field>
    <label className="metric-check"><input type="checkbox" checked={draft.measurementConsent} onChange={(event) => onChange({ measurementConsent: event.target.checked })} />Consent to store height, sitting height and body mass (from a guardian, for a minor)</label>
    {consentWarning && <p className="text-sm text-[var(--danger)]">Saving without consent deletes this athlete’s stored measurements.</p>}
  </>;
}

function Actions({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap justify-end gap-2">{children}</div>;
}

/**
 * “Add athlete” for the current team’s admins. Renders nothing for anyone
 * else, since `add_athlete` would refuse them.
 */
export function AddAthleteButton({ variant = "secondary" }: { variant?: "primary" | "secondary" }) {
  const { currentTeam, addAthlete } = useSpenst();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<NewAthleteInput>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [added, setAdded] = useState<string | null>(null);
  if (currentTeam?.role !== "admin") return null;

  const close = () => { setOpen(false); setAdded(null); setDraft(EMPTY); setProblem(null); };

  return <>
    <Button variant={variant} onClick={() => setOpen(true)}><UserPlus size={16} />Add athlete</Button>
    <Modal open={open} title="Add athlete" description={`To ${currentTeam.name}. Athletes are ${MIN_AGE_CLASS} and up, from the year they turn ${MIN_AGE_CLASS}.`} onClose={close}>
      <form className="grid gap-4" onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true); setProblem(null);
        try {
          await addAthlete(draft);
          // Stay open: a squad is usually added one athlete after another.
          setAdded(minimizeAthleteName(draft.name)); setDraft(EMPTY);
        } catch (caught) { setAdded(null); setProblem(messageOf(caught, "The athlete wasn’t added. Try again.")); }
        finally { setBusy(false); }
      }}>
        {added && <p role="status" className="text-sm text-[var(--ink-soft)]">Added {added}. Add another, or close.</p>}
        <AthleteFields draft={draft} onChange={(patch) => { setDraft((current) => ({ ...current, ...patch })); setAdded(null); }} />
        {problem && <p role="alert" className="text-sm text-[var(--danger)]">{problem}</p>}
        <Actions><Button type="button" variant="ghost" onClick={close}>{added ? "Done" : "Cancel"}</Button><Button type="submit" disabled={busy}>{busy ? "Adding …" : "Add athlete"}</Button></Actions>
      </form>
    </Modal>
  </>;
}

/**
 * “Edit” on an athlete’s profile, for an admin of one of their teams: change
 * the details, take them off the current team, or delete them for good.
 */
export function EditAthleteButton({ athlete }: { athlete: Athlete }) {
  const { teams, currentTeam, updateAthlete, removeAthleteFromTeam, deleteAthlete } = useSpenst();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<NewAthleteInput>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<"remove" | "delete" | null>(null);

  const theirTeams = teams.filter((team) => athlete.teamIds.includes(team.id));
  if (!theirTeams.some((team) => team.role === "admin")) return null;
  // The team to take them off: the one being looked at, if it's theirs and ours to manage.
  const removable = theirTeams.find((team) => team.id === currentTeam?.id && team.role === "admin") ?? null;
  // Deleting needs admin on every team they're on. A team the coach isn't on
  // is invisible here; the database refuses in that case.
  const canDelete = theirTeams.every((team) => team.role === "admin");

  const start = () => {
    setDraft({ name: athlete.displayName, birthMonth: athlete.birthMonth, sex: athlete.sex, position: athlete.position, measurementConsent: athlete.measurementConsent });
    setProblem(null); setConfirming(null); setOpen(true);
  };
  const close = () => { setOpen(false); setConfirming(null); setProblem(null); };
  async function attempt(action: () => Promise<void>, fallback: string) {
    setBusy(true); setProblem(null);
    try { await action(); } catch (caught) { setProblem(messageOf(caught, fallback)); } finally { setBusy(false); }
  }

  return <>
    <Button variant="secondary" onClick={start}><Pencil size={16} />Edit</Button>
    <Modal open={open} title={`Edit ${athlete.displayName}`} onClose={close}>
      <form className="grid gap-4" onSubmit={(event) => {
        event.preventDefault();
        void attempt(async () => { await updateAthlete(athlete.id, draft); close(); }, "The changes weren’t saved. Try again.");
      }}>
        <AthleteFields draft={draft} onChange={(patch) => setDraft((current) => ({ ...current, ...patch }))} consentWarning={athlete.measurementConsent && !draft.measurementConsent} />
        {problem && <p role="alert" className="text-sm text-[var(--danger)]">{problem}</p>}
        <Actions><Button type="button" variant="ghost" onClick={close}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? "Saving …" : "Save"}</Button></Actions>
      </form>

      <section className="mt-8 grid gap-3 border-t border-[var(--line)] pt-5" aria-label="Remove the athlete">
        {confirming === null && <Actions>
          {removable && theirTeams.length > 1 && <Button type="button" variant="ghost" onClick={() => setConfirming("remove")}><UserMinus size={16} />Remove from {removable.shortName}</Button>}
          {canDelete && <Button type="button" variant="danger" onClick={() => setConfirming("delete")}><Trash2 size={16} />Delete athlete</Button>}
        </Actions>}
        {confirming === "remove" && removable && <>
          <p className="text-sm">{athlete.displayName} leaves {removable.name}. Their results stay with their other teams.</p>
          <Actions><Button type="button" variant="ghost" onClick={() => setConfirming(null)}>Keep</Button><Button type="button" variant="danger" disabled={busy} onClick={() => void attempt(async () => { await removeAthleteFromTeam(athlete.id, removable.id); close(); router.push("/athletes"); }, "The athlete wasn’t removed. Try again.")}>Remove from team</Button></Actions>
        </>}
        {confirming === "delete" && <>
          <p className="text-sm">This deletes {athlete.displayName} and everything about them — every test result, measurement and OVR row. It can’t be undone.</p>
          <Actions><Button type="button" variant="ghost" onClick={() => setConfirming(null)}>Keep</Button><Button type="button" variant="danger" disabled={busy} onClick={() => void attempt(async () => { await deleteAthlete(athlete.id); close(); router.push("/athletes"); }, "The athlete wasn’t deleted. Try again.")}>Delete for good</Button></Actions>
        </>}
      </section>
    </Modal>
  </>;
}
