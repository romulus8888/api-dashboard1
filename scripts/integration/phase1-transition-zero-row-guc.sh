#!/usr/bin/env bash
# Two-connection disposable integration: zero-row disappearance restores attribution GUCs.
set -euo pipefail

INTEGRATION_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$INTEGRATION_DIR/../disposable-database-safety.sh"
require_disposable_database_target

PRIMARY_OPERATOR_ID="22222222-2222-4222-8222-222222222222"
SECOND_OPERATOR_ID="33333333-3333-4333-8333-333333333333"
LEAD_ID="44444444-4444-4444-8444-444444444444"

cleanup_objects() {
  disposable_psql <<SQL || true
drop table if exists public.integration_coord;
delete from public.leads where id = '$LEAD_ID';
delete from public.operator_profiles where id in ('$PRIMARY_OPERATOR_ID', '$SECOND_OPERATOR_ID');
delete from auth.users where id in ('$PRIMARY_OPERATOR_ID', '$SECOND_OPERATOR_ID');
SQL
}
trap cleanup_objects EXIT

disposable_psql <<SQL
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

wait_for_conn_a_delete_held() {
  local case_label="$1"
  disposable_psql <<SQL
do \$wait_for_conn_a_delete_held\$
declare
  i integer;
begin
  for i in 1..600 loop
    if exists (
      select 1
      from pg_catalog.pg_stat_activity a
      join pg_catalog.pg_locks l on l.pid = a.pid
      join pg_catalog.pg_class c on c.oid = l.relation
      where a.application_name = 'integration_conn_a'
        and l.granted
        and c.relname = 'leads'
        and l.mode = 'RowExclusiveLock'
    ) then
      return;
    end if;

    if i > 100 and not exists (
      select 1
      from pg_catalog.pg_stat_activity
      where application_name = 'integration_conn_a'
    ) then
      raise exception 'connection A is not active';
    end if;

    perform pg_sleep(0.01);
  end loop;
  raise exception 'timed out waiting for connection A to hold uncommitted delete (%s)', '$case_label';
end;
\$wait_for_conn_a_delete_held\$;
SQL
}

wait_for_conn_b_blocked_on_update() {
  local case_label="$1"
  disposable_psql <<SQL
do \$wait_for_conn_b_blocked_on_update\$
declare
  i integer;
begin
  for i in 1..600 loop
    if exists (
      select 1
      from pg_catalog.pg_stat_activity a
      join pg_catalog.pg_locks l on l.pid = a.pid
      join pg_catalog.pg_class c on c.oid = l.relation
      where a.application_name = 'integration_conn_b'
        and not l.granted
        and c.relname = 'leads'
    ) then
      return;
    end if;

    if exists (
      select 1
      from pg_catalog.pg_stat_activity a
      where a.application_name = 'integration_conn_b'
        and a.wait_event_type = 'Lock'
    ) then
      return;
    end if;

    if i > 100 and not exists (
      select 1
      from pg_catalog.pg_stat_activity
      where application_name = 'integration_conn_b'
    ) then
      raise exception 'connection B is not active';
    end if;

    perform pg_sleep(0.01);
  end loop;
  raise exception 'timed out waiting for connection B to block on lead update (%s)', '$case_label';
end;
\$wait_for_conn_b_blocked_on_update\$;
SQL
}

run_disappearance_case() {
  local case_label="$1"
  local prior_source="$2"
  local prior_changed_by="$3"
  local prior_reason="$4"
  local conn_a_log conn_b_log
  conn_a_log="$(mktemp)"
  conn_b_log="$(mktemp)"

  disposable_psql -c "truncate public.integration_coord;"

  disposable_psql <<SQL
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

  disposable_psql >"$conn_a_log" 2>&1 <<SQL &
begin;
select pg_catalog.set_config('application_name', 'integration_conn_a', false);
delete from public.leads where id = '$LEAD_ID';
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
  local conn_a_pid=$!

  if ! wait_for_conn_a_delete_held "$case_label"; then
    kill "$conn_a_pid" 2>/dev/null || true
    wait "$conn_a_pid" 2>/dev/null || true
    cat "$conn_a_log" >&2
    rm -f "$conn_a_log" "$conn_b_log"
    return 1
  fi

  echo "integration: connection A holds uncommitted delete ($case_label)"

  disposable_psql >"$conn_b_log" 2>&1 <<SQL &
begin;
select pg_catalog.set_config('application_name', 'integration_conn_b', false);
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
  local conn_b_pid=$!
  sleep 0.05

  if ! wait_for_conn_b_blocked_on_update "$case_label"; then
    kill "$conn_a_pid" "$conn_b_pid" 2>/dev/null || true
    wait "$conn_a_pid" 2>/dev/null || true
    wait "$conn_b_pid" 2>/dev/null || true
    cat "$conn_a_log" "$conn_b_log" >&2
    rm -f "$conn_a_log" "$conn_b_log"
    return 1
  fi

  echo "integration: connection B blocked on lead update ($case_label)"
  disposable_psql -c "delete from public.integration_coord where k = 'proceed'; insert into public.integration_coord (k, v) values ('proceed', 'yes');"

  wait "$conn_a_pid"
  local conn_a_status=$?
  wait "$conn_b_pid"
  local conn_b_status=$?

  if [[ $conn_a_status -ne 0 ]]; then
    cat "$conn_a_log" >&2
    echo "connection A failed ($case_label)" >&2
    rm -f "$conn_a_log" "$conn_b_log"
    return 1
  fi

  if [[ $conn_b_status -ne 0 ]]; then
    cat "$conn_b_log" >&2
    echo "connection B failed ($case_label)" >&2
    rm -f "$conn_a_log" "$conn_b_log"
    return 1
  fi

  if grep -E 'ERROR:|FATAL:' "$conn_a_log" "$conn_b_log" >/dev/null; then
    cat "$conn_a_log" "$conn_b_log" >&2
    echo "integration reported SQL errors ($case_label)" >&2
    rm -f "$conn_a_log" "$conn_b_log"
    return 1
  fi

  rm -f "$conn_a_log" "$conn_b_log"
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
