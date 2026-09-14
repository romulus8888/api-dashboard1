#!/usr/bin/env bash
# Two-connection disposable integration: reset_demo_data xact advisory lock.
set -euo pipefail

OPERATOR_ID="11111111-1111-4111-8111-111111111111"
RESET_COORD_LOCK=999999001
FIFO_READY="$(mktemp -u)"
FIFO_PROCEED="$(mktemp -u)"
mkfifo "$FIFO_READY" "$FIFO_PROCEED"

cleanup() {
  echo proceed >"$FIFO_PROCEED" 2>/dev/null || true
  rm -f "$FIFO_READY" "$FIFO_PROCEED"
}
trap cleanup EXIT

psql -v ON_ERROR_STOP=1 <<SQL
insert into auth.users (id, email)
values ('$OPERATOR_ID', 'integration-reset@example.com')
on conflict (id) do nothing;

insert into public.operator_profiles (id, display_name, is_active)
values ('$OPERATOR_ID', 'Integration Reset Operator', true)
on conflict (id) do update set is_active = excluded.is_active;
SQL

psql -v ON_ERROR_STOP=1 <<SQL &
begin;
select public.reset_demo_data('$OPERATOR_ID'::uuid);
\echo integration: connection A reset complete, holding open transaction
\! echo ready > '$FIFO_READY'
\! read _ < '$FIFO_PROCEED'
commit;
\echo integration: connection A committed
SQL
CONN_A_PID=$!

read -r _ <"$FIFO_READY"
echo "integration: connection A holds reset xact lock"

set +e
CONN_B_OUTPUT="$(
  psql -v ON_ERROR_STOP=1 -tAc "select public.reset_demo_data('$OPERATOR_ID'::uuid)" 2>&1
)"
CONN_B_STATUS=$?
set -e

if [[ $CONN_B_STATUS -eq 0 ]]; then
  echo "connection B reset must fail while connection A transaction is open" >&2
  exit 1
fi

if [[ "$CONN_B_OUTPUT" != *"another reset is already in progress"* ]]; then
  echo "unexpected connection B error while A holds lock: $CONN_B_OUTPUT" >&2
  exit 1
fi

echo proceed >"$FIFO_PROCEED"
wait "$CONN_A_PID"

psql -v ON_ERROR_STOP=1 -tAc "select public.reset_demo_data('$OPERATOR_ID'::uuid)" >/dev/null

echo "OK: phase9 reset xact lock integration"
