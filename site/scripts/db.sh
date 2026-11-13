#!/usr/bin/env bash
# Spenst's one way to touch the database (decision 21). Run through npm from
# site/, by the maintainer or by an agent:
#
#   npm run db:status               which migrations the project has, and which are pending
#   npm run db:push                 back up, dry-run, then apply every pending migration
#   npm run db:baseline -- <version>  mark migrations up to <version> applied without running them
#   npm run db:backup               dump public + auth users into backups/
#   npm run db:sql -- "<sql>"       run SQL (or `-- -f file.sql`) against the project
#
# Adapted from Grep's scripts/migrate.sh and scripts/lib.sh, without the
# prompts: Spenst has one project, and the agent runs this unattended.
#
# The connection comes from site/.env.db (gitignored, never read by agents):
#
#   SUPABASE_DB_URL=postgresql://postgres.<ref>:<password>@<host>:5432/postgres
#
# the Session pooler URI from the dashboard (Connect → Session pooler). The
# password is split off into PGPASSWORD, which psql, pg_dump and the Supabase
# CLI read from the environment, so it never appears on a command line, in
# `ps`, or in this script's output.
#
# Supabase's own supabase_migrations.schema_migrations is the record of what is
# applied. `db push` runs only the files it lacks; this script refuses to push
# when that history and the schema disagree (see `plan`).

set -euo pipefail

SITE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "$SITE_DIR/.." && pwd)"
MIGRATIONS_DIR="$SITE_DIR/supabase/migrations"
ENV_FILE="$SITE_DIR/.env.db"
BACKUP_DIR="$REPO_ROOT/backups"
LEDGER="$REPO_ROOT/DEPLOYMENT.md"

say() { printf '%s\n' "$*"; }
die() { printf 'db: %s\n' "$*" >&2; exit 1; }

# ---------------------------------------------------------------------------
# Connection

DB_URL="" PROJECT_REF=""

connect() {
  [[ -f "$ENV_FILE" ]] || die "No site/.env.db. Copy site/.env.db.example and paste the Session pooler URI into it (see DEPLOYMENT.md)."
  local raw
  raw="$(sed -n 's/^SUPABASE_DB_URL=//p' "$ENV_FILE" | tail -1 | tr -d '"'"'"'[:space:]')"
  [[ -n "$raw" ]] || die "site/.env.db has no SUPABASE_DB_URL."
  [[ "$raw" != *YOUR-PASSWORD* && "$raw" != *YOUR_PASSWORD* ]] || die "site/.env.db still has the password placeholder."
  # Parsed by Node, so a URL-encoded password is decoded properly. Output:
  # user, host, port, database, then the password on the last line.
  local parts
  parts="$(DB_URL_RAW="$raw" node -e '
    const u = new URL(process.env.DB_URL_RAW);
    console.log([decodeURIComponent(u.username), u.hostname, u.port || "5432", u.pathname.slice(1) || "postgres", decodeURIComponent(u.password)].join("\n"));
  ')" || die "SUPABASE_DB_URL in site/.env.db is not a postgresql:// URI."
  local user host port database
  user="$(sed -n 1p <<<"$parts")"; host="$(sed -n 2p <<<"$parts")"
  port="$(sed -n 3p <<<"$parts")"; database="$(sed -n 4p <<<"$parts")"
  PGPASSWORD="$(sed -n '5,$p' <<<"$parts")"
  [[ -n "$PGPASSWORD" ]] || die "SUPABASE_DB_URL has no password."
  [[ "$port" != 6543 ]] || die "Port 6543 is the transaction pooler. Use the Session pooler URI (port 5432)."
  if [[ "$user" == postgres.* ]]; then PROJECT_REF="${user#postgres.}"
  elif [[ "$host" =~ ^db\.([a-z0-9]+)\.supabase\.co$ ]]; then PROJECT_REF="${BASH_REMATCH[1]}"
  else PROJECT_REF="unknown"; fi
  export PGPASSWORD PGHOST="$host" PGPORT="$port" PGUSER="$user" PGDATABASE="$database" PGSSLMODE=require
  # No password in the URL: the CLI's Postgres client reads PGPASSWORD.
  DB_URL="postgresql://${user}@${host}:${port}/${database}?sslmode=require"
}

q() { psql -tAX -v ON_ERROR_STOP=1 -c "$1"; }

# ---------------------------------------------------------------------------
# What is applied where

