// Generates supabase/bootstrap.sql by concatenating supabase/migrations/*.sql
// in filename order, so a brand-new Supabase project needs exactly one paste
// into the SQL Editor. Run `npm run db:bootstrap` after adding a migration;
// build-bootstrap.test.ts fails the suite if the checked-in file has drifted.
// Copied from Grep (site/scripts/build-bootstrap.mts); only the names differ.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export interface Migration {
  name: string;
  sql: string;
}

const RULE = `-- ${"=".repeat(60)}`;
const RELOAD = "notify pgrst, 'reload schema';";

const banner = (line: string) => `${RULE}\n-- ${line}\n${RULE}`;

// ALTER TYPE ... ADD VALUE cannot be followed by a use of the new value in the
// same transaction, and the SQL Editor wraps a whole paste in one.
const addsEnumValue = (sql: string) => /alter\s+type\b[\s\S]*?\badd\s+value\b/i.test(sql);

export function buildBootstrap(migrations: Migration[]): string {
  const enumMigrations = migrations.filter((migration) => addsEnumValue(migration.sql));
  const chunks = [preamble(enumMigrations)];

  for (const migration of migrations) {
    chunks.push(`${banner(migration.name)}\n${migration.sql.trim()}`);
    if (addsEnumValue(migration.sql)) {
      chunks.push(`${banner(`Commit the enum addition from ${stem(migration.name)} before it is used below.`)}\ncommit;`);
    }
  }

  const body = chunks.join("\n\n");
  // Every migration ends up in one paste, so PostgREST only has to be told once
  // — but only add the notify if the last chunk did not already do it.
  return body.trimEnd().endsWith(RELOAD)
    ? `${body.trimEnd()}\n`
    : `${body.trimEnd()}\n\n-- Make the new schema visible to PostgREST immediately after a manual SQL Editor run.\n${RELOAD}\n`;
}

function preamble(enumMigrations: Migration[]): string {
  const lines = [
    "-- Bootstrap script for Spenst",
    "-- GENERATED FILE — do not edit by hand. Run `npm run db:bootstrap` after",
    "-- adding a migration. supabase/migrations/ stays the source of truth; this",
    "-- file is only their concatenation in filename order, so a brand-new, empty",
    "-- Supabase project can be built with a single SQL Editor paste.",
  ];
  if (enumMigrations.length) {
    lines.push(
      "--",
      "-- Why the explicit COMMITs below: the SQL Editor runs a multi-statement paste",
      "-- as a single implicit transaction, and the migrations listed here add an enum",
      "-- value via ALTER TYPE ... ADD VALUE, which Postgres cannot use until that",
      "-- transaction commits. Each is followed by a COMMIT that closes the",
      "-- transaction; everything after it runs in a fresh implicit one.",
      ...enumMigrations.map((migration) => `--   ${stem(migration.name)}`),
    );
  }
  return lines.join("\n");
}

const stem = (name: string) => name.replace(/_.*$/, "");

export const migrationsDir = path.join(import.meta.dirname, "..", "supabase", "migrations");
export const bootstrapPath = path.join(import.meta.dirname, "..", "supabase", "bootstrap.sql");

export function readMigrations(dir: string = migrationsDir): Migration[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => ({ name, sql: readFileSync(path.join(dir, name), "utf8") }));
}

if (process.argv[1] === import.meta.filename) {
  const migrations = readMigrations();
  writeFileSync(bootstrapPath, buildBootstrap(migrations));
  console.log(`Wrote ${path.relative(process.cwd(), bootstrapPath)} from ${migrations.length} migrations.`);
}
