-- Phase 9 verification: reset_demo_data RPC (rollback-safe).
-- Prerequisites: disposable fixtures + migrations through 20260912140000_create_reset_demo_data_rpc.sql

begin;

do $$
declare
  v_operator_id uuid := '11111111-1111-4111-8111-111111111111';
  v_inactive_operator_id uuid := '22222222-2222-4222-8222-222222222222';
  v_non_synthetic_id uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  v_synthetic_lead_id uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  v_synthetic_history_id uuid;
  v_synthetic_comment_id uuid := 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  v_synthetic_audit_id uuid := 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  v_job_id uuid := 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  v_jobs_fixture boolean := false;
  v_result jsonb;
  v_group_id uuid;
  v_second_group_id uuid;
  v_deleted integer;
  v_inserted integer;
  v_synthetic_count integer;
  v_metrics jsonb;
  v_metrics_received bigint;
  v_expected_seed_count constant integer := 10;
begin
  raise notice '=== Phase 9 demo reset verification (transaction will roll back) ===';

  insert into auth.users (id, email)
  values
    (v_operator_id, 'phase9-operator@example.com'),
    (v_inactive_operator_id, 'phase9-inactive@example.com')
  on conflict (id) do nothing;

  insert into public.operator_profiles (id, display_name, is_active)
  values
    (v_operator_id, 'Phase 9 Operator', true),
    (v_inactive_operator_id, 'Inactive Operator', false)
  on conflict (id) do update set is_active = excluded.is_active;

  if to_regclass('public.jobs') is not null then
    insert into public.jobs (id)
    values (v_job_id)
    on conflict (id) do nothing;
    v_jobs_fixture := true;
  end if;

  insert into public.leads (
    id, source, contact_name, contact_email, title, description,
    is_synthetic, status
  )
  values (
    v_non_synthetic_id,
    'website', 'Retained Lead', 'retained@example.com', 'Production lead', 'Must survive reset',
    false, 'new'
  );

  insert into public.leads (
    id, source, contact_name, contact_email, title, description,
    is_synthetic, status, demo_reset_group_id
  )
  values (
    v_synthetic_lead_id,
    'demo_seed', 'Old Synthetic', 'old-synthetic@example.com', 'Old demo', 'Should be removed',
    true, 'new', '33333333-3333-4333-8333-333333333333'
  );

  select h.id
  into v_synthetic_history_id
  from public.lead_status_history h
  where h.lead_id = v_synthetic_lead_id
  order by h.created_at
  limit 1;

  if v_synthetic_history_id is null then
    raise exception 'fixture synthetic lead must have a status-history row before reset';
  end if;

  insert into public.lead_comments (id, lead_id, author_id, body)
  values (v_synthetic_comment_id, v_synthetic_lead_id, v_operator_id, 'Synthetic comment to cascade');

  insert into public.lead_processing_audit (
    id, lead_id, event_type, step, outcome, idempotency_key
  )
  values (
    v_synthetic_audit_id,
    v_synthetic_lead_id,
    'lead.created',
    'received',
    'succeeded',
    'phase9-fixture:old-synthetic:received'
  );

  insert into public.demo_rate_limit_buckets (bucket_key, window_start, request_count, expires_at)
  values ('phase9-verify-bucket', now(), 1, now() + interval '1 hour')
  on conflict (bucket_key) do update
  set request_count = public.demo_rate_limit_buckets.request_count + 1;

  if has_function_privilege('anon', 'public.reset_demo_data(uuid)', 'EXECUTE') then
    raise exception 'anon must not execute reset_demo_data';
  end if;

  if not has_function_privilege('service_role', 'public.reset_demo_data(uuid)', 'EXECUTE') then
    raise exception 'service_role must execute reset_demo_data';
  end if;

  begin
    perform public.reset_demo_data(v_inactive_operator_id);
    raise exception 'expected inactive operator rejection';
  exception
    when others then
      if position('not an active operator' in sqlerrm) = 0 then
        raise;
      end if;
  end;

  v_result := public.reset_demo_data(v_operator_id);
  v_group_id := (v_result ->> 'demo_reset_group_id')::uuid;
  v_deleted := (v_result ->> 'deleted_count')::integer;
  v_inserted := (v_result ->> 'inserted_count')::integer;

  if v_deleted < 1 then
    raise exception 'expected at least one synthetic lead deleted, got %', v_deleted;
  end if;

  if v_inserted is distinct from v_expected_seed_count then
    raise exception 'expected inserted_count=% , got %', v_expected_seed_count, v_inserted;
  end if;

  if exists (select 1 from public.leads where id = v_synthetic_lead_id) then
    raise exception 'fixture synthetic lead % must be deleted by reset', v_synthetic_lead_id;
  end if;

  if exists (select 1 from public.lead_status_history where id = v_synthetic_history_id) then
    raise exception 'fixture synthetic history % must cascade on reset', v_synthetic_history_id;
  end if;

  if exists (select 1 from public.lead_comments where id = v_synthetic_comment_id) then
    raise exception 'fixture synthetic comment % must cascade on reset', v_synthetic_comment_id;
  end if;

  if exists (select 1 from public.lead_processing_audit where id = v_synthetic_audit_id) then
    raise exception 'fixture synthetic audit % must cascade on reset', v_synthetic_audit_id;
  end if;

  if not exists (select 1 from public.leads where id = v_non_synthetic_id) then
    raise exception 'non-synthetic lead % must survive reset', v_non_synthetic_id;
  end if;

  if v_jobs_fixture then
    if not exists (select 1 from public.jobs where id = v_job_id) then
      raise exception 'legacy jobs row % must survive reset', v_job_id;
    end if;
  end if;

  if not exists (select 1 from public.operator_profiles where id = v_operator_id) then
    raise exception 'operator profile % must survive reset', v_operator_id;
  end if;

  if not exists (select 1 from auth.users where id = v_operator_id) then
    raise exception 'auth user % must survive reset', v_operator_id;
  end if;

  select count(*) into v_synthetic_count
  from public.leads
  where is_synthetic = true;

  if v_synthetic_count is distinct from v_expected_seed_count then
    raise exception 'expected % synthetic leads after reset, got %', v_expected_seed_count, v_synthetic_count;
  end if;

  if exists (
    select 1
    from public.leads
    where is_synthetic = true
      and demo_reset_group_id is distinct from v_group_id
  ) then
    raise exception 'all seeded leads must share the new demo_reset_group_id %', v_group_id;
  end if;

  if not exists (
    select 1 from public.leads where is_synthetic = true and status = 'won'
  ) or not exists (
    select 1 from public.leads where is_synthetic = true and status = 'lost'
  ) or not exists (
    select 1 from public.leads where is_synthetic = true and status = 'needs_review'
  ) then
    raise exception 'seed must include won, lost, and needs_review examples';
  end if;

  if not exists (
    select 1
    from public.leads
    where is_synthetic = true
      and first_response_due_at is not null
      and status = 'new'
  ) or not exists (
    select 1
    from public.leads
    where is_synthetic = true
      and next_action_at is not null
      and status = 'in_progress'
  ) then
    raise exception 'seed must include overdue examples';
  end if;

  v_metrics := public.get_lead_metrics(
    (now() - interval '30 days'),
    (now() + interval '1 day'),
    now()
  );
  v_metrics_received := (v_metrics #>> '{funnel,received}')::bigint;

  if v_metrics_received < 1 then
    raise exception 'seed must support metrics cohort with received >= 1, got %', v_metrics_received;
  end if;

  if not exists (
    select 1
    from public.demo_rate_limit_buckets
    where bucket_key = 'phase9-verify-bucket'
  ) then
    raise exception 'rate-limit bucket fixture must survive reset';
  end if;

  raise notice 'OK: first demo reset verification block';
end $$;

rollback;

-- Repeated reset runs in a separate transaction so transaction-scoped advisory
-- locks and seed replacement assertions do not inherit state from the first block.
begin;

do $$
declare
  v_operator_id uuid := '11111111-1111-4111-8111-111111111111';
  v_non_synthetic_id uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  v_result jsonb;
  v_group_id uuid;
  v_second_group_id uuid;
  v_inserted integer;
  v_synthetic_count integer;
  v_expected_seed_count constant integer := 10;
begin
  raise notice '=== Phase 9 repeated demo reset verification (transaction will roll back) ===';

  insert into auth.users (id, email)
  values (v_operator_id, 'phase9-operator@example.com')
  on conflict (id) do nothing;

  insert into public.operator_profiles (id, display_name, is_active)
  values
    (v_operator_id, 'Phase 9 Operator', true)
  on conflict (id) do update set is_active = excluded.is_active;

  insert into public.leads (
    id, source, contact_name, contact_email, title, description,
    is_synthetic, status
  )
  values (
    v_non_synthetic_id,
    'website', 'Retained Lead', 'retained@example.com', 'Production lead', 'Must survive reset',
    false, 'new'
  );

  v_result := public.reset_demo_data(v_operator_id);
  v_group_id := (v_result ->> 'demo_reset_group_id')::uuid;

  v_result := public.reset_demo_data(v_operator_id);
  v_second_group_id := (v_result ->> 'demo_reset_group_id')::uuid;
  v_inserted := (v_result ->> 'inserted_count')::integer;

  select count(*) into v_synthetic_count
  from public.leads
  where is_synthetic = true;

  if v_inserted is distinct from v_expected_seed_count
     or v_synthetic_count is distinct from v_expected_seed_count then
    raise exception 'repeated reset must not accumulate seed rows';
  end if;

  if v_second_group_id is not distinct from v_group_id then
    raise exception 'repeated reset must issue a new demo_reset_group_id';
  end if;

  if exists (
    select 1
    from public.leads
    where is_synthetic = true
      and demo_reset_group_id is distinct from v_second_group_id
  ) then
    raise exception 'second reset must replace all synthetic rows under one group %', v_second_group_id;
  end if;

  if not exists (select 1 from public.leads where id = v_non_synthetic_id) then
    raise exception 'non-synthetic lead % must survive repeated reset', v_non_synthetic_id;
  end if;

  raise notice 'OK: demo reset verification';
end $$;

rollback;
