#!/usr/bin/env bash
# Two-connection disposable integration: zero-row disappearance restores attribution GUCs.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SQL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/sql" && pwd)"
PRIMARY_OPERATOR_ID="22222222-2222-4222-8222-222222222222"
SECOND_OPERATOR_ID="33333333-3333-4333-8333-333333333333"
LEAD_ID="44444444-4444-4444-8444-444444444444"
UPDATE_COORD_LOCK=999999004

restore_transition_lead_status() {
  psql -v ON_ERROR_STOP=1 -f "$ROOT/supabase/migrations/20260911140000_atomic_lost_reason_in_transition.sql" >/dev/null
}

cleanup_objects() {
  restore_transition_lead_status || true
  psql -v ON_ERROR_STOP=1 <<SQL || true
drop table if exists public.integration_coord;
delete from public.leads where id = '$LEAD_ID';
delete from public.operator_profiles where id in ('$PRIMARY_OPERATOR_ID', '$SECOND_OPERATOR_ID');
delete from auth.users where id in ('$PRIMARY_OPERATOR_ID', '$SECOND_OPERATOR_ID');
SQL
}
trap cleanup_objects EXIT

psql -v ON_ERROR_STOP=1 <<SQL
create table if not exists public.integration_coord (
  k text primary key,
  v text not null
);
truncate public.integration_coord;

insert into auth.users (id, email)
values
  ('$PRIMARY_OPERATOR_ID', 'integration-primary@example.com'),
  ('$SECOND_OPERATOR_ID', 'integration-second@example.com')
on conflict (id) do nothing;

insert into public.operator_profiles (id, display_name, is_active)
values
  ('$PRIMARY_OPERATOR_ID', 'Integration Primary', true),
  ('$SECOND_OPERATOR_ID', 'Integration Second', true)
on conflict (id) do update set is_active = excluded.is_active;
SQL

psql -v ON_ERROR_STOP=1 -f "$SQL_DIR/transition_lead_status_with_pause.sql"

wait_for_hold_pause_lock() {
  local case_label="$1"
  psql -v ON_ERROR_STOP=1 <<SQL
do \$wait_for_hold_pause_lock\$
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
        and a.application_name = 'integration_conn_hold'
        and l.classid = 0
        and l.objid = $UPDATE_COORD_LOCK
    ) then
      return;
    end if;

    if not exists (
      select 1
      from pg_catalog.pg_stat_activity
      where application_name = 'integration_conn_hold'
    ) then
      raise exception 'hold connection is not active';
    end if;

    perform pg_sleep(0.01);
  end loop;
  raise exception 'timed out waiting for hold pause lock (%s)', '$case_label';
end;
\$wait_for_hold_pause_lock\$;
SQL
}

