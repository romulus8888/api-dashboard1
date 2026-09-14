#!/usr/bin/env bash
# Two-connection disposable integration: zero-row disappearance restores attribution GUCs.
set -euo pipefail

PRIMARY_OPERATOR_ID="22222222-2222-4222-8222-222222222222"
SECOND_OPERATOR_ID="33333333-3333-4333-8333-333333333333"
LEAD_ID="44444444-4444-4444-8444-444444444444"
LOCK_WAIT_ATTEMPTS=10000

cleanup_objects() {
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
);
SQL

wait_for_transition_lock() {
  local case_label="$1"
  local conn_a_pid="$2"
  local conn_a_log="$3"
  local attempts=0

  while (( attempts < LOCK_WAIT_ATTEMPTS )); do
    if psql -tAc "
      select exists (
        select 1
        from pg_catalog.pg_stat_activity
        where wait_event_type = 'Lock'
          and (
            application_name = 'integration_conn_a'
            or query like '%transition_lead_status%'
          )
      );
    " | grep -qx t; then
      return 0
    fi

    if ! kill -0 "$conn_a_pid" 2>/dev/null; then
      cat "$conn_a_log" >&2
      echo "connection A exited before waiting on row lock ($case_label)" >&2
      return 1
    fi

    attempts=$((attempts + 1))
  done

  cat "$conn_a_log" >&2
  echo "timed out waiting for connection A row lock ($case_label)" >&2
  return 1
}

run_disappearance_case() {
  local case_label="$1"
  local prior_source="$2"
  local prior_changed_by="$3"
  local prior_reason="$4"
  local conn_a_log
  local fifo_delete_held fifo_delete_release fifo_conn_a_prepared
  conn_a_log="$(mktemp)"
  fifo_delete_held="$(mktemp -u)"
  fifo_delete_release="$(mktemp -u)"
  fifo_conn_a_prepared="$(mktemp -u)"
  mkfifo "$fifo_delete_held" "$fifo_delete_release" "$fifo_conn_a_prepared"

  psql -v ON_ERROR_STOP=1 <<SQL &
begin;
set local application_name = 'integration_conn_b';
delete from public.leads where id = '$LEAD_ID';
\echo integration: connection B holds uncommitted delete
\! echo held > '$fifo_delete_held'
\! read _ < '$fifo_delete_release'
commit;
\echo integration: connection B committed delete
SQL
  local conn_b_pid=$!

  read -r _ <"$fifo_delete_held"
  echo "integration: connection B blocks lead row ($case_label)"

  psql -v ON_ERROR_STOP=1 <<SQL >"$conn_a_log" 2>&1 &
begin;
set local application_name = 'integration_conn_a';
select pg_catalog.set_config('lead.status_change_source', '$prior_source', true);
select pg_catalog.set_config('lead.status_changed_by', '$prior_changed_by', true);
select pg_catalog.set_config('lead.status_change_reason', '$prior_reason', true);
\! echo prepared > '$fifo_conn_a_prepared'

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

  read -r _ <"$fifo_conn_a_prepared"

  if ! wait_for_transition_lock "$case_label" "$conn_a_pid" "$conn_a_log"; then
    echo release >"$fifo_delete_release"
    wait "$conn_b_pid" || true
    kill "$conn_a_pid" 2>/dev/null || true
    wait "$conn_a_pid" 2>/dev/null || true
    rm -f "$conn_a_log" "$fifo_delete_held" "$fifo_delete_release" "$fifo_conn_a_prepared"
    return 1
  fi

  echo "integration: connection A blocked on row lock ($case_label)"
  echo release >"$fifo_delete_release"
  wait "$conn_b_pid"
  wait "$conn_a_pid"
  local conn_a_status=$?

  if [[ $conn_a_status -ne 0 ]]; then
    cat "$conn_a_log" >&2
    echo "connection A failed ($case_label)" >&2
    rm -f "$conn_a_log" "$fifo_delete_held" "$fifo_delete_release" "$fifo_conn_a_prepared"
    return 1
  fi

  if grep -E 'ERROR:|FATAL:' "$conn_a_log" >/dev/null; then
    cat "$conn_a_log" >&2
    echo "connection A reported SQL errors ($case_label)" >&2
    rm -f "$conn_a_log" "$fifo_delete_held" "$fifo_delete_release" "$fifo_conn_a_prepared"
    return 1
  fi

  rm -f "$conn_a_log" "$fifo_delete_held" "$fifo_delete_release" "$fifo_conn_a_prepared"

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
);
SQL
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
