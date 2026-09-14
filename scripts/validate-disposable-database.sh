#!/usr/bin/env bash
# Disposable PostgreSQL validation — LOCAL / CI ONLY.
# Never point at hosted Supabase or production databases.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FIXTURES="$ROOT/supabase/fixtures/disposable-test-prerequisites.sql"
MIGRATIONS_DIR="$ROOT/supabase/migrations"
VERIFY_DIR="$ROOT/supabase/verify"

require_ack() {
  if [[ "${DISPOSABLE_TEST_ACK:-}" != "yes" ]]; then
    echo "Refusing to run: set DISPOSABLE_TEST_ACK=yes to confirm a disposable-only target." >&2
    exit 1
  fi
}

require_database_url() {
  if [[ -z "${DISPOSABLE_DATABASE_URL:-}" ]]; then
    echo "DISPOSABLE_DATABASE_URL is required (postgresql://…)." >&2
    exit 1
  fi

  node -e "
    try {
      new URL(process.env.DISPOSABLE_DATABASE_URL);
    } catch {
      console.error('DISPOSABLE_DATABASE_URL must be a valid URL.');
      process.exit(1);
    }
  "
}

export_pg_connection_env() {
  node -e "
    const url = new URL(process.env.DISPOSABLE_DATABASE_URL);
    const entries = [
      ['PGHOST', url.hostname],
      ['PGPORT', url.port || '5432'],
      ['PGUSER', decodeURIComponent(url.username)],
      ['PGPASSWORD', decodeURIComponent(url.password)],
      ['PGDATABASE', url.pathname.replace(/^\\//, '')],
    ];
    for (const [key, value] of entries) {
      if (value) process.stdout.write(\`export \${key}=\${JSON.stringify(value)}\\n\`);
    }
  "
}

resolve_hostname() {
  node -e "const u = new URL(process.argv[1]); process.stdout.write(u.hostname.toLowerCase());" "$DISPOSABLE_DATABASE_URL"
}

refuse_production_like_target() {
  local host="$1"
  local url_lower
  url_lower="$(printf '%s' "$DISPOSABLE_DATABASE_URL" | tr '[:upper:]' '[:lower:]')"

  case "$url_lower" in
    *supabase.co*|*supabase.com*|*pooler.supabase*|*neon.tech*|*amazonaws.com*|*rds.amazonaws.com*)
      echo "Refusing production-like database URL." >&2
      exit 1
      ;;
  esac

  case "$host" in
    localhost|127.0.0.1|::1|postgres)
      return 0
      ;;
  esac

  if [[ -n "${DISPOSABLE_TEST_EXTRA_HOSTS:-}" ]]; then
    local allowed
    IFS=',' read -r -a allowed <<< "$DISPOSABLE_TEST_EXTRA_HOSTS"
    for entry in "${allowed[@]}"; do
      if [[ "$host" == "$(echo "$entry" | tr '[:upper:]' '[:lower:]' | xargs)" ]]; then
        return 0
      fi
    done
  fi

  echo "Refusing database host '$host'. Allowed: localhost, 127.0.0.1, ::1, postgres, or DISPOSABLE_TEST_EXTRA_HOSTS." >&2
  exit 1
}

require_psql() {
  if ! command -v psql >/dev/null 2>&1; then
    echo "psql is required but was not found in PATH." >&2
    exit 1
  fi
}

wait_for_postgres() {
  local attempts=30
  while (( attempts > 0 )); do
    if psql -v ON_ERROR_STOP=1 -c 'select 1' >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
    attempts=$((attempts - 1))
  done

  echo "PostgreSQL is not reachable at DISPOSABLE_DATABASE_URL." >&2
  exit 2
}

run_sql_file() {
  local label="$1"
  local file="$2"
  local log
  log="$(mktemp)"
  echo "==> $label: $(basename "$file")"
  if ! psql -v ON_ERROR_STOP=1 -f "$file" >"$log" 2>&1; then
    cat "$log" >&2
    if [[ -n "${GITHUB_ACTIONS:-}" ]]; then
      echo "::error title=${label} SQL failed::$(basename "$file")" >&2
      grep -E 'ERROR:|FATAL:|failed|exception' "$log" | head -10 | while IFS= read -r line; do
        echo "::error::${line}" >&2
      done || true
    fi
    echo "FAILED ${label}: $(basename "$file")" >&2
    rm -f "$log"
    exit 3
  fi
  rm -f "$log"
}

prepare_connection() {
  require_ack
  require_database_url
  refuse_production_like_target "$(resolve_hostname)"
  eval "$(export_pg_connection_env)"
  export PGSSLMODE="${PGSSLMODE:-disable}"
  require_psql
  wait_for_postgres
}

run_fixtures_and_migrations() {
  if [[ ! -f "$FIXTURES" ]]; then
    echo "Missing fixture file: $FIXTURES" >&2
    exit 1
  fi

  run_sql_file "fixture" "$FIXTURES"

  shopt -s nullglob
  local migrations=( "$MIGRATIONS_DIR"/*.sql )
  if (( ${#migrations[@]} == 0 )); then
    echo "No migration files found in $MIGRATIONS_DIR" >&2
    exit 1
  fi

  local migration
  for migration in "${migrations[@]}"; do
    run_sql_file "migration" "$migration"
  done
}

run_verify_scripts() {
  shopt -s nullglob
  local verify_scripts=( "$VERIFY_DIR"/*.sql )
  if (( ${#verify_scripts[@]} == 0 )); then
    echo "No verification scripts found in $VERIFY_DIR" >&2
    exit 1
  fi

  local verify
  for verify in "${verify_scripts[@]}"; do
    run_sql_file "verify" "$verify"
  done
}

main() {
  local mode="${1:-all}"

  case "$mode" in
    all)
      prepare_connection
      run_fixtures_and_migrations
      run_verify_scripts
      ;;
    bootstrap)
      prepare_connection
      run_fixtures_and_migrations
      ;;
    verify)
      prepare_connection
      run_verify_scripts
      ;;
    verify-file)
      if [[ $# -lt 2 ]]; then
        echo "verify-file requires a path to a .sql file" >&2
        exit 1
      fi
      prepare_connection
      run_sql_file "verify" "$2"
      ;;
    *)
      echo "Unknown mode: $mode (expected all, bootstrap, verify, or verify-file)" >&2
      exit 1
      ;;
  esac

  echo "OK: disposable database migrations and verification passed."
}

main "$@"
