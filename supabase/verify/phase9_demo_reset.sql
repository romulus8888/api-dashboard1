-- Phase 9 verification: reset_demo_data RPC (rollback-safe).
-- Prerequisites: phase 1 lead schema + 20260912140000_create_reset_demo_data_rpc.sql

begin;

do $$
declare
  v_operator_id uuid := '11111111-1111-4111-8111-111111111111';
  v_inactive_operator_id uuid := '22222222-2222-4222-8222-222222222222';
  v_non_synthetic_id uuid;
  v_result jsonb;
  v_group_id uuid;
  v_deleted integer;
  v_inserted integer;
  v_synthetic_count integer;
  v_history_count integer;
  v_metrics jsonb;
  v_metrics_received bigint;
  v_operator_count integer;
  v_bucket_count integer;
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

  insert into public.leads (
    source, contact_name, contact_email, title, description,
    is_synthetic, status
  )
  values (
    'website', 'Retained Lead', 'retained@example.com', 'Production lead', 'Must survive reset',
    false, 'new'
  )
  returning id into v_non_synthetic_id;

  insert into public.leads (
    source, contact_name, contact_email, title, description,
    is_synthetic, status, demo_reset_group_id
  )
  values (
    'demo_seed', 'Old Synthetic', 'old-synthetic@example.com', 'Old demo', 'Should be removed',
    true, 'new', '33333333-3333-4333-8333-333333333333'
  );

  insert into public.lead_comments (lead_id, author_id, body)
  select l.id, v_operator_id, 'Synthetic comment to cascade'
  from public.leads l
  where l.is_synthetic = true
  limit 1;

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

  if not exists (select 1 from public.leads where id = v_non_synthetic_id) then
    raise exception 'non-synthetic lead must survive reset';
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
    raise exception 'all seeded leads must share the new demo_reset_group_id';
  end if;

  if exists (select 1 from public.lead_comments) then
    raise exception 'synthetic comments must cascade on reset';
  end if;

  select count(*) into v_history_count
  from public.lead_status_history;

  if v_history_count < 8 then
    raise exception 'expected meaningful status history, got % rows', v_history_count;
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

  select count(*) into v_operator_count from public.operator_profiles;
  if v_operator_count < 2 then
    raise exception 'operators must survive reset';
  end if;

  select count(*) into v_operator_count from auth.users;
  if v_operator_count < 2 then
    raise exception 'auth users must survive reset';
  end if;

  select count(*) into v_bucket_count from public.demo_rate_limit_buckets;
  if v_bucket_count < 1 then
    raise exception 'rate-limit buckets must survive reset';
  end if;

  v_result := public.reset_demo_data(v_operator_id);
  v_inserted := (v_result ->> 'inserted_count')::integer;

  select count(*) into v_synthetic_count
  from public.leads
  where is_synthetic = true;

  if v_inserted is distinct from v_expected_seed_count
     or v_synthetic_count is distinct from v_expected_seed_count then
    raise exception 'repeated reset must not accumulate seed rows';
  end if;

  raise notice 'OK: demo reset verification';
end $$;

rollback;
