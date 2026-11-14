"use client";

import { ArrowDown, ArrowUp, Copy, Pencil, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import { useSpenst } from "./app-provider";
import { Button, inputClass, Tag } from "./ui";
import { batteryFor, BUILTIN_BATTERIES, deviceLabels, familyOf, TESTS, type Device, type Quality, type TestBattery, type TestKey } from "@/lib/power-profile";
import { cn, countLabel } from "@/lib/utils";
import { HelpTip } from "./help-tip";
import { WinButton } from "./win";

const qualityLabels: Record<Quality, string> = {
  acceleration: "Acceleration",
  cod: "Change of direction",
  vertical: "Vertical",
  "single-leg": "Single leg",
  horizontal: "Horizontal",
  upper: "Upper body",
  "triple-extension": "Triple extension",
};
const DEVICE_ORDER: Device[] = ["ovr-sprint", "ovr-jump", "ovr-velocity", "myjump", "tape"];

interface Draft { id?: string; name: string; description: string; tests: TestKey[] }

/**
 * Which tests make up the team's profile: a team setting. Built-ins can be
 * used as they are or copied; the team's own can be edited and deleted.
 */
export function BatterySettings() {
  const { currentTeam, customBatteries, setTeamBattery, saveBattery, deleteBattery } = useSpenst();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  if (!currentTeam) return null;
  const isAdmin = currentTeam.role === "admin";
  const current = batteryFor(currentTeam, customBatteries);
  const own = customBatteries.filter((battery) => battery.teamId === currentTeam.id);
  const all: TestBattery[] = [...BUILTIN_BATTERIES, ...own];

  async function attempt(action: () => Promise<unknown>) {
    setProblem(null);
    try { await action(); } catch (caught) { setProblem(caught instanceof Error ? caught.message : "That didn’t work. Try again."); }
  }

  return <div className="grid gap-5">
    {problem && <p role="alert" className="text-sm text-[var(--danger)]">{problem}</p>}

    {draft
      ? <BatteryEditor draft={draft} onCancel={() => setDraft(null)} onSave={(saved) => attempt(async () => {
        const id = await saveBattery({ ...saved, teamId: currentTeam.id });
        setDraft(null);
        // A new battery the admin made is most likely the one they want.
        if (!saved.id && isAdmin) await setTeamBattery(currentTeam.id, id);
      })} />
      : <div className="flex items-center gap-2"><Button onClick={() => setDraft({ name: "", description: "", tests: [] })}><Plus size={16} />New battery</Button><HelpTip label="What a battery does">The battery decides which tests a test day has, the order of the radar, the leaderboard lists and the squad bests. {isAdmin ? "Results are kept whichever battery is in use — switching only changes what is shown." : "Only a team admin can change which battery the team uses; any coach can make new ones."}</HelpTip></div>}

    <div className="battery-list">
      {all.map((battery) => <article key={battery.id} className={cn("battery-card", battery.id === current.id && "is-current")} aria-label={battery.name}>
        <header>
          <div className="min-w-0">
            <h3>{battery.name}</h3>
            <small>{battery.teamId ? `${currentTeam.shortName}’s own` : "Built in"} · {battery.tests.length} tests</small>
          </div>
          {battery.id === current.id
            ? <Tag tone="sage">In use</Tag>
            : isAdmin && <Button variant="secondary" size="sm" onClick={() => void attempt(() => setTeamBattery(currentTeam.id, battery.id))}>Use this</Button>}
        </header>
        {battery.description && <p>{battery.description}</p>}
        <ol className="battery-tests">
          {battery.tests.map((key) => <li key={key} data-family={familyOf(TESTS[key])}>
            <i className="family-dot" />
            <span className="battery-test-name">{TESTS[key].name}{TESTS[key].protocol && <small> · {TESTS[key].protocol}</small>}</span>
            <span className="battery-test-device">{deviceLabels[TESTS[key].device]}</span>
          </li>)}
        </ol>
        <footer>
          {battery.teamId
            ? <>
              <Button variant="ghost" size="sm" onClick={() => setDraft({ id: battery.id, name: battery.name, description: battery.description, tests: [...battery.tests] })}><Pencil size={15} />Edit</Button>
              {confirming === battery.id
                ? <Button variant="danger" size="sm" onClick={() => { setConfirming(null); void attempt(() => deleteBattery(battery.id)); }}>Delete {battery.name}{battery.id === current.id ? " — the team goes back to Spenst 7" : ""}</Button>
                : <Button variant="ghost" size="sm" onClick={() => setConfirming(battery.id)}><Trash2 size={15} />Delete</Button>}
            </>
            : <Button variant="ghost" size="sm" onClick={() => setDraft({ name: `${battery.name}, our version`, description: battery.description, tests: [...battery.tests] })}><Copy size={15} />Copy to change it</Button>}
        </footer>
      </article>)}
    </div>
  </div>;
}

function BatteryEditor({ draft, onCancel, onSave }: { draft: Draft; onCancel(): void; onSave(draft: Draft): void }) {
  const [name, setName] = useState(draft.name);
  const [description, setDescription] = useState(draft.description);
  const [tests, setTests] = useState<TestKey[]>(draft.tests);
  const toggle = (key: TestKey) => setTests((current) => current.includes(key) ? current.filter((entry) => entry !== key) : [...current, key]);
  const move = (index: number, by: number) => setTests((current) => {
    const next = [...current];
    const [moved] = next.splice(index, 1);
    next.splice(index + by, 0, moved);
    return next;
  });
  const valid = name.trim().length > 0 && tests.length > 0;

  return <section className="spenst-card battery-editor" aria-labelledby="battery-editor-heading">
    <header>
      <h3 id="battery-editor-heading">{draft.id ? `Edit ${draft.name}` : "New battery"}</h3>
      <button type="button" className="spenst-icon-button" aria-label="Close" onClick={onCancel}><X size={16} /></button>
    </header>
    <div className="battery-editor-fields">
      <label className="grid gap-1.5"><span className="text-sm font-semibold">Name</span><input className={inputClass} value={name} maxLength={60} placeholder="E.g. Pre-season" onChange={(event) => setName(event.target.value)} /></label>
      <label className="grid gap-1.5"><span className="text-sm font-semibold">What it is for <small className="font-normal text-[var(--ink-soft)]">(optional)</small></span><input className={inputClass} value={description} maxLength={300} placeholder="E.g. The short version for match weeks" onChange={(event) => setDescription(event.target.value)} /></label>
    </div>

    <div className="battery-editor-columns">
      <div>
        <h4>Tests, in order <small>{tests.length} chosen{tests.length > 0 && tests.length < 3 ? " · the radar needs three" : ""}</small></h4>
        {!tests.length ? <p className="battery-empty">Pick tests from the catalogue.</p> : <ol className="battery-order">
          {tests.map((key, index) => <li key={key}>
            <span className="battery-order-number">{index + 1}</span>
            <span className="min-w-0 flex-1"><strong>{TESTS[key].name}</strong><small>{deviceLabels[TESTS[key].device]} · {qualityLabels[TESTS[key].quality]}</small></span>
            <button type="button" className="spenst-icon-button" aria-label={`Move ${TESTS[key].name} up`} disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp size={15} /></button>
            <button type="button" className="spenst-icon-button" aria-label={`Move ${TESTS[key].name} down`} disabled={index === tests.length - 1} onClick={() => move(index, 1)}><ArrowDown size={15} /></button>
            <button type="button" className="spenst-icon-button" aria-label={`Remove ${TESTS[key].name}`} onClick={() => toggle(key)}><X size={15} /></button>
          </li>)}
        </ol>}
      </div>
      <div>
        <h4>Catalogue</h4>
        {DEVICE_ORDER.map((device) => {
          const keys = (Object.keys(TESTS) as TestKey[]).filter((key) => TESTS[key].device === device);
          if (!keys.length) return null;
          return <div key={device} className="battery-catalogue-group">
            <h5>{deviceLabels[device]}</h5>
            <div className="battery-catalogue">
              {keys.map((key) => <button key={key} type="button" aria-pressed={tests.includes(key)} onClick={() => toggle(key)}>
                <strong>{TESTS[key].name}</strong>
                <small>{qualityLabels[TESTS[key].quality]} · {TESTS[key].unit}{TESTS[key].sided ? " · left and right" : ""}</small>
              </button>)}
            </div>
          </div>;
        })}
      </div>
    </div>

    <footer>
      <Button variant="ghost" onClick={onCancel}>Cancel</Button>
      {draft.id
        ? <Button disabled={!valid} onClick={() => onSave({ id: draft.id, name, description, tests })}>Save</Button>
        : <WinButton kind="charge" disabled={!valid} text={countLabel(tests.length, "test", "tests")} onClick={() => onSave({ id: draft.id, name, description, tests })}>Create battery</WinButton>}
    </footer>
  </section>;
}
