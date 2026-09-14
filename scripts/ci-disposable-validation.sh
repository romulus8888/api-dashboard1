#!/usr/bin/env bash
# CI-only disposable PostgreSQL validation for clean and legacy tracks.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PG_IMAGE="${DISPOSABLE_CI_POSTGRES_IMAGE:-postgres:16}"
PG_PASSWORD="${DISPOSABLE_CI_POSTGRES_PASSWORD:-postgres}"
LEGACY_URL="${DISPOSABLE_LEGACY_DATABASE_URL:-postgresql://postgres:${PG_PASSWORD}@localhost:5432/postgres_legacy}"

log() {
  echo "==> [ci-disposable] $*"
}

psql -v ON_ERROR_STOP=1 -c 'select 1 as disposable_postgres_ready'

export DISPOSABLE_VALIDATION_TRACK=clean
log "clean track bootstrap (${PG_IMAGE})"
bash "$ROOT/scripts/validate-disposable-database.sh" bootstrap

log "clean track verify"
bash "$ROOT/scripts/validate-disposable-database.sh" verify

log "clean track integration"
bash "$ROOT/scripts/validate-disposable-database.sh" integration

log "preparing legacy database"
psql -v ON_ERROR_STOP=1 \
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
