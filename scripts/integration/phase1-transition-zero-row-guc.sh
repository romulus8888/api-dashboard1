#!/usr/bin/env bash
# Two-connection disposable integration: zero-row disappearance restores attribution GUCs.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
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

create or replace function public.transition_lead_status(
  p_lead_id uuid,
  p_to_status public.lead_status,
  p_change_source text,
  p_changed_by uuid default null,
  p_reason text default null
)
returns public.leads
language plpgsql
security invoker
set search_path = pg_catalog, pg_temp
as \$integration_transition_lead_status\$
declare
  v_lead public.leads;
  v_prev_source text;
  v_prev_changed_by text;
  v_prev_reason text;
begin
  if p_lead_id is null then
    raise exception 'transition_lead_status: p_lead_id is required';
  end if;

  if p_change_source is null or length(btrim(p_change_source)) = 0 then
    raise exception 'transition_lead_status: p_change_source must be a non-empty string';
  end if;

  perform public.validate_lead_status_actor(p_changed_by);

  select *
    into v_lead
  from public.leads
  where id = p_lead_id;

  if not found then
    raise exception 'transition_lead_status: lead % not found', p_lead_id;
  end if;

  if v_lead.status is not distinct from p_to_status then
    return v_lead;
  end if;

  v_prev_source := pg_catalog.current_setting('lead.status_change_source', true);
  v_prev_changed_by := pg_catalog.current_setting('lead.status_changed_by', true);
  v_prev_reason := pg_catalog.current_setting('lead.status_change_reason', true);

  begin
    perform pg_catalog.set_config('lead.status_change_source', btrim(p_change_source), true);
    perform pg_catalog.set_config('lead.status_changed_by', coalesce(p_changed_by::text, ''::text), true);
    perform pg_catalog.set_config('lead.status_change_reason', coalesce(p_reason, ''::text), true);

    perform pg_catalog.pg_advisory_lock($UPDATE_COORD_LOCK);

    update public.leads
    set
      status = p_to_status,
      loss_reason = case
        when p_to_status = 'lost'::public.lead_status
          then nullif(btrim(coalesce(p_reason, ''::text)), ''::text)
        else loss_reason
      end
    where id = p_lead_id
    returning * into v_lead;

    if not found then
      raise exception 'transition_lead_status: lead % disappeared during update', p_lead_id;
    end if;

    perform pg_catalog.set_config('lead.status_change_source', coalesce(v_prev_source, ''::text), true);
    perform pg_catalog.set_config('lead.status_changed_by', coalesce(v_prev_changed_by, ''::text), true);
    perform pg_catalog.set_config('lead.status_change_reason', coalesce(v_prev_reason, ''::text), true);

    return v_lead;
  exception
    when others then
      perform pg_catalog.set_config('lead.status_change_source', coalesce(v_prev_source, ''::text), true);
      perform pg_catalog.set_config('lead.status_changed_by', coalesce(v_prev_changed_by, ''::text), true);
      perform pg_catalog.set_config('lead.status_change_reason', coalesce(v_prev_reason, ''::text), true);
      raise;
  end;
end;
\$integration_transition_lead_status\$;
SQL

wait_for_update_pause() {
  local case_label="$1"
  if ! psql -v ON_ERROR_STOP=1 <<SQL
do \$wait_for_update_pause\$
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
        and a.application_name = 'integration_conn_a'
    ) then
      return;
    end if;

    if not exists (
      select 1
      from pg_catalog.pg_stat_activity
      where application_name = 'integration_conn_a'
    ) then
      raise exception 'connection A is not active';
    end if;

    perform pg_sleep(0.01);
  end loop;
  raise exception 'timed out waiting for transition update pause';
end;
\$wait_for_update_pause\$;
SQL
  then
    echo "timed out waiting for transition update pause ($case_label)" >&2
    return 1
  fi
}

run_disappearance_case() {
  local case_label="$1"
  local prior_source="$2"
  local prior_changed_by="$3"
  local prior_reason="$4"
  local conn_a_log
  conn_a_log="$(mktemp)"

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
    cat "$conn_a_log" >&2
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
