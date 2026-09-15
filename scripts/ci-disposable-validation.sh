#!/usr/bin/env bash
# CI-only disposable PostgreSQL validation for clean and legacy tracks.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PG_IMAGE="${DISPOSABLE_CI_POSTGRES_IMAGE:-postgres:16}"
PG_PASSWORD="${DISPOSABLE_CI_POSTGRES_PASSWORD:-postgres}"
BASE_URL="${DISPOSABLE_DATABASE_URL:-postgresql://postgres:${PG_PASSWORD}@localhost:5432/postgres}"
LEGACY_URL="${DISPOSABLE_LEGACY_DATABASE_URL:-postgresql://postgres:${PG_PASSWORD}@localhost:5432/postgres_legacy}"

# shellcheck disable=SC1091
source "$ROOT/scripts/disposable-database-safety.sh"

log() {
  echo "==> [ci-disposable] $*"
}

fail() {
  local status="${1:-1}"
  shift || true
  echo "FAILED [ci-disposable] $*" >&2
  if [[ -n "${GITHUB_ACTIONS:-}" ]]; then
    echo "::error::$*" >&2
  fi
  exit "$status"
}

run_validate() {
  local label="$1"
  local status_code="$2"
  shift 2
  log "$label"
  if ! bash "$ROOT/scripts/validate-disposable-database.sh" "$@"; then
    fail "$status_code" "$label"
  fi
}

export DISPOSABLE_TEST_ACK=yes
export DISPOSABLE_DATABASE_URL="$BASE_URL"

log "waiting for postgres (${PG_IMAGE})"
prepare_disposable_database_connection
disposable_psql -c 'select 1 as disposable_postgres_ready'

export DISPOSABLE_VALIDATION_TRACK=clean
run_validate "clean track bootstrap" 10 bootstrap
run_validate "clean track verify" 11 verify
run_validate "clean track integration" 12 integration

log "preparing legacy database"
export DISPOSABLE_DATABASE_URL="$BASE_URL"
prepare_disposable_database_connection
disposable_psql -c "select pg_terminate_backend(pid) from pg_stat_activity where datname = 'postgres_legacy' and pid <> pg_backend_pid()" || true
disposable_psql -c 'drop database if exists postgres_legacy'
disposable_psql -c 'create database postgres_legacy template template0'

export DISPOSABLE_VALIDATION_TRACK=legacy
export DISPOSABLE_DATABASE_URL="$LEGACY_URL"
prepare_disposable_database_connection

run_validate "legacy track bootstrap" 20 bootstrap
run_validate "legacy track verify" 21 verify

log "clean and legacy disposable validation passed"
