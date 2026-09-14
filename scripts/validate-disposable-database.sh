#!/usr/bin/env bash
# Disposable PostgreSQL validation — LOCAL / CI ONLY.
# Never point at hosted Supabase or production databases.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck disable=SC1091
source "$ROOT/scripts/disposable-database-safety.sh"
FIXTURES="$ROOT/supabase/fixtures/disposable-test-prerequisites.sql"
MIGRATIONS_DIR="$ROOT/supabase/migrations"
VERIFY_DIR="$ROOT/supabase/verify"

run_sql_file() {
  local label="$1"
  local file="$2"
  local log
  log="$(mktemp)"
  echo "==> $label: $(basename "$file")"
  if ! disposable_psql -f "$file" >"$log" 2>&1; then
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
  prepare_disposable_database_connection
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

run_integration_scripts() {
  local integration_dir="$ROOT/scripts/integration"
  shopt -s nullglob
  local integration_scripts=( "$integration_dir"/*.sh )
  if (( ${#integration_scripts[@]} == 0 )); then
    echo "No integration scripts found in $integration_dir" >&2
    exit 1
  fi

  local integration
  for integration in "${integration_scripts[@]}"; do
    echo "==> integration: $(basename "$integration")"
    integration_log="$(mktemp)"
    if ! bash "$integration" >"$integration_log" 2>&1; then
      cat "$integration_log" >&2
      if [[ -n "${GITHUB_ACTIONS:-}" ]]; then
        echo "::error title=integration failed::$(basename "$integration")" >&2
        grep -E 'ERROR:|FATAL:|integration |connection A|connection B|timed out|missing integration' "$integration_log" | head -20 | while IFS= read -r line; do
          echo "::error::${line}" >&2
        done || true
      fi
      rm -f "$integration_log"
      echo "FAILED integration: $(basename "$integration")" >&2
      exit 4
    fi
    rm -f "$integration_log"
  done
}

main() {
  local mode="${1:-all}"

  case "$mode" in
    all)
      prepare_connection
      run_fixtures_and_migrations
      run_verify_scripts
      run_integration_scripts
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
    integration)
      prepare_connection
      run_integration_scripts
      ;;
    *)
      echo "Unknown mode: $mode (expected all, bootstrap, verify, verify-file, or integration)" >&2
      exit 1
      ;;
  esac

  echo "OK: disposable database migrations and verification passed."
}

main "$@"
