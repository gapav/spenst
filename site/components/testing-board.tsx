"use client";

import { ArrowRight, CalendarPlus, Check, ChevronDown, ClipboardList, Info, PenLine, Upload } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSpenst } from "./app-provider";
import { AppShell } from "./app-shell";
import { PageHeading } from "./page-heading";
import { Button, EmptyState, inputClass } from "./ui";
import { batteryFor, deviceLabels, familyOf, TESTS, type TestDefinition, type TestKey } from "@/lib/power-profile";
import { teamAthletes, testDayProgress } from "@/lib/squad";
import type { Athlete, Side, TestDay, TestResult } from "@/lib/types";
import { cn, formatDay, localDateKey, parseDecimal } from "@/lib/utils";
import Link from "next/link";
import { TestResults } from "./test-results";
import { testAttempts } from "@/lib/ovr-data";
import { suggestMapping, type OvrRow } from "@/lib/ovr-import";

const numberText = (value: number | undefined) => value === undefined ? "" : String(value);

export function TestingBoard() {
  const { currentTeam, athletes, testDays, results, workspaceLoaded, createTestDay, customBatteries } = useSpenst();
  const router = useRouter();
  const search = useSearchParams();
  const teamDays = useMemo(() => testDays.filter((day) => day.teamId === currentTeam?.id).sort((a, b) => b.heldOn.localeCompare(a.heldOn)), [testDays, currentTeam?.id]);
  const requested = search.get("day");
  const day = teamDays.find((candidate) => candidate.id === requested) ?? teamDays[0] ?? null;
  const battery = currentTeam ? batteryFor(currentTeam, customBatteries).tests : [];
  const [testKey, setTestKey] = useState<TestKey | null>(null);
  const activeKey = testKey && battery.includes(testKey) ? testKey : battery[0] ?? null;
  const squad = useMemo(() => teamAthletes(athletes, currentTeam?.id), [athletes, currentTeam?.id]);

  return <AppShell><div className="spenst-page">
    <PageHeading eyebrow={currentTeam?.name ?? "Spenst"} title="Testing" description="Results come from the OVR export: import it, then pick a test day and a test. Only tape and My Jump tests are typed in here." actions={<Link href="/testing/import" className="spenst-action spenst-action-secondary"><Upload size={17} />Import from OVR</Link>} />
    {!workspaceLoaded ? <p role="status" className="spenst-loading">Loading test days …</p> : !currentTeam
      ? <EmptyState icon={<ClipboardList size={24} />} title="No teams yet" body="When you are added to a team, you can record tests here." />
      : <div className="testing-layout">
        <aside className="grid gap-4">
          <NewTestDay onCreate={async (input) => { const id = await createTestDay(input); router.replace(`/testing?day=${id}`); }} />
          <nav aria-label="Test days" className="test-day-list">
            {teamDays.map((candidate) => {
              const progress = testDayProgress(candidate, athletes, results);
              return <button key={candidate.id} type="button" className="test-day-item" aria-current={candidate.id === day?.id ? "true" : undefined} onClick={() => router.replace(`/testing?day=${candidate.id}`)}>
                <span className="test-day-date"><span>{formatDay(candidate.heldOn, { month: "short" })}</span><strong>{formatDay(candidate.heldOn, { day: "numeric" })}</strong></span>
                <span className="min-w-0 flex-1"><strong className="block truncate text-sm font-semibold">{candidate.title}</strong><small className="block text-xs text-[var(--ink-soft)]">{progress.tested} of {progress.squad} tested</small></span>
              </button>;
            })}
          </nav>
        </aside>
        {!day || !activeKey ? <EmptyState icon={<CalendarPlus size={24} />} title="No test days yet" body="Create a test day, then record the results one test at a time." />
          : <DayBoard day={day} squad={squad} results={results} battery={battery} activeKey={activeKey} onSelectTest={setTestKey} />}
      </div>}
  </div></AppShell>;
}