wait_for_conn_a_blocked() {
  local case_label="$1"
  psql -v ON_ERROR_STOP=1 <<SQL
do \$wait_for_conn_a_blocked\$
declare
  i integer;
begin
  for i in 1..600 loop
    if exists (
      select 1
      from pg_catalog.pg_locks l
      join pg_catalog.pg_stat_activity a on a.pid = l.pid
      where l.locktype = 'advisory'
        and not l.granted
        and a.application_name = 'integration_conn_a'
        and l.classid = 0
        and l.objid = $UPDATE_COORD_LOCK
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
  raise exception 'timed out waiting for connection A to block on update pause (%s)', '$case_label';
end;
\$wait_for_conn_a_blocked\$;
SQL
}

run_disappearance_case() {
  local case_label="$1"
  local prior_source="$2"
  local prior_changed_by="$3"
  local prior_reason="$4"
  local conn_a_log conn_hold_log
  conn_a_log="$(mktemp)"
  conn_hold_log="$(mktemp)"

  psql -v ON_ERROR_STOP=1 -c "truncate public.integration_coord;"

  psql -v ON_ERROR_STOP=1 <<SQL
insert into public.leads (
  id, source, contact_name, contact_email, title, description, status
)
values (
  '$LEAD_ID',
  'demo_seed',
  'Zero Row GUC',
  'zero-row-guc@example.com',
  'Concurrent disappearance',
  'Disposable integration fixture',
  'new'
)
on conflict (id) do update
set status = excluded.status;
SQL

  psql -v ON_ERROR_STOP=1 >"$conn_hold_log" 2>&1 <<SQL &
select pg_catalog.set_config('application_name', 'integration_conn_hold', false);
select pg_catalog.pg_advisory_lock($UPDATE_COORD_LOCK);
do \$wait_for_hold_proceed\$
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
  raise exception 'timed out waiting for hold proceed signal';
end;
\$wait_for_hold_proceed\$;
delete from public.leads where id = '$LEAD_ID';
select pg_catalog.pg_advisory_unlock($UPDATE_COORD_LOCK);
SQL
  local conn_hold_pid=$!

  if ! wait_for_hold_pause_lock "$case_label"; then
    kill "$conn_hold_pid" 2>/dev/null || true
    wait "$conn_hold_pid" 2>/dev/null || true
    cat "$conn_hold_log" >&2
    rm -f "$conn_hold_log" "$conn_a_log"
    return 1
  fi

  echo "integration: hold connection blocks update pause ($case_label)"

  psql -v ON_ERROR_STOP=1 >"$conn_a_log" 2>&1 <<SQL &
begin;
select pg_catalog.set_config('application_name', 'integration_conn_a', false);
select pg_catalog.set_config('lead.status_change_source', '$prior_source', true);
select pg_catalog.set_config('lead.status_changed_by', '$prior_changed_by', true);
select pg_catalog.set_config('lead.status_change_reason', '$prior_reason', true);
do \$verify_case\$
declare
  v_caught boolean := false;
begin
  begin
    perform public.transition_lead_status(
      '$LEAD_ID'::uuid,
      'in_progress'::public.lead_status,
      'rpc',
      null,
      'concurrent disappearance'
    );
    raise exception 'expected disappearance failure';
  exception
    when others then
      if position('disappeared during update' in sqlerrm) = 0 then
        raise;
      end if;
      v_caught := true;
  end;

  if not v_caught then
    raise exception 'disappearance path must be exercised';
  end if;

  if coalesce(pg_catalog.current_setting('lead.status_change_source', true), ''::text)
     is distinct from '$prior_source'::text then
    raise exception 'source GUC not restored after disappearance';
  end if;

  if coalesce(pg_catalog.current_setting('lead.status_changed_by', true), ''::text)
     is distinct from '$prior_changed_by'::text then
    raise exception 'changed_by GUC not restored after disappearance';
  end if;

  if coalesce(pg_catalog.current_setting('lead.status_change_reason', true), ''::text)
     is distinct from '$prior_reason'::text then
    raise exception 'reason GUC not restored after disappearance';
  end if;
end;
\$verify_case\$;
rollback;
SQL
  local conn_a_pid=$!

  if ! wait_for_conn_a_blocked "$case_label"; then
    kill "$conn_a_pid" "$conn_hold_pid" 2>/dev/null || true
    wait "$conn_a_pid" 2>/dev/null || true
    wait "$conn_hold_pid" 2>/dev/null || true
    cat "$conn_hold_log" "$conn_a_log" >&2
    rm -f "$conn_hold_log" "$conn_a_log"
    return 1
  fi

  echo "integration: connection A blocked on update pause ($case_label)"
  psql -v ON_ERROR_STOP=1 -c "insert into public.integration_coord (k, v) values ('proceed', 'yes') on conflict (k) do update set v = excluded.v;"

  wait "$conn_hold_pid"
  local conn_hold_status=$?
  wait "$conn_a_pid"
  local conn_a_status=$?

  if [[ $conn_hold_status -ne 0 ]]; then
    cat "$conn_hold_log" >&2
    echo "hold connection failed ($case_label)" >&2
    rm -f "$conn_hold_log" "$conn_a_log"
    return 1
  fi

  if [[ $conn_a_status -ne 0 ]]; then
    cat "$conn_a_log" >&2
    echo "connection A failed ($case_label)" >&2
    rm -f "$conn_hold_log" "$conn_a_log"
    return 1
  fi

  if grep -E 'ERROR:|FATAL:' "$conn_hold_log" "$conn_a_log" >/dev/null; then
    cat "$conn_hold_log" "$conn_a_log" >&2
    echo "integration reported SQL errors ($case_label)" >&2
    rm -f "$conn_hold_log" "$conn_a_log"
    return 1
  fi

  rm -f "$conn_hold_log" "$conn_a_log"
}

run_disappearance_case \
  "non-empty prior context" \
  "prior-context" \
  "$SECOND_OPERATOR_ID" \
  "prior-reason"

run_disappearance_case \
  "empty prior context" \
  "" \
  "" \
  ""

echo "OK: phase1 transition zero-row GUC integration"
