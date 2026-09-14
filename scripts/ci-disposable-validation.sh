#!/usr/bin/env bash
# CI-only disposable PostgreSQL validation for clean and legacy tracks.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTAINER_NAME="${DISPOSABLE_CI_CONTAINER_NAME:-disposable-postgres}"
PG_IMAGE="${DISPOSABLE_CI_POSTGRES_IMAGE:-postgres:16}"
PG_PASSWORD="${DISPOSABLE_CI_POSTGRES_PASSWORD:-postgres}"
PG_PORT="${DISPOSABLE_CI_POSTGRES_PORT:-5433}"
BASE_URL="postgresql://postgres:${PG_PASSWORD}@127.0.0.1:${PG_PORT}/postgres"
LEGACY_URL="postgresql://postgres:${PG_PASSWORD}@127.0.0.1:${PG_PORT}/postgres_legacy"

cleanup_container() {
  docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
}

log() {
  echo "==> [ci-disposable] $*"
}

fail() {
  local status="${1:-2}"
  shift || true
  echo "FAILED [ci-disposable] $*" >&2
  docker logs "$CONTAINER_NAME" 2>&1 | tail -50 >&2 || true
  exit "$status"
}

run_validate() {
  local label="$1"
  local status_code="$2"
  shift 2
  log "$label"
  local output
  output="$(mktemp)"
  if ! bash "$ROOT/scripts/validate-disposable-database.sh" "$@" >"$output" 2>&1; then
    cat "$output" >&2
    if [[ -n "${GITHUB_ACTIONS:-}" ]]; then
      echo "::error title=${label}::$(grep -E 'FAILED|ERROR|PostgreSQL|Refusing' "$output" | head -5 | tr '\n' ' ')" >&2
    fi
    rm -f "$output"
    fail "$status_code" "$label"
  fi
  rm -f "$output"
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
  fail 2 "postgres container did not become ready"
fi

export DISPOSABLE_TEST_ACK=yes
export DISPOSABLE_DATABASE_URL="$BASE_URL"
export PGHOST=127.0.0.1
export PGPORT="$PG_PORT"
export PGUSER=postgres
export PGPASSWORD="$PG_PASSWORD"
export PGDATABASE=postgres
export PGSSLMODE=disable

export DISPOSABLE_VALIDATION_TRACK=clean
run_validate "clean track bootstrap" 10 bootstrap

log "clean track verify"
shopt -s nullglob
for verify in "$ROOT"/supabase/verify/*.sql; do
  run_validate "clean track verify $(basename "$verify")" 11 verify-file "$verify"
done

run_validate "clean track integration" 12 integration

log "preparing legacy database"
psql -v ON_ERROR_STOP=1 -c "select pg_terminate_backend(pid) from pg_stat_activity where datname = 'postgres_legacy' and pid <> pg_backend_pid()" || true
psql -v ON_ERROR_STOP=1 -c 'drop database if exists postgres_legacy'
psql -v ON_ERROR_STOP=1 -c 'create database postgres_legacy'

export DISPOSABLE_VALIDATION_TRACK=legacy
export DISPOSABLE_DATABASE_URL="$LEGACY_URL"
run_validate "legacy track validation" 13 all

log "clean and legacy disposable validation passed"