function NewTestDay({ onCreate }: { onCreate(input: { title: string; heldOn: string }): Promise<void> }) {
  const [title, setTitle] = useState("");
  const [heldOn, setHeldOn] = useState("");
  const [busy, setBusy] = useState(false);
  // Today is the browser’s today, set after mount so the server render agrees.
  useEffect(() => { const today = () => setHeldOn(localDateKey(new Date())); today(); }, []);
  return <form className="spenst-card grid gap-3 p-4" onSubmit={async (event) => {
    event.preventDefault();
    if (busy || !heldOn) return;
    setBusy(true);
    try { await onCreate({ title, heldOn }); setTitle(""); } catch { /* the provider has already said so */ } finally { setBusy(false); }
  }}>
    <h2 className="text-sm font-semibold">New test day</h2>
    <input className={inputClass} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="E.g. Autumn test" aria-label="Test day name" />
    <input className={inputClass} type="date" value={heldOn} onChange={(event) => setHeldOn(event.target.value)} aria-label="Date" required />
    <Button disabled={busy}><CalendarPlus size={17} />{busy ? "Creating …" : "Create"}</Button>
  </form>;
}

function DayBoard({ day, squad, results, battery, activeKey, onSelectTest }: { day: TestDay; squad: Athlete[]; results: TestResult[]; battery: readonly TestKey[]; activeKey: TestKey; onSelectTest(key: TestKey): void }) {
  const test: TestDefinition = TESTS[activeKey];
  const dayResults = results.filter((result) => result.testDayId === day.id);
  const entered = (key: string) => new Set(dayResults.filter((result) => result.testKey === key).map((result) => result.athleteId)).size;
  const next = battery[battery.indexOf(activeKey) + 1] ?? null;
  const top = useRef<HTMLDivElement>(null);
  const ovr = useDayOvrRows(day, squad);
  // Each athlete's rows behind this test, by the team's exercise mappings (or the suggested ones).
  const { ovrMappings } = useSpenst();
  const testRows = useMemo(() => {
    const mappingFor = (key: string, kind: OvrRow["sheet"], exercise: string, distanceM: number | null) =>
      ovrMappings.find((mapping) => mapping.teamId === day.teamId && mapping.key === key)
      ?? suggestMapping({ key, kind, exercise, distanceM, rows: 0, athletes: 0, latest: day.heldOn });
    return testAttempts(ovr, activeKey, mappingFor);
  }, [ovr, activeKey, ovrMappings, day.teamId, day.heldOn]);
  // OVR measures it: read, never typed. Tape and My Jump tests are still entered by hand.
  const fromOvr = test.device === "ovr-sprint" || test.device === "ovr-velocity" || test.device === "ovr-jump";
  return <section className="grid grid-cols-[minmax(0,1fr)] gap-4">
    <div className="spenst-card p-5">
      <h2 className="text-xl font-semibold tracking-[-.03em]">{day.title}</h2>
      <p className="mt-1 text-sm text-[var(--ink-soft)]">{formatDay(day.heldOn, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
      {day.notes && <p className="mt-3 text-sm leading-6 text-[var(--ink-mid)]">{day.notes}</p>}
    </div>
    <div ref={top} className="scroll-mt-24 sm:scroll-mt-4"><TestPicker battery={battery} activeKey={activeKey} squadSize={squad.length} entered={entered} onSelect={onSelectTest} /></div>
    {fromOvr
      ? <TestResults key={`${day.id}-${activeKey}`} test={test} squad={squad} results={dayResults} metrics={testRows.metrics} attempts={testRows.attempts} />
      : <TypedTest key={`${day.id}-${activeKey}`} day={day} test={test} squad={squad} results={dayResults} />}
    {/* The next station without scrolling back up through the squad. */}
    {next && <button type="button" className="test-next" onClick={() => { onSelectTest(next); top.current?.scrollIntoView({ block: "start", behavior: "smooth" }); }}>
      <span><small>Next test</small><strong>{TESTS[next].name}</strong></span>
      <span className="tabular text-sm text-[var(--ink-soft)]">{entered(next)} of {squad.length}</span>
      <ArrowRight size={18} />
    </button>}
  </section>;
}

/**
 * The day's tests grouped by the device that runs them — a test day is run as
 * stations — with how far each has come. Wraps instead of scrolling; on a
 * phone it folds into one button showing the current test.
 */
function TestPicker({ battery, activeKey, squadSize, entered, onSelect }: { battery: readonly TestKey[]; activeKey: TestKey; squadSize: number; entered(key: TestKey): number; onSelect(key: TestKey): void }) {
  const [open, setOpen] = useState(false);
  const devices = [...new Set(battery.map((key) => TESTS[key].device))];
  const done = battery.filter((key) => squadSize > 0 && entered(key) >= squadSize).length;
  return <nav className={cn("test-picker", open && "is-open")} aria-label="Tests">
    <button type="button" className="test-picker-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
      <span className="min-w-0 flex-1"><small>Test · {done} of {battery.length} done</small><strong>{TESTS[activeKey].name}</strong></span>
      <span className="tabular text-sm text-[var(--ink-soft)]">{entered(activeKey)} of {squadSize}</span>
      <ChevronDown size={18} className="test-picker-chevron" />
    </button>
    <div className="test-picker-groups">
      {devices.map((device) => <div key={device} className="test-picker-group">
        <h3>{deviceLabels[device]}</h3>
        <div className="test-picker-grid">
          {battery.filter((key) => TESTS[key].device === device).map((key) => {
            const count = entered(key);
            const complete = squadSize > 0 && count >= squadSize;
            return <button key={key} type="button" className={cn("test-tile", complete && "is-complete")} data-family={familyOf(TESTS[key])} aria-pressed={key === activeKey} onClick={() => { onSelect(key); setOpen(false); }}>
              <span className="test-tile-name">{TESTS[key].name}</span>
              <span className="test-tile-meta">{complete && <Check size={14} strokeWidth={2.5} />}<span className="tabular">{count} of {squadSize}</span></span>
              <span className="test-tile-bar" aria-hidden="true"><span style={{ width: `${squadSize ? Math.min(100, (count / squadSize) * 100) : 0}%` }} /></span>
            </button>;
          })}
        </div>
      </div>)}
    </div>
  </nav>;
}

/** The squad's OVR rows on the test day, refetched after an import or undo. */
function useDayOvrRows(day: TestDay, squad: Athlete[]) {
  const { loadOvrRowsForDay, ovrRowsVersion } = useSpenst();
  const [rows, setRows] = useState<OvrRow[]>([]);
  const ids = squad.map((athlete) => athlete.id).join(",");
  useEffect(() => {
    let live = true;
    loadOvrRowsForDay(ids ? ids.split(",") : [], day.heldOn).then((loaded) => { if (live) setRows(loaded); }).catch(() => { if (live) setRows([]); });
    return () => { live = false; };
  }, [ids, day.heldOn, loadOvrRowsForDay, ovrRowsVersion]);
  return rows;
}

/**
 * A test typed in by hand (tape, My Jump): the same results view as an OVR
 * test, with entry as a mode of its own. It opens on entry while nothing is in.
 */
function TypedTest({ day, test, squad, results }: { day: TestDay; test: TestDefinition; squad: Athlete[]; results: TestResult[] }) {
  const hasAny = results.some((result) => result.testKey === test.key);
  const [recording, setRecording] = useState(!hasAny);
  const entry = <div className="tr-entry">
    <p className="tr-entry-note"><Info size={16} />{deviceLabels[test.device]} · {test.unit === "cm" ? "centimetres" : test.unit === "m" ? "metres" : test.unit === "s" ? "seconds" : test.unit}{test.sided ? " · one result per leg" : ""} · the best of 2–3 attempts. Saved results are locked — use Edit to change one.</p>
    <div className="spenst-rows">{squad.map((athlete) => <EntryRow key={athlete.id} athlete={athlete} day={day} test={test} results={results} />)}</div>
  </div>;
  return <TestResults test={test} squad={squad} results={results} metrics={[]} attempts={[]} entry={entry} recording={recording} onRecord={setRecording} />;
}

function EntryRow({ athlete, day, test, results }: { athlete: Athlete; day: TestDay; test: TestDefinition; results: TestResult[] }) {
  const { saveResult } = useSpenst();
  const sides: (Side | null)[] = test.sided ? ["left", "right"] : [null];
  const stored = (side: Side | null) => results.find((result) => result.athleteId === athlete.id && result.testKey === test.key && result.side === side)?.value;
  const [drafts, setDrafts] = useState<Record<string, string>>(() => Object.fromEntries(sides.map((side) => [side ?? "both", numberText(stored(side))])));
  const [invalid, setInvalid] = useState<string | null>(null);
  // A saved result is locked: changing it takes a deliberate Edit, not a stray tap.
  const complete = sides.every((side) => stored(side) !== undefined);
  const [editing, setEditing] = useState(!complete);
  const unit = (value: number | undefined) => value === undefined ? "–" : `${numberText(value)} ${test.unit}`;

  function cancel() {
    setDrafts(Object.fromEntries(sides.map((side) => [side ?? "both", numberText(stored(side))])));
    setInvalid(null);
    if (complete) setEditing(false);
  }

  if (!editing) return <div className="entry-row is-locked">
    <span className="entry-row-name">{athlete.displayName}</span>
    <span className="entry-saved tabular">{sides.map((side) => <span key={side ?? "both"}>{side ? <small>{side === "left" ? "L" : "R"}</small> : null}{unit(stored(side))}</span>)}</span>
    <button type="button" className="entry-edit" aria-label={`Edit ${test.name} for ${athlete.displayName}`} onClick={() => setEditing(true)}><PenLine size={14} />Edit</button>
  </div>;


  // The field's own value: a blur can land before the last keystroke's render.
  async function commit(side: Side | null, typed?: string) {
    const key = side ?? "both";
    const text = typed ?? drafts[key] ?? "";
    const value = parseDecimal(text);
    if (text.trim() && value === null) { setInvalid(key); return; }
    setInvalid(null);
    try {
      if (value !== (stored(side) ?? null)) await saveResult({ testDayId: day.id, athleteId: athlete.id, testKey: test.key, side, value });
      // Every leg in: lock the row again.
      if (value !== null && sides.every((other) => (other ?? "both") === key || parseDecimal(drafts[other ?? "both"] ?? "") !== null)) setEditing(false);
    } catch { setDrafts((current) => ({ ...current, [key]: numberText(stored(side)) })); }
  }

  return <div className="entry-row">
    <span className="entry-row-name">{athlete.displayName}</span>
    <div className="entry-inputs">
      {sides.map((side) => {
        const key = side ?? "both";
        const label = side === "left" ? "Left" : side === "right" ? "Right" : test.unit;
        return <label key={key}>{side ? label : <span className="sr-only">{test.name} for {athlete.displayName}</span>}
          <input
            className={cn(inputClass, invalid === key && "border-[var(--danger)]")}
            inputMode="decimal"
            value={drafts[key] ?? ""}
            placeholder={side ? test.unit : label}
            aria-invalid={invalid === key || undefined}
            aria-label={side ? `${test.name}, ${label.toLocaleLowerCase("en-GB")} leg, ${athlete.displayName}` : undefined}
            onChange={(event) => setDrafts((current) => ({ ...current, [key]: event.target.value }))}
            onBlur={(event) => void commit(side, event.currentTarget.value)}
            onKeyDown={(event) => { if (event.key === "Enter") (event.target as HTMLInputElement).blur(); if (event.key === "Escape") cancel(); }}
          />
        </label>;
      })}
    </div>
    {complete && <button type="button" className="entry-edit" onClick={cancel}>Cancel</button>}
  </div>;
}
