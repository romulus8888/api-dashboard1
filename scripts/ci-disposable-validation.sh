#!/usr/bin/env bash
# CI-only disposable PostgreSQL validation for clean and legacy tracks.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PG_IMAGE="${DISPOSABLE_CI_POSTGRES_IMAGE:-postgres:16}"
PG_PASSWORD="${DISPOSABLE_CI_POSTGRES_PASSWORD:-postgres}"
BASE_URL="${DISPOSABLE_DATABASE_URL:-postgresql://postgres:${PG_PASSWORD}@localhost:5432/postgres}"
LEGACY_URL="${DISPOSABLE_LEGACY_DATABASE_URL:-postgresql://postgres:${PG_PASSWORD}@localhost:5432/postgres_legacy}"

log() {
  echo "==> [ci-disposable] $*"
}

fail() {
  local status="${1:-2}"
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

wait_for_postgres() {
  local url="$1"
  local attempts=60
  while [ "$attempts" -gt 0 ]; do
    if psql "$url" -v ON_ERROR_STOP=1 -c 'select 1' >/dev/null 2>&1; then
      return 0
    fi
    attempts=$((attempts - 1))
    sleep 1
  done
  fail 2 "postgres is not reachable at $url (expected ${PG_IMAGE})"
}

if ! command -v psql >/dev/null 2>&1; then
  fail 2 "psql is required (install postgresql-client)"
fi

export DISPOSABLE_TEST_ACK=yes
export PGSSLMODE=disable

log "waiting for clean database (${PG_IMAGE})"
wait_for_postgres "$BASE_URL"

export DISPOSABLE_VALIDATION_TRACK=clean
export DISPOSABLE_DATABASE_URL="$BASE_URL"

log "clean track bootstrap"
run_validate "clean track bootstrap" 10 bootstrap

log "clean track schema probe"
psql "$BASE_URL" -v ON_ERROR_STOP=1 \
  -c "select to_regclass('public.jobs') as jobs, to_regclass('public.job_processing_audit') as job_audit"

log "clean track verify"
run_validate "clean track verify" 11 verify

log "clean track integration"
run_validate "clean track integration" 12 integration

log "preparing legacy database"
psql "$BASE_URL" -v ON_ERROR_STOP=1 \
  -c "select pg_terminate_backend(pid) from pg_stat_activity where datname = 'postgres_legacy' and pid <> pg_backend_pid()" || true
psql "$BASE_URL" -v ON_ERROR_STOP=1 -c 'drop database if exists postgres_legacy'
psql "$BASE_URL" -v ON_ERROR_STOP=1 -c 'create database postgres_legacy template template0'

export DISPOSABLE_VALIDATION_TRACK=legacy
export DISPOSABLE_DATABASE_URL="$LEGACY_URL"

log "waiting for legacy database"
wait_for_postgres "$LEGACY_URL"

log "legacy track bootstrap"
run_validate "legacy track bootstrap" 20 bootstrap

log "legacy track verify"
run_validate "legacy track verify" 21 verify

log "clean and legacy disposable validation passed"
