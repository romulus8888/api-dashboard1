#!/usr/bin/env bash
# CI-only disposable PostgreSQL validation for clean and legacy tracks.
# Starts an isolated postgres:16 container; never touches hosted Supabase.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTAINER_NAME="${DISPOSABLE_CI_CONTAINER_NAME:-disposable-postgres}"
PG_IMAGE="${DISPOSABLE_CI_POSTGRES_IMAGE:-postgres:16}"
PG_PASSWORD="${DISPOSABLE_CI_POSTGRES_PASSWORD:-postgres}"
BASE_URL="postgresql://postgres:${PG_PASSWORD}@postgres/postgres"
LEGACY_URL="postgresql://postgres:${PG_PASSWORD}@postgres/postgres_legacy"

cleanup_container() {
  docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
}

log() {
  echo "==> [ci-disposable] $*"
}

trap cleanup_container EXIT
cleanup_container

log "starting ${PG_IMAGE}"
docker run -d --name "$CONTAINER_NAME" \
  -e POSTGRES_PASSWORD="$PG_PASSWORD" \
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
  echo "postgres container did not become ready" >&2
  exit 2
fi

export DISPOSABLE_TEST_ACK=yes
export DISPOSABLE_PSQL_MODE=docker-exec
export DISPOSABLE_CI_CONTAINER_NAME="$CONTAINER_NAME"
unset DISPOSABLE_CI_HOST_WORKSPACE_ROOT

export DISPOSABLE_VALIDATION_TRACK=clean
export DISPOSABLE_DATABASE_URL="$BASE_URL"
log "clean track validation"
bash "$ROOT/scripts/validate-disposable-database.sh" all

log "preparing legacy database"
docker exec -i "$CONTAINER_NAME" psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
  -c "select pg_terminate_backend(pid) from pg_stat_activity where datname = 'postgres_legacy' and pid <> pg_backend_pid()" || true
docker exec -i "$CONTAINER_NAME" psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
  -c 'drop database if exists postgres_legacy'
docker exec -i "$CONTAINER_NAME" psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
  -c 'create database postgres_legacy'

export DISPOSABLE_VALIDATION_TRACK=legacy
export DISPOSABLE_DATABASE_URL="$LEGACY_URL"
log "legacy track validation"
bash "$ROOT/scripts/validate-disposable-database.sh" all

log "clean and legacy disposable validation passed"
