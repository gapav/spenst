"use client";

import { ArrowLeft, Check, ChevronDown, Database, Download, FileSpreadsheet, Info, Undo2, Upload } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useSpenst } from "./app-provider";
import { AppShell } from "./app-shell";
import { PageHeading } from "./page-heading";
import { Button, EmptyState, Tag } from "./ui";
import {
  ALTERNATING_SET_REPS, alternatingIssues, defaultDates, exportedAt, importWrites, legsOf, matchAthletes, OvrFormatError, ovrMeasures, ovrRows, parseOvrExport, planImport, rememberedMatches,
  sameFileImport, sha256Hex, suggestMapping, testsFor, type OvrExport, type OvrMapping, type OvrMeasure, type PlannedDate, type TestImport, type ValueStatus,
} from "@/lib/ovr-import";
import { detailsOutOf, detailsPlace, detailsSummary } from "@/lib/ovr-data";
import { TESTS, type TestKey } from "@/lib/power-profile";
import { teamAthletes } from "@/lib/squad";
import type { Side } from "@/lib/types";
import { cn, countLabel, formatDay } from "@/lib/utils";
import { readWorkbook, WorkbookError } from "@/lib/xlsx";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const sheetLabels = { velocity: "Velocity", jump: "Jump", sprint: "Sprint" } as const;
const statusLabels: Record<ValueStatus, string> = { new: "New", same: "Already in", differs: "Differs" };
const statusTones = { new: "sage", same: "neutral", differs: "apricot" } as const;

function formatValue(testKey: TestKey, value: number) {
  const { unit } = TESTS[testKey];
  const digits = unit === "s" ? 3 : unit === "W" ? 0 : 1;
  return `${new Intl.NumberFormat("en-GB", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value)} ${unit}`;
}
const fileSize = (bytes: number) => bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} kB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
const measureLabel = (measure: OvrMeasure) => measure.distanceM === null ? measure.exercise : `${measure.exercise} · at ${measure.distanceM} m`;

interface Loaded { file: File; sha256: string; data: OvrExport }

/**
 * OVR Connect exports the athletes' whole history every time, so an import is
 * a comparison, not a copy: read the file, match it to the roster and the
 * tests, show what is new, and write only that — keeping the file itself.
 */
export function OvrImport() {
  const { currentTeam, workspaceLoaded } = useSpenst();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [done, setDone] = useState<TestImport | null>(null);

  async function choose(file: File) {
    setError(null); setDone(null); setReading(true);
    try {
      if (file.size > MAX_FILE_BYTES) throw new WorkbookError("That file is over 10 MB — larger than any OVR export should be.");
      const buffer = await file.arrayBuffer();
      const data = parseOvrExport(readWorkbook(new Uint8Array(buffer)));
      setLoaded({ file, sha256: await sha256Hex(buffer), data });
    } catch (caught) {
      setError(caught instanceof WorkbookError || caught instanceof OvrFormatError ? caught.message : "Couldn’t read that file.");
    } finally {
      setReading(false);
    }
  }

  return <AppShell><div className="spenst-page">
    <Link href="/testing" className="mb-4 inline-flex items-center gap-2 text-sm text-[var(--ink-soft)] underline underline-offset-4 hover:text-[var(--ink)]"><ArrowLeft size={16} />Testing</Link>
    <PageHeading eyebrow={currentTeam?.name ?? "Spenst"} title="Import from OVR" description="Upload the export from OVR Connect. It holds everyone’s whole history; Spenst keeps the file, finds what’s new, fills in the test days and keeps every rep." />
    {!workspaceLoaded ? <p role="status" className="spenst-loading">Loading …</p> : !currentTeam
      ? <EmptyState icon={<FileSpreadsheet size={24} />} title="No teams yet" body="When you are added to a team, you can import its OVR data here." />
      : <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
        {done && <ImportDone record={done} onClose={() => setDone(null)} />}
        {loaded
          ? <ImportReview key={loaded.sha256} loaded={loaded} onCancel={() => setLoaded(null)} onDone={(record) => { setLoaded(null); setDone(record); }} />
          : <DropZone reading={reading} error={error} onFile={(file) => void choose(file)} />}
        <ImportHistory />
      </div>}
  </div></AppShell>;
}

