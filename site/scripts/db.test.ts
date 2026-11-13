// @vitest-environment node
//
// The pure parts of scripts/db.sh (npm run db:*), which never touch a
// database: the push plan is a function of the versions on disk and in the
// project's history. Mirrors Grep's site/scripts/migrate-tooling.test.ts.
import { execFileSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

const script = path.join(import.meta.dirname, "db.sh");

function plan(local: string[], remote: string[], tables: number) {
  const out = execFileSync("bash", ["-c", 'source "$1"; plan "$2" "$3" "$4" && rc=0 || rc=$?; echo "rc=$rc"', "_", script, local.join("\n"), remote.join("\n"), String(tables)], { encoding: "utf8" });
  const lines = out.trim().split("\n").filter(Boolean);
  const rc = Number(lines.pop()!.replace("rc=", ""));
  return { rc, lines };
}

describe("plan", () => {
  const disk = ["202610070001", "202610070002", "202610070004"];

  it("has nothing pending when the history matches the files", () => {
    expect(plan(disk, disk, 20)).toEqual({ rc: 0, lines: [] });
  });

  it("lists a file newer than the newest applied one as pending", () => {
    expect(plan([...disk, "202611130001"], disk, 20)).toEqual({ rc: 0, lines: ["PENDING 202611130001"] });
  });

  it("builds an empty project from every file", () => {
    expect(plan(disk, [], 0)).toEqual({ rc: 0, lines: disk.map((v) => `PENDING ${v}`) });
  });

  it("refuses when the history is empty but public has tables (pasted by hand: baseline first)", () => {
    expect(plan(disk, [], 20).rc).toBe(10);
  });

  it("refuses a file older than the newest applied one", () => {
    expect(plan(disk, ["202610070001", "202610070004"], 20)).toEqual({ rc: 11, lines: ["OUT_OF_ORDER 202610070002"] });
  });

  it("refuses when the project has a version this checkout lacks", () => {
    expect(plan(disk, [...disk, "202612010001"], 20)).toEqual({ rc: 12, lines: ["MISSING_LOCAL 202612010001"] });
  });
});

describe("local_versions", () => {
  it("reads the version off every migration file, oldest first", () => {
    const out = execFileSync("bash", ["-c", 'source "$1"; local_versions', "_", script], { encoding: "utf8" }).trim().split("\n");
    expect(out[0]).toBe("202610070001");
    expect(out).toEqual([...out].sort());
  });
});
