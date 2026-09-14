from pathlib import Path

Path("scripts/ci-disposable-validation.sh").write_text(
    """#!/usr/bin/env bash
# CI-only disposable PostgreSQL validation for clean and legacy tracks.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PG_IMAGE="${DISPOSABLE_CI_POSTGRES_IMAGE:-postgres:16}"
PG_PASSWORD="${DISPOSABLE_CI_POSTGRES_PASSWORD:-postgres}"
LEGACY_URL="${DISPOSABLE_LEGACY_DATABASE_URL:-postgresql://postgres:${PG_PASSWORD}@localhost:5432/postgres_legacy}"

log() {
  echo "==> [ci-disposable] $*"
}

fail() {
  echo "FAILED [ci-disposable] $*" >&2
  if [[ -n "${GITHUB_ACTIONS:-}" ]]; then
    echo "::error::$*" >&2
  fi
  exit 2
}

wait_for_postgres() {
  local attempts=60
  while [ "$attempts" -gt 0 ]; do
    if psql -v ON_ERROR_STOP=1 -c 'select 1' >/dev/null 2>&1; then
      return 0
    fi
    attempts=$((attempts - 1))
    sleep 1
  done
  fail "postgres is not reachable (PGHOST=${PGHOST:-unset} PGPORT=${PGPORT:-unset} url=${DISPOSABLE_DATABASE_URL:-unset})"
}

log "waiting for postgres service (${PG_IMAGE})"
wait_for_postgres
psql -v ON_ERROR_STOP=1 -c 'select 1 as disposable_postgres_ready'

export DISPOSABLE_VALIDATION_TRACK=clean
log "clean track bootstrap"
bash "$ROOT/scripts/validate-disposable-database.sh" bootstrap

log "clean track schema probe"
psql -v ON_ERROR_STOP=1 \\
  -c "select to_regclass('public.jobs') as jobs, to_regclass('public.job_processing_audit') as job_audit"

log "clean track verify"
bash "$ROOT/scripts/validate-disposable-database.sh" verify

log "clean track integration"
bash "$ROOT/scripts/validate-disposable-database.sh" integration

log "preparing legacy database"
psql -v ON_ERROR_STOP=1 \\
  -c "select pg_terminate_backend(pid) from pg_stat_activity where datname = 'postgres_legacy' and pid <> pg_backend_pid()" || true
psql -v ON_ERROR_STOP=1 -c 'drop database if exists postgres_legacy'
psql -v ON_ERROR_STOP=1 -c 'create database postgres_legacy template template0'

export DISPOSABLE_VALIDATION_TRACK=legacy
export DISPOSABLE_DATABASE_URL="$LEGACY_URL"

log "legacy track bootstrap"
bash "$ROOT/scripts/validate-disposable-database.sh" bootstrap

log "legacy track verify"
bash "$ROOT/scripts/validate-disposable-database.sh" verify

log "clean and legacy disposable validation passed"
""",
    encoding="utf-8",
    newline="\n",
)