function DropZone({ reading, error, onFile }: { reading: boolean; error: string | null; onFile(file: File): void }) {
  const [over, setOver] = useState(false);
  return <div>
    <label
      className={cn("import-drop", over && "is-over")}
      onDragOver={(event) => { event.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => { event.preventDefault(); setOver(false); const file = event.dataTransfer.files[0]; if (file) onFile(file); }}
    >
      <input type="file" className="sr-only" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={reading} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) onFile(file); }} />
      <span className="import-drop-icon"><Upload size={22} /></span>
      <strong>{reading ? "Reading the file …" : "Drop the OVR export here, or choose a file"}</strong>
      <small>In OVR Connect: export athlete data (.xlsx). The whole history is fine — only what’s new goes in.</small>
    </label>
    {error && <p role="alert" className="mt-3 text-sm text-[var(--danger)]">{error}</p>}
  </div>;
}

function ImportReview({ loaded, onCancel, onDone }: { loaded: Loaded; onCancel(): void; onDone(record: TestImport): void }) {
  const { currentTeam, athletes, testDays, results, testImports, ovrMappings, importOvr } = useSpenst();
  const teamId = currentTeam?.id ?? "";
  const squad = useMemo(() => teamAthletes(athletes, teamId).sort((a, b) => a.displayName.localeCompare(b.displayName)), [athletes, teamId]);
  const measures = useMemo(() => ovrMeasures(loaded.data), [loaded.data]);
  const found = useMemo(() => matchAthletes(loaded.data, squad, rememberedMatches(testImports, teamId)), [loaded.data, squad, testImports, teamId]);

  const [matchChoices, setMatchChoices] = useState<Record<string, string | null>>({});
  const [mappingChoices, setMappingChoices] = useState<Record<string, OvrMapping>>({});
  const [dateChoices, setDateChoices] = useState<Record<string, boolean>>({});
  const [replace, setReplace] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const mappings = useMemo(() => new Map(measures.map((measure) => {
    const saved = ovrMappings.find((mapping) => mapping.teamId === teamId && mapping.key === measure.key) ?? null;
    return [measure.key, mappingChoices[measure.key] ?? suggestMapping(measure, saved)];
  })), [measures, ovrMappings, teamId, mappingChoices]);
  const matches = useMemo(() => new Map(found.map((match) => [match.name, match.name in matchChoices ? matchChoices[match.name] : match.athleteId])), [found, matchChoices]);
  const plan = useMemo(() => planImport({ data: loaded.data, mappings, matches, teamId, testDays, results }), [loaded.data, mappings, matches, teamId, testDays, results]);
  const defaults = defaultDates(plan);
  const included = new Set(plan.dates.filter((entry) => dateChoices[entry.date] ?? defaults.has(entry.date)).map((entry) => entry.date));
  const writes = importWrites(plan, { dates: included, replaceDiffering: replace });
  const differing = plan.dates.filter((entry) => included.has(entry.date)).reduce((sum, entry) => sum + entry.counts.differs, 0);
  const sameFile = sameFileImport(testImports, teamId, loaded.sha256);
  // Every row for the matched athletes goes to the database, which skips what it already has.
  const rows = useMemo(() => ovrRows(loaded.data, matches, legsOf(loaded.data.velocity, mappings)), [loaded.data, matches, mappings]);
  const matchesName = (name: string) => squad.find((athlete) => athlete.id === matches.get(name))?.displayName ?? name;
  const issues = useMemo(() => alternatingIssues(loaded.data.velocity, mappings).filter((issue) => matches.get(issue.athlete)), [loaded.data.velocity, mappings, matches]);
  const rowCounts = { velocity: 0, jump: 0, sprint: 0, ...Object.fromEntries((["velocity", "jump", "sprint"] as const).map((sheet) => [sheet, rows.filter((row) => row.sheet === sheet).length])) };
  const rowDates = [...new Set(rows.map((row) => row.performedOn))].sort();
  // The same file again only has rows to add for athletes it did not match last time.
  const freshRows = sameFile ? rows.filter((row) => !Object.values(sameFile.summary.matches).includes(row.athleteId)).length : rows.length;
  const when = exportedAt(loaded.file.name);
  const [withNews, without] = [plan.dates.filter((entry) => entry.counts.new > 0 || entry.counts.differs > 0), plan.dates.filter((entry) => !entry.counts.new && !entry.counts.differs)];
  const nothing = !writes.results.length && !freshRows;

  const setMapping = (key: string, patch: Partial<OvrMapping>) => setMappingChoices((current) => ({ ...current, [key]: { ...(mappings.get(key) as OvrMapping), ...patch } }));

  async function run() {
    setBusy(true); setFailure(null);
    try {
      const remembered = Object.fromEntries([...matches].filter((entry): entry is [string, string] => Boolean(entry[1])));
      const record = await importOvr({ file: loaded.file, sha256: loaded.sha256, writes, rows, mappings: [...mappings.values()], matches: remembered, exportedAt: when ? `${when.date} ${when.time}` : null });
      onDone(record);
    } catch (caught) {
      setFailure(caught instanceof Error ? caught.message : "The import didn’t go through.");
    } finally {
      setBusy(false);
    }
  }

  const matched = found.filter((match) => matches.get(match.name));
  const unmatched = found.filter((match) => !matches.get(match.name));

  return <>
    <section className="spenst-card import-file" aria-label="The file">
      <span className="import-file-icon"><FileSpreadsheet size={22} /></span>
      <div className="min-w-0 flex-1">
        <strong className="block truncate">{loaded.file.name}</strong>
        <small>{fileSize(loaded.file.size)}{when ? ` · exported ${formatDay(when.date, { day: "numeric", month: "short" })} at ${when.time}` : ""} · {countLabel(loaded.data.velocity.length, "rep", "reps")}, {countLabel(loaded.data.jump.length, "jump", "jumps")}, {countLabel(loaded.data.sprint.length, "sprint split", "sprint splits")}{loaded.data.skippedRows ? ` · ${loaded.data.skippedRows} rows skipped` : ""}</small>
      </div>
      <Button variant="ghost" size="sm" onClick={onCancel}>Choose another file</Button>
    </section>
    {sameFile && <p className="spenst-context-note"><Info size={18} />This exact file was imported on {formatDay(sameFile.createdAt.slice(0, 10))}. Nothing is new unless you change a match or a mapping below.</p>}

    <section className="spenst-card overflow-hidden" aria-labelledby="import-athletes">
      <div className="spenst-section-heading"><div>
        <h2 id="import-athletes">Athletes</h2>
        <p>Matched to {currentTeam?.name} by first name and initial. OVR’s names stay in the stored file, which only coaches can open.</p>
      </div><Tag tone={unmatched.length ? "apricot" : "sage"}>{matched.length} of {found.length} matched</Tag></div>
      <div className="import-rows">
        {matched.map((match) => <AthleteRow key={match.name} match={match} value={matches.get(match.name) ?? null} squad={squad} onChange={(athleteId) => setMatchChoices((current) => ({ ...current, [match.name]: athleteId }))} />)}
      </div>
      {unmatched.length > 0 && <details className="import-more">
        <summary><ChevronDown size={16} />{countLabel(unmatched.length, "name", "names")} not on {currentTeam?.name} — other groups, or spelled differently</summary>
        <div className="import-rows">{unmatched.map((match) => <AthleteRow key={match.name} match={match} value={null} squad={squad} onChange={(athleteId) => setMatchChoices((current) => ({ ...current, [match.name]: athleteId }))} />)}</div>
      </details>}
    </section>

    <section className="spenst-card import-all" aria-labelledby="import-all">
      <span className="import-file-icon"><Database size={20} /></span>
      <div className="min-w-0 flex-1">
        <h2 id="import-all">Everything in the file is kept</h2>
        <p>{rows.length
          ? <>{[rowCounts.velocity && countLabel(rowCounts.velocity, "rep", "reps"), rowCounts.jump && countLabel(rowCounts.jump, "jump", "jumps"), rowCounts.sprint && countLabel(rowCounts.sprint, "sprint split", "sprint splits")].filter(Boolean).join(", ")} for {countLabel(new Set(rows.map((row) => row.athleteId)).size, "athlete", "athletes")}, {rowDates.length === 1 ? formatDay(rowDates[0], { day: "numeric", month: "short", year: "numeric" }) : `${formatDay(rowDates[0], { day: "numeric", month: "short", year: "numeric" })} – ${formatDay(rowDates.at(-1) as string, { day: "numeric", month: "short", year: "numeric" })}`} — every column OVR wrote, training sets too. Rows already stored are skipped; rows OVR has changed are updated.</>
          : "Match athletes to the roster and their rows are kept: every rep, jump and split, with every column."}</p>
        {unmatched.length > 0 && rows.length > 0 && <p>Rows for names not on the team stay only in the stored file — add the athlete to the roster and import again to keep theirs.</p>}
      </div>
    </section>

    <section className="spenst-card overflow-hidden" aria-labelledby="import-exercises">
      <div className="spenst-section-heading"><div>
        <h2 id="import-exercises">What each exercise is</h2>
        <p>Chosen once, remembered for the team. Power tests take the best rep’s peak power; sprints the fastest time.</p>
      </div></div>
      <div className="import-rows">
        {measures.map((measure) => <MeasureRow key={measure.key} measure={measure} mapping={mappings.get(measure.key) as OvrMapping} onChange={(patch) => setMapping(measure.key, patch)} />)}
      </div>
      {issues.length > 0 && <div className="import-issues" role="alert">
        <strong>Check {issues.length === 1 ? "this set" : `these ${issues.length} sets`}: alternating sets should have {ALTERNATING_SET_REPS} reps, {ALTERNATING_SET_REPS / 2} a leg.</strong>
        <p>A missed or extra rep moves every rep after it onto the other leg. These sets are imported as they are — check them in OVR.</p>
        <ul>{issues.map((issue) => <li key={`${issue.athlete}-${issue.date}-${issue.set}`}>{matchesName(issue.athlete)} · {formatDay(issue.date, { day: "numeric", month: "short" })} · {issue.exercise}, set {issue.set ?? "–"}: <strong>{issue.reps} reps</strong></li>)}</ul>
      </div>}
    </section>

    <section className="spenst-card overflow-hidden" aria-labelledby="import-dates">
      <div className="spenst-section-heading"><div>
        <h2 id="import-dates">What’s new</h2>
        <p>Dates with something Spenst doesn’t have yet are ticked. A value typed by hand is kept unless you choose to replace it.</p>
      </div></div>
      {!plan.dates.length && <p className="import-empty">Nothing in the file goes anywhere yet: match the athletes and choose what the exercises are.</p>}
      <div className="import-rows">
        {withNews.map((entry) => <DateRow key={entry.date} entry={entry} checked={included.has(entry.date)} onCheck={(checked) => setDateChoices((current) => ({ ...current, [entry.date]: checked }))} />)}
      </div>
      {without.length > 0 && <details className="import-more">
        <summary><ChevronDown size={16} />{countLabel(without.length, "date", "dates")} already in Spenst</summary>
        <div className="import-rows">{without.map((entry) => <DateRow key={entry.date} entry={entry} checked={false} onCheck={() => undefined} />)}</div>
      </details>}
      {differing > 0 && <label className="import-replace"><input type="checkbox" checked={replace} onChange={(event) => setReplace(event.target.checked)} />Replace {countLabel(differing, "value", "values")} that differ from what Spenst has</label>}
    </section>

    <div className="import-actions">
      <p>{nothing
        ? "Nothing new to import."
        : <>Keeps <strong>{countLabel(rows.length, "OVR row", "OVR rows")}</strong>, and imports <strong>{countLabel(writes.results.length, "test result", "test results")}</strong>{writes.newTestDays.length ? ` on ${countLabel(writes.newTestDays.length, "new test day", "new test days")}` : ""}. The file is kept with the import.</>}</p>
      {failure && <p role="alert" className="text-sm text-[var(--danger)]">{failure}</p>}
      <Button disabled={busy || nothing} onClick={() => void run()}>{busy ? "Importing …" : "Import"}</Button>
    </div>
  </>;
}

