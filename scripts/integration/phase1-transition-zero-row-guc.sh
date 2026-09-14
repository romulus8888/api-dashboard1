#!/usr/bin/env bash
# Two-connection disposable integration: zero-row disappearance restores attribution GUCs.
set -euo pipefail

PRIMARY_OPERATOR_ID="22222222-2222-4222-8222-222222222222"
SECOND_OPERATOR_ID="33333333-3333-4333-8333-333333333333"
LEAD_ID="44444444-4444-4444-8444-444444444444"
UPDATE_COORD_LOCK=999999004

cleanup_objects() {
  psql -v ON_ERROR_STOP=1 <<SQL || true
drop trigger if exists verify_integration_pause_before_update on public.leads;
drop function if exists public.verify_integration_pause_before_update();
drop table if exists public.verify_integration_pause;
delete from public.leads where id = '$LEAD_ID';
delete from public.operator_profiles where id in ('$PRIMARY_OPERATOR_ID', '$SECOND_OPERATOR_ID');
delete from auth.users where id in ('$PRIMARY_OPERATOR_ID', '$SECOND_OPERATOR_ID');
SQL
}
trap cleanup_objects EXIT

psql -v ON_ERROR_STOP=1 <<SQL
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

create table if not exists public.verify_integration_pause (
  slot integer primary key
);

truncate table public.verify_integration_pause;

create or replace function public.verify_integration_pause_before_update()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as \$verify_integration_pause_before_update\$
begin
  insert into public.verify_integration_pause (slot) values (1);
  perform pg_catalog.pg_advisory_lock($UPDATE_COORD_LOCK);
  return new;
end;
\$verify_integration_pause_before_update\$;

drop trigger if exists verify_integration_pause_before_update on public.leads;
create trigger verify_integration_pause_before_update
  before update of status on public.leads
  for each row
  execute function public.verify_integration_pause_before_update();
SQL

wait_for_update_pause() {
  local case_label="$1"
  psql -v ON_ERROR_STOP=1 <<SQL || {
    echo "timed out waiting for transition update pause ($case_label)" >&2
    return 1
  }
do \$wait_for_update_pause\$
declare
  i integer;
begin
  for i in 1..300 loop
    if exists (select 1 from public.verify_integration_pause where slot = 1) then
      return;
    end if;
    perform pg_sleep(0.01);
  end loop;
  raise exception 'timed out waiting for transition update pause';
end;
\$wait_for_update_pause\$;
SQL
}

run_disappearance_case() {
  local case_label="$1"
  local prior_source="$2"
  local prior_changed_by="$3"
  local prior_reason="$4"
  local conn_a_log
  conn_a_log="$(mktemp)"

  psql -v ON_ERROR_STOP=1 <<SQL
truncate table public.verify_integration_pause;
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

  psql -v ON_ERROR_STOP=1 <<SQL >"$conn_a_log" 2>&1 &
begin;
set local application_name = 'integration_conn_a';
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

  if ! wait_for_update_pause "$case_label"; then
    kill "$conn_a_pid" 2>/dev/null || true
    wait "$conn_a_pid" 2>/dev/null || true
    rm -f "$conn_a_log"
    return 1
  fi

  echo "integration: transition reached update pause ($case_label)"

  psql -v ON_ERROR_STOP=1 <<SQL
begin;
set local application_name = 'integration_conn_b';
delete from public.leads where id = '$LEAD_ID';
commit;
SQL

  psql -v ON_ERROR_STOP=1 -c "select pg_catalog.pg_advisory_unlock($UPDATE_COORD_LOCK);" >/dev/null
  wait "$conn_a_pid"
  local conn_a_status=$?

  if [[ $conn_a_status -ne 0 ]]; then
    cat "$conn_a_log" >&2
    echo "connection A failed ($case_label)" >&2
    rm -f "$conn_a_log"
    return 1
  fi

  if grep -E 'ERROR:|FATAL:' "$conn_a_log" >/dev/null; then
    cat "$conn_a_log" >&2
    echo "connection A reported SQL errors ($case_label)" >&2
    rm -f "$conn_a_log"
    return 1
  fi

  rm -f "$conn_a_log"
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
