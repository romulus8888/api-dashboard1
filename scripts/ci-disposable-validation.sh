#!/usr/bin/env bash
# CI-only disposable PostgreSQL validation for clean and legacy tracks.
# Uses the workflow postgres:16 service (host psql); never touches hosted Supabase.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LEGACY_URL="postgresql://postgres:postgres@localhost:5432/postgres_legacy"
PG_IMAGE="${DISPOSABLE_CI_POSTGRES_IMAGE:-postgres:16}"

log() {
  echo "==> [ci-disposable] $*"
}

export DISPOSABLE_TEST_ACK=yes
unset DISPOSABLE_PSQL_MODE DISPOSABLE_CI_CONTAINER_NAME DISPOSABLE_CI_HOST_WORKSPACE_ROOT

log "waiting for ${PG_IMAGE} postgres service"
psql -v ON_ERROR_STOP=1 -c 'select 1 as disposable_postgres_ready'

export DISPOSABLE_VALIDATION_TRACK=clean
log "clean track bootstrap"
bash "$ROOT/scripts/validate-disposable-database.sh" bootstrap

log "clean track verify"
shopt -s nullglob
for verify in "$ROOT"/supabase/verify/*.sql; do
  log "verify $(basename "$verify")"
  bash "$ROOT/scripts/validate-disposable-database.sh" verify-file "$verify"
done

log "clean track integration"
bash "$ROOT/scripts/validate-disposable-database.sh" integration

log "preparing legacy database on ${PG_IMAGE}"
psql -v ON_ERROR_STOP=1 -c "select pg_terminate_backend(pid) from pg_stat_activity where datname = 'postgres_legacy' and pid <> pg_backend_pid()" || true
psql -v ON_ERROR_STOP=1 -c 'drop database if exists postgres_legacy'
psql -v ON_ERROR_STOP=1 -c 'create database postgres_legacy'

export DISPOSABLE_VALIDATION_TRACK=legacy
export DISPOSABLE_DATABASE_URL="$LEGACY_URL"
log "legacy track validation"
bash "$ROOT/scripts/validate-disposable-database.sh" all

log "clean and legacy disposable validation passed"
