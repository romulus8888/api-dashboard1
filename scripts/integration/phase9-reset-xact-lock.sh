#!/usr/bin/env bash
# Two-connection disposable integration: reset_demo_data xact advisory lock.
set -euo pipefail

OPERATOR_ID="11111111-1111-4111-8111-111111111111"
RESET_XACT_LOCK=918273645

wait_for_reset_xact_lock() {
  psql -v ON_ERROR_STOP=1 <<SQL
do \$wait_for_reset_xact_lock\$
declare
  i integer;
begin
  for i in 1..600 loop
    if exists (
      select 1
      from pg_catalog.pg_locks l
      join pg_catalog.pg_stat_activity a on a.pid = l.pid
      where l.locktype = 'advisory'
        and l.granted
        and l.objsubid = 2
        and a.application_name = 'integration_conn_a'
        and l.classid = 0
        and l.objid = $RESET_XACT_LOCK
    ) then
      return;
    end if;

    if not exists (
      select 1
      from pg_catalog.pg_stat_activity
      where application_name = 'integration_conn_a'
        and state <> 'idle'
    ) then
      raise exception 'connection A is not active';
    end if;

    perform pg_sleep(0.01);
  end loop;
  raise exception 'timed out waiting for reset xact lock on connection A';
end;
\$wait_for_reset_xact_lock\$;
SQL
}

cleanup() {
  psql -v ON_ERROR_STOP=1 <<SQL || true
delete from public.operator_profiles where id = '$OPERATOR_ID';
delete from auth.users where id = '$OPERATOR_ID';
truncate public.integration_coord;
SQL
}
trap cleanup EXIT

psql -v ON_ERROR_STOP=1 <<SQL
create table if not exists public.integration_coord (
  k text primary key,
  v text not null
);
truncate public.integration_coord;

insert into auth.users (id, email)
values ('$OPERATOR_ID', 'integration-reset@example.com')
on conflict (id) do nothing;

insert into public.operator_profiles (id, display_name, is_active)
values ('$OPERATOR_ID', 'Integration Reset Operator', true)
on conflict (id) do update set is_active = excluded.is_active;
SQL

psql -v ON_ERROR_STOP=1 <<SQL &
begin;
select pg_catalog.set_config('application_name', 'integration_conn_a', false);
select public.reset_demo_data('$OPERATOR_ID'::uuid);
do \$wait_for_conn_a_proceed\$
declare
  i integer;
begin
  for i in 1..600 loop
    if exists (
      select 1
      from public.integration_coord
      where k = 'proceed'
        and v = 'yes'
    ) then
      return;
    end if;
    perform pg_sleep(0.01);
  end loop;
  raise exception 'timed out waiting for connection A proceed signal';
end;
\$wait_for_conn_a_proceed\$;
commit;
SQL
CONN_A_PID=$!

if ! wait_for_reset_xact_lock; then
  kill "$CONN_A_PID" 2>/dev/null || true
  wait "$CONN_A_PID" 2>/dev/null || true
  exit 1
fi

echo "integration: connection A reset complete, holding open transaction"

set +e
CONN_B_OUTPUT="$(
  psql -v ON_ERROR_STOP=1 -tAc "select public.reset_demo_data('$OPERATOR_ID'::uuid)" 2>&1
)"
CONN_B_STATUS=$?
set -e

if [[ $CONN_B_STATUS -eq 0 ]]; then
  echo "connection B reset must fail while connection A transaction is open" >&2
  kill "$CONN_A_PID" 2>/dev/null || true
  wait "$CONN_A_PID" 2>/dev/null || true
  exit 1
fi

if [[ "$CONN_B_OUTPUT" != *"another reset is already in progress"* ]]; then
  echo "unexpected connection B error while A holds lock: $CONN_B_OUTPUT" >&2
  kill "$CONN_A_PID" 2>/dev/null || true
  wait "$CONN_A_PID" 2>/dev/null || true
  exit 1
fi

psql -v ON_ERROR_STOP=1 -c "insert into public.integration_coord (k, v) values ('proceed', 'yes') on conflict (k) do update set v = excluded.v;"
wait "$CONN_A_PID"

psql -v ON_ERROR_STOP=1 -tAc "select public.reset_demo_data('$OPERATOR_ID'::uuid)" >/dev/null

echo "OK: phase9 reset xact lock integration"
