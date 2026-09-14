#!/usr/bin/env bash
# CI-only disposable PostgreSQL validation for clean and legacy tracks.
# Uses the workflow postgres:16 service (host psql); never touches hosted Supabase.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LEGACY_URL="postgresql://postgres:postgres@localhost:5432/postgres_legacy"
PG_IMAGE="${DISPOSABLE_CI_POSTGRES_IMAGE:-postgres:16}"

export DISPOSABLE_TEST_ACK=yes
export DISPOSABLE_VALIDATION_TRACK=clean

echo "==> [ci-disposable] waiting for ${PG_IMAGE} postgres service"
psql -v ON_ERROR_STOP=1 -c 'select 1 as disposable_postgres_ready'

echo "==> [ci-disposable] clean track bootstrap"
bash "$ROOT/scripts/validate-disposable-database.sh" bootstrap

echo "==> [ci-disposable] clean track verify"
shopt -s nullglob
for verify in "$ROOT"/supabase/verify/*.sql; do
  echo "==> [ci-disposable] verify $(basename "$verify")"
  bash "$ROOT/scripts/validate-disposable-database.sh" verify-file "$verify"
done

echo "==> [ci-disposable] clean track integration"
bash "$ROOT/scripts/validate-disposable-database.sh" integration

echo "==> [ci-disposable] preparing legacy database on ${PG_IMAGE}"
psql -v ON_ERROR_STOP=1 -c "select pg_terminate_backend(pid) from pg_stat_activity where datname = 'postgres_legacy' and pid <> pg_backend_pid()" || true
psql -v ON_ERROR_STOP=1 -c 'drop database if exists postgres_legacy'
psql -v ON_ERROR_STOP=1 -c 'create database postgres_legacy'

export DISPOSABLE_VALIDATION_TRACK=legacy
export DISPOSABLE_DATABASE_URL="$LEGACY_URL"
echo "==> [ci-disposable] legacy track validation"
bash "$ROOT/scripts/validate-disposable-database.sh" all

echo "==> [ci-disposable] clean and legacy disposable validation passed"