function AthleteRow({ match, value, squad, onChange }: { match: ReturnType<typeof matchAthletes>[number]; value: string | null; squad: { id: string; displayName: string }[]; onChange(athleteId: string | null): void }) {
  return <div className="import-row">
    <div className="min-w-0 flex-1">
      <strong>{match.name}</strong>
      <small>{[match.groups, countLabel(match.rows, "row", "rows")].filter(Boolean).join(" · ")}</small>
    </div>
    {value && match.how === "remembered" && <Tag tone="neutral">Remembered</Tag>}
    <select className="metric-input import-select" aria-label={`Athlete for ${match.name}`} value={value ?? ""} onChange={(event) => onChange(event.target.value || null)}>
      <option value="">Not on this team</option>
      {squad.map((athlete) => <option key={athlete.id} value={athlete.id}>{athlete.displayName}{match.candidates.includes(athlete.id) && !value ? " (same first name)" : ""}</option>)}
    </select>
  </div>;
}

function MeasureRow({ measure, mapping, onChange }: { measure: OvrMeasure; mapping: OvrMapping; onChange(patch: Partial<OvrMapping>): void }) {
  const tests = testsFor(measure.kind);
  const sided = mapping.testKey ? TESTS[mapping.testKey].sided : false;
  const proAgility = /5\s*-?\s*10\s*-?\s*5|pro agility/i.test(measure.exercise);
  return <div className="import-row is-measure">
    <div className="min-w-0 flex-1">
      <strong><Tag tone="neutral">{sheetLabels[measure.kind]}</Tag> {measureLabel(measure)}</strong>
      <small>{countLabel(measure.athletes, "athlete", "athletes")} · {countLabel(measure.rows, measure.kind === "sprint" ? "time" : "rep", measure.kind === "sprint" ? "times" : "reps")} · latest {formatDay(measure.latest, { day: "numeric", month: "short", year: "numeric" })}</small>
      {proAgility && !mapping.testKey && <small className="text-[var(--warn-ink)]">Pro agility (5-10-5) isn’t the 505, and Spenst has no test for it yet.</small>}
    </div>
    <div className="import-mapping">
      <label><span>Test</span>
        <select className="metric-input import-select" value={mapping.testKey ?? ""} onChange={(event) => { const testKey = (event.target.value || null) as TestKey | null; onChange({ testKey, side: null, firstLeg: testKey && TESTS[testKey].sided ? "left" : null }); }}>
          <option value="">Not a test</option>
          {tests.map((key) => <option key={key} value={key}>{TESTS[key].name}</option>)}
        </select>
      </label>
      {sided && <label><span>Legs</span>
        <select className="metric-input import-select" value={mapping.side ? `only-${mapping.side}` : `alt-${mapping.firstLeg ?? "left"}`} onChange={(event) => {
          const [kind, leg] = event.target.value.split("-") as ["alt" | "only", Side];
          onChange(kind === "alt" ? { side: null, firstLeg: leg } : { side: leg, firstLeg: null });
        }}>
          <option value="alt-left">Alternating, left foot first</option>
          <option value="alt-right">Alternating, right foot first</option>
          <option value="only-left">This exercise is the left leg</option>
          <option value="only-right">This exercise is the right leg</option>
        </select>
      </label>}
    </div>
  </div>;
}

