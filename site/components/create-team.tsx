"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { useSpenst } from "./app-provider";
import { Button, Field, inputClass, Modal } from "./ui";
import { populationLabels } from "@/lib/labels";
import type { Population } from "@/lib/types";

/**
 * “New team” for global admins: the team is created with them as its admin
 * and becomes the current team. Renders nothing for anyone else, since
 * `create_team` would refuse them.
 */
export function CreateTeamButton({ variant = "secondary" }: { variant?: "primary" | "secondary" }) {
  const { user, createTeam } = useSpenst();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [population, setPopulation] = useState<Population>("adult");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  if (!user?.isGlobalAdmin) return null;

  const close = () => { setOpen(false); setName(""); setPopulation("adult"); setProblem(null); };

  return <>
    <Button variant={variant} onClick={() => setOpen(true)}><Plus size={16} />New team</Button>
    <Modal open={open} title="New team" description="You become the team’s admin, and can add athletes and coaches to it." size="sm" onClose={close}>
      <form className="grid gap-4" onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true); setProblem(null);
        try { await createTeam({ name, population }); close(); }
        catch (caught) { setProblem(caught instanceof Error ? caught.message : "The team wasn’t created. Try again."); }
        finally { setBusy(false); }
      }}>
        <Field label="Name"><input className={inputClass} value={name} onChange={(event) => setName(event.target.value)} maxLength={120} autoFocus required placeholder="Senior men" /></Field>
        <Field label="Squad" hint="Youth squads get maturity estimates from birth month and growth.">
          <select className={inputClass} value={population} onChange={(event) => setPopulation(event.target.value as Population)}>
            {(["adult", "youth"] as const).map((option) => <option key={option} value={option}>{populationLabels[option]}</option>)}
          </select>
        </Field>
        {problem && <p role="alert" className="text-sm text-[var(--danger)]">{problem}</p>}
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={close}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? "Creating …" : "Create team"}</Button></div>
      </form>
    </Modal>
  </>;
}
