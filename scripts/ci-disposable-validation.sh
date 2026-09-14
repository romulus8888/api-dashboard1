#!/usr/bin/env bash
# CI-only disposable PostgreSQL validation for clean and legacy tracks.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTAINER_NAME="${DISPOSABLE_CI_CONTAINER_NAME:-disposable-postgres}"
PG_IMAGE="${DISPOSABLE_CI_POSTGRES_IMAGE:-postgres:16}"
PG_PASSWORD="${DISPOSABLE_CI_POSTGRES_PASSWORD:-postgres}"
BASE_URL="postgresql://postgres:${PG_PASSWORD}@localhost/postgres"
LEGACY_URL="postgresql://postgres:${PG_PASSWORD}@localhost/postgres_legacy"

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
  if [[ -n "${GITHUB_ACTIONS:-}" ]]; then
    echo "::error::$*" >&2
  fi
  docker logs "$CONTAINER_NAME" 2>&1 | tail -80 >&2 || true
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

apply_sql_in_container() {
  local database="$1"
  local label="$2"
  local file="$3"
  local rel="${file#"$ROOT"/}"
  log "${label}: $(basename "$file")"
  local log_output
  log_output="$(mktemp)"
  if ! docker exec -i "$CONTAINER_NAME" psql -U postgres -d "$database" -v ON_ERROR_STOP=1 \
    -f "/workspace/$rel" >"$log_output" 2>&1; then
    cat "$log_output" >&2
    if [[ -n "${GITHUB_ACTIONS:-}" ]]; then
      grep -E 'ERROR:|FATAL:|exception' "$log_output" | head -10 | while IFS= read -r line; do
        echo "::error::$line" >&2
      done || true
    fi
    fail 11 "SQL failed for ${label}: $(basename "$file")"
  fi
  rm -f "$log_output"
}

apply_clean_bootstrap() {
  apply_sql_in_container postgres fixture "$ROOT/supabase/fixtures/disposable-test-prerequisites.sql"
  shopt -s nullglob
  local migration
  for migration in "$ROOT"/supabase/migrations/*.sql; do
    apply_sql_in_container postgres migration "$migration"
  done
}

apply_legacy_bootstrap() {
  apply_sql_in_container postgres_legacy fixture "$ROOT/supabase/fixtures/disposable-test-prerequisites.sql"
  apply_sql_in_container postgres_legacy legacy-fixture "$ROOT/supabase/legacy/fixtures/legacy-jobs-stub.sql"
  apply_sql_in_container postgres_legacy legacy-migration \
    "$ROOT/supabase/legacy/migrations/20260814000000_create_job_processing_audit.sql"
  shopt -s nullglob
  local migration
  for migration in "$ROOT"/supabase/migrations/*.sql; do
    apply_sql_in_container postgres_legacy migration "$migration"
  done
  apply_sql_in_container postgres_legacy legacy-migration \
    "$ROOT/supabase/legacy/migrations/20260910180000_lockdown_legacy_jobs.sql"
}

trap cleanup_container EXIT
cleanup_container

log "starting ${PG_IMAGE} with workspace mount"
docker run -d --name "$CONTAINER_NAME" \
  -e POSTGRES_PASSWORD="$PG_PASSWORD" \
  -v "${ROOT}:/workspace:ro" \
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
export DISPOSABLE_PSQL_MODE=docker-exec
export DISPOSABLE_CI_CONTAINER_NAME="$CONTAINER_NAME"
export DISPOSABLE_CI_HOST_WORKSPACE_ROOT="$ROOT"

export DISPOSABLE_VALIDATION_TRACK=clean
log "clean track bootstrap"
apply_clean_bootstrap

log "clean track schema probe"
docker exec -i "$CONTAINER_NAME" psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
  -c "select to_regclass('public.jobs') as jobs, to_regclass('public.job_processing_audit') as job_audit"

log "clean track clean-install guard"
apply_sql_in_container postgres verify "$ROOT/supabase/verify/phase11_clean_install.sql"

log "clean track verify"
shopt -s nullglob
for verify in "$ROOT"/supabase/verify/*.sql; do
  if [[ "$(basename "$verify")" == "phase11_clean_install.sql" ]]; then
    continue
  fi
  apply_sql_in_container postgres verify "$verify"
done

if ! command -v psql >/dev/null 2>&1; then
  if command -v apt-get >/dev/null 2>&1; then
    apt-get update && apt-get install -y postgresql-client
  else
    fail 12 "psql is required for integration tests"
  fi
fi

export PGSSLMODE=disable
(
  unset DISPOSABLE_PSQL_MODE
  run_validate "clean track integration" 12 integration
)

log "preparing legacy database"
docker exec -i "$CONTAINER_NAME" psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
  -c "select pg_terminate_backend(pid) from pg_stat_activity where datname = 'postgres_legacy' and pid <> pg_backend_pid()" || true
docker exec -i "$CONTAINER_NAME" psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
  -c 'drop database if exists postgres_legacy'
docker exec -i "$CONTAINER_NAME" psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
  -c 'create database postgres_legacy template template0'

export DISPOSABLE_VALIDATION_TRACK=legacy
export DISPOSABLE_DATABASE_URL="$LEGACY_URL"

log "legacy track bootstrap"
apply_legacy_bootstrap

log "legacy track verify"
for verify in "$ROOT"/supabase/verify/*.sql; do
  if [[ "$(basename "$verify")" == "phase11_clean_install.sql" ]]; then
    log "verify: skipping $(basename "$verify") (clean-install guard only)"
    continue
  fi
  apply_sql_in_container postgres_legacy verify "$verify"
done
for verify in "$ROOT"/supabase/legacy/verify/*.sql; do
  apply_sql_in_container postgres_legacy legacy-verify "$verify"
done

log "clean and legacy disposable validation passed"
