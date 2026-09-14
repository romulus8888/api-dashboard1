#!/usr/bin/env bash
# Disposable PostgreSQL validation — LOCAL / CI ONLY.
# Never point at hosted Supabase or production databases.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck disable=SC1091
source "$ROOT/scripts/disposable-database-safety.sh"

TRACK="${DISPOSABLE_VALIDATION_TRACK:-clean}"
if [[ "${1:-}" == "clean" || "${1:-}" == "legacy" ]]; then
  TRACK="$1"
  shift
fi

PREREQUISITES="$ROOT/supabase/fixtures/disposable-test-prerequisites.sql"
ACTIVE_MIGRATIONS_DIR="$ROOT/supabase/migrations"
ACTIVE_VERIFY_DIR="$ROOT/supabase/verify"
LEGACY_JOBS_FIXTURE="$ROOT/supabase/legacy/fixtures/legacy-jobs-stub.sql"
LEGACY_MIGRATIONS_DIR="$ROOT/supabase/legacy/migrations"
LEGACY_VERIFY_DIR="$ROOT/supabase/legacy/verify"
LEGACY_AUDIT_MIGRATION="$LEGACY_MIGRATIONS_DIR/20260814000000_create_job_processing_audit.sql"
LEGACY_LOCKDOWN_MIGRATION="$LEGACY_MIGRATIONS_DIR/20260910180000_lockdown_legacy_jobs.sql"

run_sql_file() {
  local label="$1"
  local file="$2"
  local log
  log="$(mktemp)"
  echo "==> [$TRACK] $label: $(basename "$file")"
  if ! disposable_psql -f "$file" >"$log" 2>&1; then
    cat "$log" >&2
    if [[ -n "${GITHUB_ACTIONS:-}" ]]; then
      echo "::error title=${label} SQL failed::$(basename "$file")" >&2
      grep -E 'ERROR:|FATAL:|failed|exception' "$log" | head -10 | while IFS= read -r line; do
        echo "::error::${line}" >&2
      done || true
    fi
    echo "FAILED [$TRACK] ${label}: $(basename "$file")" >&2
    rm -f "$log"
    exit 3
  fi
  rm -f "$log"
}

prepare_connection() {
  prepare_disposable_database_connection
}

run_active_migrations() {
  shopt -s nullglob
  local migrations=( "$ACTIVE_MIGRATIONS_DIR"/*.sql )
  if (( ${#migrations[@]} == 0 )); then
    echo "No active migration files found in $ACTIVE_MIGRATIONS_DIR" >&2
    exit 1
  fi

  local migration
  for migration in "${migrations[@]}"; do
    run_sql_file "migration" "$migration"
  done
}

run_clean_bootstrap() {
  if [[ ! -f "$PREREQUISITES" ]]; then
    echo "Missing prerequisite file: $PREREQUISITES" >&2
    exit 1
  fi

  run_sql_file "fixture" "$PREREQUISITES"
  run_active_migrations
}

run_legacy_bootstrap() {
  if [[ ! -f "$PREREQUISITES" || ! -f "$LEGACY_JOBS_FIXTURE ]]; then
    echo "Missing legacy fixture files under supabase/fixtures or supabase/legacy/fixtures" >&2
    exit 1
  fi

  if [[ ! -f "$LEGACY_AUDIT_MIGRATION" || ! -f "$LEGACY_LOCKDOWN_MIGRATION" ]]; then
    echo "Missing legacy migration files under $LEGACY_MIGRATIONS_DIR" >&2
    exit 1
  fi

  run_sql_file "fixture" "$PREREQUISITES"
  run_sql_file "legacy-fixture" "$LEGACY_JOBS_FIXTURE"
  run_sql_file "legacy-migration" "$LEGACY_AUDIT_MIGRATION"
  run_active_migrations
  run_sql_file "legacy-migration" "$LEGACY_LOCKDOWN_MIGRATION"
}

run_fixtures_and_migrations() {
  case "$TRACK" in
    clean) run_clean_bootstrap ;;
    legacy) run_legacy_bootstrap ;;
    *)
      echo "Unknown validation track: $TRACK (expected clean or legacy)" >&2
      exit 1
      ;;
  esac
}

run_verify_scripts() {
  shopt -s nullglob
  local verify_scripts=( "$ACTIVE_VERIFY_DIR"/*.sql )
  if (( ${#verify_scripts[@]} == 0 )); then
    echo "No verification scripts found in $ACTIVE_VERIFY_DIR" >&2
    exit 1
  fi

  local verify
  for verify in "${verify_scripts[@]}"; do
    if [[ "$TRACK" == "legacy" && "$(basename "$verify")" == "phase11_clean_install.sql" ]]; then
      echo "==> [$TRACK] verify: skipping $(basename "$verify") (clean-install guard only)"
      continue
    fi
    run_sql_file "verify" "$verify"
  done

  if [[ "$TRACK" == "legacy" ]]; then
    local legacy_verify_scripts=( "$LEGACY_VERIFY_DIR"/*.sql )
    if (( ${#legacy_verify_scripts[@]} == 0 )); then
      echo "No legacy verification scripts found in $LEGACY_VERIFY_DIR" >&2
      exit 1
    fi

    for verify in "${legacy_verify_scripts[@]}"; do
      run_sql_file "legacy-verify" "$verify"
    done
  fi
}

run_integration_scripts() {
  if [[ "$TRACK" != "clean" ]]; then
    echo "Integration scripts run only on the clean validation track." >&2
    exit 1
  fi

  local integration_dir="$ROOT/scripts/integration"
  shopt -s nullglob
  local integration_scripts=( "$integration_dir"/*.sh )
  if (( ${#integration_scripts[@]} == 0 )); then
    echo "No integration scripts found in $integration_dir" >&2
    exit 1
  fi

  local integration
  for integration in "${integration_scripts[@]}"; do
    echo "==> [$TRACK] integration: $(basename "$integration")"
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
      echo "FAILED [$TRACK] integration: $(basename "$integration")" >&2
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
      if [[ "$TRACK" == "clean" ]]; then
        run_integration_scripts
      fi
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

  echo "OK: [$TRACK] disposable database migrations and verification passed."
}

main "$@"
