-- Phase 8 verification: lead automation RPCs (rollback-safe).
-- Prerequisites: phase 1 lead schema + 20260911200000_create_lead_automation_rpcs.sql

begin;

do $$
declare
  v_lead_id uuid;
  v_exec_1 text := 'exec-phase8-0001';
  v_exec_2 text := 'exec-phase8-0002';
  v_operator_id uuid := '11111111-1111-4111-8111-111111111111';
  v_claimed boolean;
  v_completed boolean;
  v_failed boolean;
  v_lead public.leads;
  v_audit_count integer;
  v_failed_count integer;
begin
  raise notice '=== Phase 8 lead automation verification (transaction will roll back) ===';

  insert into auth.users (id, email)
  values (v_operator_id, 'phase8-operator@example.demo')
  on conflict (id) do nothing;

  insert into public.operator_profiles (id, display_name, is_active)
  values (v_operator_id, 'Phase 8 Operator', true)
  on conflict (id) do update set is_active = true;

  insert into public.leads (
    source, contact_name, contact_email, title, description,
    is_synthetic, status, automation_state, automation_attempt
  )
  values (
    'demo_seed', 'Phase 8 Lead', 'phase8@example.demo', 'Automation test', 'Fixture lead',
    true, 'new', 'idle', 1
  )
  returning id into v_lead_id;

  -- --------------------------------------------------------------------------
  -- Privileges
  -- --------------------------------------------------------------------------
  if has_function_privilege('anon', 'public.claim_lead_for_processing(uuid, text)', 'EXECUTE') then
    raise exception 'anon must not execute claim_lead_for_processing';
  end if;

  if not has_function_privilege('service_role', 'public.retry_lead_automation(uuid, uuid)', 'EXECUTE') then
    raise exception 'service_role must execute retry_lead_automation';
  end if;

  raise notice 'OK: function privileges';

  -- --------------------------------------------------------------------------
  -- First claim + duplicate claim
  -- --------------------------------------------------------------------------
  v_claimed := public.claim_lead_for_processing(v_lead_id, v_exec_1);
  if v_claimed is distinct from true then
    raise exception 'expected first claim true, got %', v_claimed;
  end if;

  select automation_state into v_lead from public.leads where id = v_lead_id;
  if v_lead.automation_state is distinct from 'processing' then
    raise exception 'expected automation_state=processing after claim';
  end if;

  if not exists (
    select 1
    from public.lead_processing_audit
    where lead_id = v_lead_id
      and step = 'received'
      and outcome = 'processing'
      and idempotency_key = format('lead.created:%s:attempt:1', v_lead_id::text)
      and workflow_execution_id = v_exec_1
  ) then
    raise exception 'expected received/processing audit row for attempt 1';
  end if;

  v_claimed := public.claim_lead_for_processing(v_lead_id, v_exec_2);
  if v_claimed is distinct from false then
    raise exception 'expected duplicate claim false, got %', v_claimed;
  end if;

  raise notice 'OK: first claim and duplicate suppression';

  -- --------------------------------------------------------------------------
  -- Completion
  -- --------------------------------------------------------------------------
  v_completed := public.complete_lead_processing(v_lead_id, v_exec_2);
  if v_completed is distinct from false then
    raise exception 'expected mismatched execution completion false, got %', v_completed;
  end if;

  v_completed := public.complete_lead_processing(v_lead_id, v_exec_1);
  if v_completed is distinct from true then
    raise exception 'expected completion true, got %', v_completed;
  end if;

  select automation_state into v_lead from public.leads where id = v_lead_id;
  if v_lead.automation_state is distinct from 'succeeded' then
    raise exception 'expected automation_state=succeeded after completion';
  end if;

  raise notice 'OK: completion closes claim and succeeds automation';

  -- --------------------------------------------------------------------------
  -- Post-claim failure on a fresh lead
  -- --------------------------------------------------------------------------
  insert into public.leads (
    source, contact_name, contact_email, title, description,
    is_synthetic, status, automation_state, automation_attempt
  )
  values (
    'manual', 'Fail Lead', 'fail@example.demo', 'Failure test', 'Fixture',
    true, 'new', 'idle', 1
  )
  returning id into v_lead_id;

  if public.claim_lead_for_processing(v_lead_id, v_exec_1) is distinct from true then
    raise exception 'expected claim before failure';
  end if;

  perform public.transition_lead_status(v_lead_id, 'in_progress'::public.lead_status, 'automation');

  v_failed := public.fail_lead_processing(
    v_exec_1,
    'n8n intake failed at node Supabase — transition lead status: timeout',
    '{"source":"error_handler","failed_node":"Supabase — transition lead status"}'::jsonb
  );

  if v_failed is distinct from true then
    raise exception 'expected post-claim failure true, got %', v_failed;
  end if;

  select automation_state, status into v_lead from public.leads where id = v_lead_id;
  if v_lead.automation_state is distinct from 'failed' then
    raise exception 'expected automation_state=failed after failure';
  end if;

  if v_lead.status is distinct from 'needs_review'::public.lead_status then
    raise exception 'expected lead status needs_review after failure';
  end if;

  if not exists (
    select 1
    from public.lead_status_history
    where lead_id = v_lead_id
      and to_status = 'needs_review'
      and change_source = 'automation'
  ) then
    raise exception 'expected needs_review status history from automation';
  end if;

  if not exists (
    select 1
    from public.lead_processing_audit
    where lead_id = v_lead_id
      and step = 'received'
      and outcome = 'failed'
      and workflow_execution_id = v_exec_1
  ) then
    raise exception 'expected failed received audit row preserved';
  end if;

  select count(*) into v_failed_count
  from public.lead_processing_audit
  where lead_id = v_lead_id
    and step = 'received'
    and outcome = 'failed';

  if v_failed_count <> 1 then
    raise exception 'expected exactly one failed received row, got %', v_failed_count;
  end if;

  raise notice 'OK: post-claim failure and needs_review history';

  -- --------------------------------------------------------------------------
  -- Failure before claim must not corrupt lead
  -- --------------------------------------------------------------------------
  v_failed := public.fail_lead_processing(
    'exec-never-claimed',
    'orphan execution',
    '{}'::jsonb
  );

  if v_failed is distinct from false then
    raise exception 'expected failure-before-claim false, got %', v_failed;
  end if;

  raise notice 'OK: failure before claim is a no-op';

  -- --------------------------------------------------------------------------
  -- Manual retry increments once and preserves failed rows
  -- --------------------------------------------------------------------------
  v_lead := public.retry_lead_automation(v_lead_id, v_operator_id);

  if v_lead.automation_attempt is distinct from 2 then
    raise exception 'expected automation_attempt=2 after retry, got %', v_lead.automation_attempt;
  end if;

  if v_lead.automation_state is distinct from 'idle' then
    raise exception 'expected automation_state=idle after retry';
  end if;

  if not exists (
    select 1
    from public.lead_processing_audit
    where lead_id = v_lead_id
      and step = 'requeue'
      and outcome = 'succeeded'
      and idempotency_key = format('lead.requeued:%s:attempt:2', v_lead_id::text)
  ) then
    raise exception 'expected requeue audit row for attempt 2';
  end if;

  select count(*) into v_failed_count
  from public.lead_processing_audit
  where lead_id = v_lead_id
    and step = 'received'
    and outcome = 'failed';

  if v_failed_count <> 1 then
    raise exception 'failed received rows must remain after retry, got %', v_failed_count;
  end if;

  -- --------------------------------------------------------------------------
  -- Second claim uses new attempt key
  -- --------------------------------------------------------------------------
  v_claimed := public.claim_lead_for_processing(v_lead_id, v_exec_2);
  if v_claimed is distinct from true then
    raise exception 'expected second-attempt claim true, got %', v_claimed;
  end if;

  if not exists (
    select 1
    from public.lead_processing_audit
    where lead_id = v_lead_id
      and step = 'received'
      and outcome = 'processing'
      and idempotency_key = format('lead.created:%s:attempt:2', v_lead_id::text)
  ) then
    raise exception 'expected received row for attempt 2 key';
  end if;

  raise notice 'OK: retry increments once and second claim uses new key';

  -- --------------------------------------------------------------------------
  -- Illegal / concurrent retry behavior
  -- --------------------------------------------------------------------------
  begin
    perform public.retry_lead_automation(v_lead_id, v_operator_id);
    raise exception 'expected retry while processing to fail';
  exception
    when others then
      if position('stale automation_state=processing' in sqlerrm) = 0 then
        raise;
      end if;
  end;

  update public.leads
  set automation_state = 'failed'
  where id = v_lead_id;

  v_lead := public.retry_lead_automation(v_lead_id, v_operator_id);

  begin
    perform public.retry_lead_automation(v_lead_id, v_operator_id);
    raise exception 'expected second immediate retry to fail while idle';
  exception
    when others then
      if position('not in failed automation_state' in sqlerrm) = 0 then
        raise;
      end if;
  end;

  if v_lead.automation_attempt is distinct from 3 then
    raise exception 'expected only one retry increment to attempt 3, got %', v_lead.automation_attempt;
  end if;

  select count(*) into v_audit_count
  from public.lead_processing_audit
  where lead_id = v_lead_id;

  if v_audit_count < 3 then
    raise exception 'expected preserved audit history across retries, got % rows', v_audit_count;
  end if;

  raise notice 'OK: illegal retry guards and preserved audit history';
end $$;

rollback;
