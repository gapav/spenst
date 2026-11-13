import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildBootstrap, bootstrapPath, readMigrations } from "./build-bootstrap.mts";

describe("buildBootstrap", () => {
  it("concatenates migrations in the order given, each under its own banner", () => {
    const output = buildBootstrap([
      { name: "001_first.sql", sql: "select 1;\n" },
      { name: "002_second.sql", sql: "select 2;\n" },
    ]);
    expect(output).toContain("-- 001_first.sql");
    expect(output).toContain("-- 002_second.sql");
    expect(output.indexOf("select 1;")).toBeLessThan(output.indexOf("select 2;"));
  });

  it("commits after a migration that adds an enum value, before the next one runs", () => {
    const output = buildBootstrap([
      { name: "001_status.sql", sql: "alter type public.session_status add value if not exists 'done';\n" },
      { name: "002_uses_it.sql", sql: "update public.sessions set status = 'done';\n" },
    ]);
    expect(output.indexOf("commit;")).toBeGreaterThan(output.indexOf("add value"));
    expect(output.indexOf("commit;")).toBeLessThan(output.indexOf("update public.sessions"));
  });

  it("does not commit for migrations that touch no enum", () => {
    const output = buildBootstrap([{ name: "001_plain.sql", sql: "alter table t add column c text;\n" }]);
    expect(output).not.toContain("commit;");
  });

  it("ends with a schema reload so PostgREST sees the new tables", () => {
    const output = buildBootstrap([{ name: "001_plain.sql", sql: "alter table t add column c text;\n" }]);
    expect(output.trimEnd().endsWith("notify pgrst, 'reload schema';")).toBe(true);
  });

  it("does not repeat a reload the last migration already ends with", () => {
    const output = buildBootstrap([{ name: "001_plain.sql", sql: "alter table t add column c text;\n\nnotify pgrst, 'reload schema';\n" }]);
    expect(output.match(/notify pgrst/g)).toHaveLength(1);
  });
});

// The guard that matters: a migration added without regenerating the bootstrap
// leaves a fresh project missing that change.
it("bootstrap.sql is up to date with supabase/migrations", () => {
  expect(readFileSync(bootstrapPath, "utf8")).toBe(buildBootstrap(readMigrations()));
});