local_versions() {
  local f
  for f in "$MIGRATIONS_DIR"/*.sql; do
    [[ -e "$f" ]] || continue
    f="$(basename "$f")"
    if [[ "$f" =~ ^([0-9]+)_ ]]; then printf '%s\n' "${BASH_REMATCH[1]}"; fi
  done | sort
}

migration_file() {
  local f
  for f in "$MIGRATIONS_DIR/$1"_*.sql; do if [[ -e "$f" ]]; then basename "$f"; fi; done
}

in_list() { local needle="$1" item; for item in $2; do [[ "$item" == "$needle" ]] && return 0; done; return 1; }

REMOTE_VERSIONS="" PUBLIC_TABLES=0

read_remote() {
  PUBLIC_TABLES="$(q "select count(*) from pg_tables where schemaname = 'public'")" \
    || die "Could not connect. Wrong password, the Direct (IPv6) host instead of the Session pooler, or the project is paused."
  if [[ "$(q "select to_regclass('supabase_migrations.schema_migrations') is not null")" == t ]]; then
    REMOTE_VERSIONS="$(q "select version from supabase_migrations.schema_migrations order by version")"
  else
    REMOTE_VERSIONS=""
  fi
}

# plan <local> <remote> <tables>: prints PENDING / OUT_OF_ORDER / MISSING_LOCAL
# lines and returns 0 (safe), 10 (tables but no history: baseline first),
# 11 (a file older than the newest applied one is missing remotely) or 12 (the
# project has a version this checkout lacks). The same rules as Grep's.
plan() {
  local local_v="$1" remote_v="$2" tables="${3:-0}" v newest="" rc=0
  if [[ -z "${remote_v//[[:space:]]/}" ]] && (( tables > 0 )); then return 10; fi
  for v in $remote_v; do
    if [[ -z "$newest" ]] || (( 10#$v > 10#$newest )); then newest="$v"; fi
    if ! in_list "$v" "$local_v"; then printf 'MISSING_LOCAL %s\n' "$v"; rc=12; fi
  done
  for v in $local_v; do
    in_list "$v" "$remote_v" && continue
    if [[ -n "$newest" ]] && (( 10#$v < 10#$newest )); then
      printf 'OUT_OF_ORDER %s\n' "$v"; (( rc == 0 )) && rc=11
    else
      printf 'PENDING %s\n' "$v"
    fi
  done
  return $rc
}

# Marks every migration in the project's history `applied` in the dev column
# of the ledger in DEPLOYMENT.md, adding a row for any the table lacks.
sync_ledger() {
  [[ -f "$LEDGER" ]] || return 0
  local v f
  for v in $REMOTE_VERSIONS; do
    f="$(migration_file "$v")"; [[ -n "$f" ]] || continue
    if grep -qF "| \`$f\` |" "$LEDGER"; then
      sed -i '' -E "s/^(\| \`$f\` \| )[a-z]+( \|)/\1applied\2/" "$LEDGER"
    else
      # After the last row of the ledger table.
      local last; last="$(grep -n '^| `[0-9]' "$LEDGER" | tail -1 | cut -d: -f1)"
      [[ -n "$last" ]] && sed -i '' "${last}a\\
| \`$f\` | applied | pending |
" "$LEDGER"
    fi
  done
}

cli() { (cd "$SITE_DIR" && supabase "$@" --db-url "$DB_URL"); }

# ---------------------------------------------------------------------------
# Commands

cmd_status() {
  connect; read_remote
  say "Project $PROJECT_REF — $PUBLIC_TABLES tables in public, $(printf '%s\n' "$REMOTE_VERSIONS" | sed '/^$/d' | wc -l | tr -d ' ') migrations in its history."
  local out rc v
  out="$(plan "$(local_versions)" "$REMOTE_VERSIONS" "$PUBLIC_TABLES")" && rc=0 || rc=$?
  for v in $(local_versions); do
    if in_list "$v" "$REMOTE_VERSIONS"; then say "  applied   $(migration_file "$v")"; fi
  done
  [[ -n "$out" ]] && while read -r kind v; do
    case "$kind" in
      PENDING) say "  pending   $(migration_file "$v")" ;;
      OUT_OF_ORDER) say "  SKIPPED   $(migration_file "$v")  (older than the newest applied one)" ;;
      MISSING_LOCAL) say "  UNKNOWN   $v  (in the project, no file here)" ;;
    esac
  done <<<"$out"
  [[ $rc == 10 ]] && say "  The history is empty but public has tables: run db:baseline before db:push."
  return 0
}

cmd_backup() {
  [[ -n "$DB_URL" ]] || connect
  local dir; dir="$BACKUP_DIR/$PROJECT_REF-$(date +%Y%m%d-%H%M%S)"
  mkdir -p "$dir"
  pg_dump --no-owner --no-privileges --schema=public --file "$dir/public.sql" \
    || die "pg_dump of public failed; nothing else was done."
  pg_dump --no-owner --no-privileges --data-only --table=auth.users --table=auth.identities --file "$dir/auth-users.sql" \
    || die "pg_dump of auth users failed; nothing else was done."
  [[ -s "$dir/public.sql" ]] || die "The backup in $dir is empty; nothing else was done."
  (cd "$dir" && shasum -a 256 ./*.sql > SHA256SUMS)
  say "Backed up to ${dir#"$REPO_ROOT"/}"
}

cmd_push() {
  connect; read_remote
  local out rc pending v
  out="$(plan "$(local_versions)" "$REMOTE_VERSIONS" "$PUBLIC_TABLES")" && rc=0 || rc=$?
  case "$rc" in
    0) ;;
    10) die "The project has $PUBLIC_TABLES tables but no migration history, so a push would rerun everything. Run db:baseline first. Nothing was applied." ;;
    11) die "Older than the newest applied migration but not applied:$(sed -n 's/^OUT_OF_ORDER / /p' <<<"$out" | tr '\n' ' ') — rename it after the newest, or baseline it if the schema has it. Nothing was applied." ;;
    12) die "The project has migrations this checkout lacks:$(sed -n 's/^MISSING_LOCAL / /p' <<<"$out" | tr '\n' ' '). Nothing was applied." ;;
    *) die "Could not work out the plan (status $rc)." ;;
  esac
  pending="$(sed -n 's/^PENDING //p' <<<"$out")"
  if [[ -z "$pending" ]]; then say "Nothing to apply: $PROJECT_REF has every migration."; sync_ledger; return 0; fi
  say "Pending on $PROJECT_REF:"; for v in $pending; do say "  $(migration_file "$v")"; done
  cmd_backup
  cli db push --dry-run || die "The dry run failed. Nothing was applied."
  # Never --include-all: an out-of-order file was refused above.
  cli db push --yes || { read_remote; sync_ledger; die "supabase db push failed. Each migration runs in its own transaction: those now in the history went in, the failed one did not (db:status)."; }
  read_remote; sync_ledger
  say "Applied. Ledger in DEPLOYMENT.md updated."
}

cmd_baseline() {
  local cutoff="${1:-}"
  [[ -n "$cutoff" ]] || die "Usage: npm run db:baseline -- <version>  (every migration up to it is marked applied, not run)"
  local lv; lv="$(local_versions)"
  in_list "$cutoff" "$lv" || die "$cutoff is not the version of a file in supabase/migrations."
  connect; read_remote
  (( PUBLIC_TABLES > 0 )) || die "public has no tables, so there is nothing to baseline: db:push builds an empty project."
  local candidates="" v
  for v in $lv; do
    (( 10#$v <= 10#$cutoff )) || continue
    in_list "$v" "$REMOTE_VERSIONS" || candidates="$candidates $v"
  done
  if [[ -z "${candidates// /}" ]]; then say "The history already has every migration up to $cutoff."; return 0; fi
  say "Marking applied, without running them:"; for v in $candidates; do say "  $(migration_file "$v")"; done
  # shellcheck disable=SC2086  # one argument per version
  cli migration repair --status applied $candidates || die "supabase migration repair failed."
  read_remote; sync_ledger
  say "Done. Ledger in DEPLOYMENT.md updated."
}

cmd_sql() {
  [[ $# -gt 0 ]] || die "Usage: npm run db:sql -- \"select …\"   or   npm run db:sql -- -f file.sql"
  connect
  if [[ "$1" == -f ]]; then
    [[ -f "${2:-}" ]] || die "No such file: ${2:-}"
    psql -X -v ON_ERROR_STOP=1 --single-transaction -f "$2"
  else
    psql -X -v ON_ERROR_STOP=1 --single-transaction -c "$1"
  fi
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  command -v psql >/dev/null && command -v pg_dump >/dev/null || die "psql and pg_dump are needed: brew install postgresql@17"
  command -v supabase >/dev/null || die "The Supabase CLI is needed: brew install supabase/tap/supabase"
  sub="${1:-}"; shift || true
  case "$sub" in
    status) cmd_status ;;
    push) cmd_push ;;
    baseline) cmd_baseline "$@" ;;
    backup) cmd_backup ;;
    sql) cmd_sql "$@" ;;
    *) die "Usage: db.sh status|push|baseline <version>|backup|sql <sql>" ;;
  esac
fi
