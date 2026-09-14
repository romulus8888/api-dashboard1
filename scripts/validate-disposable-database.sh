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

  if [[ "${DISPOSABLE_DATABASE_URL}" == *"SUPABASE"* ]] || [[ "${DISPOSABLE_DATABASE_URL}" == *"supabase"* ]]; then
    echo "Refusing to run: DISPOSABLE_DATABASE_URL must not reference Supabase credentials or hosts." >&2
    exit 1
  fi
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

run_sql_file() {
  local label="$1"
  local file="$2"
  echo "==> $label: $(basename "$file")"
  psql "$DISPOSABLE_DATABASE_URL" -v ON_ERROR_STOP=1 -f "$file"
}

main() {
  require_ack
  require_database_url
  refuse_production_like_target "$(resolve_hostname)"
  require_psql

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

  local verify_scripts=( "$VERIFY_DIR"/*.sql )
  if (( ${#verify_scripts[@]} == 0 )); then
    echo "No verification scripts found in $VERIFY_DIR" >&2
    exit 1
  fi

  local verify
  for verify in "${verify_scripts[@]}"; do
    run_sql_file "verify" "$verify"
  done

  echo "OK: disposable database migrations and verification passed."
}

main "$@"
