#!/usr/bin/env bash
# CI-only disposable PostgreSQL validation for clean and legacy tracks.
# Uses the workflow postgres:16 service (host psql); never touches hosted Supabase.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE_URL="${DISPOSABLE_DATABASE_URL:-postgresql://postgres:postgres@localhost:5432/postgres}"
LEGACY_URL="postgresql://postgres:postgres@localhost:5432/postgres_legacy"
PG_IMAGE="${DISPOSABLE_CI_POSTGRES_IMAGE:-postgres:16}"

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

log "waiting for ${PG_IMAGE} postgres service"
attempts=30
while [ "$attempts" -gt 0 ]; do
  if psql "$BASE_URL" -v ON_ERROR_STOP=1 -c 'select 1 as disposable_postgres_ready' >/dev/null 2>&1; then
    break
  fi
  attempts=$((attempts - 1))
  sleep 1
done

if [ "$attempts" -eq 0 ]; then
  fail 2 "postgres service is not ready"
fi

export DISPOSABLE_TEST_ACK=yes
export DISPOSABLE_DATABASE_URL="$BASE_URL"
unset DISPOSABLE_PSQL_MODE DISPOSABLE_CI_CONTAINER_NAME DISPOSABLE_CI_HOST_WORKSPACE_ROOT

export DISPOSABLE_VALIDATION_TRACK=clean
run_validate "clean track bootstrap" 10 bootstrap

log "clean track verify"
shopt -s nullglob
for verify in "$ROOT"/supabase/verify/*.sql; do
  run_validate "clean track verify $(basename "$verify")" 11 verify-file "$verify"
done

run_validate "clean track integration" 12 integration

log "preparing legacy database on ${PG_IMAGE}"
psql "$BASE_URL" -v ON_ERROR_STOP=1 -c "select pg_terminate_backend(pid) from pg_stat_activity where datname = 'postgres_legacy' and pid <> pg_backend_pid()" || true
psql "$BASE_URL" -v ON_ERROR_STOP=1 -c 'drop database if exists postgres_legacy'
psql "$BASE_URL" -v ON_ERROR_STOP=1 -c 'create database postgres_legacy'

export DISPOSABLE_VALIDATION_TRACK=legacy
export DISPOSABLE_DATABASE_URL="$LEGACY_URL"
run_validate "legacy track validation" 13 all

log "clean and legacy disposable validation passed"