function DateRow({ entry, checked, onCheck }: { entry: PlannedDate; checked: boolean; onCheck(checked: boolean): void }) {
  const { athletes, testDays } = useSpenst();
  const name = (id: string) => athletes.find((athlete) => athlete.id === id)?.displayName ?? "Athlete";
  const day = testDays.find((candidate) => candidate.id === entry.testDayId);
  const actionable = entry.counts.new > 0 || entry.counts.differs > 0;
  return <details className="import-date">
    <summary>
      {actionable && <input type="checkbox" aria-label={`Import ${formatDay(entry.date)}`} checked={checked} onClick={(event) => event.stopPropagation()} onChange={(event) => onCheck(event.target.checked)} />}
      <span className="min-w-0 flex-1">
        <strong>{formatDay(entry.date, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</strong>
        <small>{day ? `Test day “${day.title}”` : "A new test day"}</small>
      </span>
      <span className="import-counts">
        {entry.counts.new > 0 && <Tag tone="sage">{entry.counts.new} new</Tag>}
        {entry.counts.differs > 0 && <Tag tone="apricot">{entry.counts.differs} differ</Tag>}
        {entry.counts.same > 0 && <Tag tone="neutral">{entry.counts.same} already in</Tag>}
      </span>
      <ChevronDown size={16} className="import-chevron" />
    </summary>
    <div className="import-date-body">
      {entry.results.length > 0 && <table className="data-table import-values">
        <thead><tr><th scope="col">Athlete</th><th scope="col">Test</th><th scope="col" className="num">From OVR</th><th scope="col" className="num">In Spenst</th><th scope="col"><span className="sr-only">Status</span></th></tr></thead>
        <tbody>{[...entry.results].sort((a, b) => name(a.athleteId).localeCompare(name(b.athleteId)) || a.testKey.localeCompare(b.testKey)).map((result) => <tr key={`${result.athleteId}-${result.testKey}-${result.side}`}>
          <th scope="row">{name(result.athleteId)}</th>
          <td>{TESTS[result.testKey].name}{result.side ? `, ${result.side}` : ""}</td>
          <td className="num">{formatValue(result.testKey, result.value)}{result.status !== "same" && result.details && <small className="attempt-summary">{[detailsSummary(result.details), detailsPlace(result.details), detailsOutOf(result.details)].filter(Boolean).join(" · ")}</small>}</td>
          <td className="num">{result.existing === null ? "—" : formatValue(result.testKey, result.existing)}</td>
          <td><Tag tone={statusTones[result.status]}>{statusLabels[result.status]}</Tag></td>
        </tr>)}</tbody>
      </table>}
    </div>
  </details>;
}

function ImportDone({ record, onClose }: { record: TestImport; onClose(): void }) {
  const { testDays, currentTeam } = useSpenst();
  const latest = [...record.summary.dates].reverse().map((date) => testDays.find((day) => day.teamId === currentTeam?.id && day.heldOn === date)).find(Boolean);
  return <div role="status" className="import-done">
    <span className="import-file-icon"><Check size={20} /></span>
    <p className="min-w-0 flex-1"><strong>Imported.</strong> {countLabel(record.summary.rowsAdded, "new OVR row", "new OVR rows")}{record.summary.rowsChanged ? `, ${record.summary.rowsChanged} updated` : ""}; {countLabel(record.summary.results, "test result", "test results")}. The file is stored.</p>
    {latest && <Link href={`/testing?day=${latest.id}`} className="font-semibold underline underline-offset-4">See the test day</Link>}
    <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
  </div>;
}

function ImportHistory() {
  const { currentTeam, testImports, undoImport, importFileUrl } = useSpenst();
  const [confirming, setConfirming] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const imports = testImports.filter((entry) => entry.teamId === currentTeam?.id);
  if (!imports.length) return null;

  async function download(id: string) {
    setProblem(null);
    try {
      const url = await importFileUrl(id);
      const link = document.createElement("a");
      link.href = url; link.download = imports.find((entry) => entry.id === id)?.fileName ?? "ovr-export.xlsx";
      link.click();
    } catch (caught) { setProblem(caught instanceof Error ? caught.message : "Couldn’t get the file."); }
  }

  return <section className="spenst-card overflow-hidden" aria-labelledby="import-history">
    <div className="spenst-section-heading"><div>
      <h2 id="import-history">Earlier imports</h2>
      <p>Undo removes what an import wrote — its OVR rows and results — and the test days it made if they are left empty. The file stays.</p>
    </div></div>
    {problem && <p role="alert" className="import-empty text-[var(--danger)]">{problem}</p>}
    <div className="import-rows">{imports.map((entry) => <div key={entry.id} className="import-row">
      <div className="min-w-0 flex-1">
        <strong className="block truncate">{entry.fileName}</strong>
        <small>{formatDay(entry.createdAt.slice(0, 10), { day: "numeric", month: "short", year: "numeric" })} · {countLabel(entry.summary.rowsAdded, "row", "rows")}{entry.summary.rowsChanged ? ` (+${entry.summary.rowsChanged} updated)` : ""} · {countLabel(entry.summary.results, "result", "results")}{entry.summary.dates.length ? ` · ${entry.summary.dates.length === 1 ? formatDay(entry.summary.dates[0], { day: "numeric", month: "short" }) : `${formatDay(entry.summary.dates[0], { day: "numeric", month: "short" })} – ${formatDay(entry.summary.dates.at(-1) as string, { day: "numeric", month: "short" })}`}` : ""}</small>
      </div>
      {entry.status !== "applied" && <Tag tone={entry.status === "failed" ? "rose" : "neutral"}>{entry.status === "failed" ? "Failed" : entry.status === "undone" ? "Undone" : "Uploaded"}</Tag>}
      <Button variant="ghost" size="sm" onClick={() => void download(entry.id)}><Download size={15} />File</Button>
      {entry.status !== "undone" && (confirming === entry.id
        ? <Button variant="danger" size="sm" onClick={() => { setConfirming(null); void undoImport(entry.id).catch(() => undefined); }}>Remove what it added</Button>
        : <Button variant="ghost" size="sm" onClick={() => setConfirming(entry.id)}><Undo2 size={15} />Undo</Button>)}
    </div>)}</div>
  </section>;
}
