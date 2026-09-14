#!/usr/bin/env bash
# CI-only disposable PostgreSQL validation for clean and legacy tracks.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTAINER_NAME="${DISPOSABLE_CI_CONTAINER_NAME:-disposable-postgres}"
PG_IMAGE="${DISPOSABLE_CI_POSTGRES_IMAGE:-postgres:16}"
PG_PASSWORD="${DISPOSABLE_CI_POSTGRES_PASSWORD:-postgres}"
PG_PORT="${DISPOSABLE_CI_POSTGRES_PORT:-5432}"
BASE_URL="postgresql://postgres:${PG_PASSWORD}@127.0.0.1:${PG_PORT}/postgres"
LEGACY_URL="postgresql://postgres:${PG_PASSWORD}@127.0.0.1:${PG_PORT}/postgres_legacy"

cleanup_container() {
  docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
}

log() {
  echo "==> [ci-disposable] $*"
}

fail() {
  echo "FAILED [ci-disposable] $*" >&2
  docker logs "$CONTAINER_NAME" 2>&1 | tail -50 >&2 || true
  exit 2
}

trap cleanup_container EXIT
cleanup_container

log "starting ${PG_IMAGE} on port ${PG_PORT}"
docker run -d --name "$CONTAINER_NAME" \
  -e POSTGRES_PASSWORD="$PG_PASSWORD" \
  -p "${PG_PORT}:5432" \
  "$PG_IMAGE" >/dev/null

attempts=60
while [ "$attempts" -gt 0 ]; do
  if docker exec "$CONTAINER_NAME" pg_isready -U postgres -d postgres >/dev/null 2>&1; then
    break
  fi
  attempts=$((attempts - 1))
  sleep 1
done

if [ "$attempts" -eq 0 ]; then
  fail "postgres container did not become ready"
fi

export DISPOSABLE_TEST_ACK=yes
export DISPOSABLE_DATABASE_URL="$BASE_URL"
export PGHOST=127.0.0.1
export PGPORT="$PG_PORT"
export PGUSER=postgres
export PGPASSWORD="$PG_PASSWORD"
export PGDATABASE=postgres
export PGSSLMODE=disable

log "clean track bootstrap"
export DISPOSABLE_VALIDATION_TRACK=clean
bash "$ROOT/scripts/validate-disposable-database.sh" bootstrap

log "clean track verify"
shopt -s nullglob
for verify in "$ROOT"/supabase/verify/*.sql; do
  bash "$ROOT/scripts/validate-disposable-database.sh" verify-file "$verify"
done

log "clean track integration"
bash "$ROOT/scripts/validate-disposable-database.sh" integration

log "preparing legacy database"
psql -v ON_ERROR_STOP=1 -c "select pg_terminate_backend(pid) from pg_stat_activity where datname = 'postgres_legacy' and pid <> pg_backend_pid()" || true
psql -v ON_ERROR_STOP=1 -c 'drop database if exists postgres_legacy'
psql -v ON_ERROR_STOP=1 -c 'create database postgres_legacy'

log "legacy track validation"
export DISPOSABLE_VALIDATION_TRACK=legacy
export DISPOSABLE_DATABASE_URL="$LEGACY_URL"
bash "$ROOT/scripts/validate-disposable-database.sh" all

log "clean and legacy disposable validation passed"
