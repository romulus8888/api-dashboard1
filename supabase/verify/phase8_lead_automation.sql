-- Phase 8 verification: lead automation RPCs (rollback-safe).
-- Prerequisites: phase 1 lead schema + 20260911200000_create_lead_automation_rpcs.sql

begin;

do $$
declare
  v_lead_id uuid;
  v_lead_b uuid;
  v_lead_c uuid;
  v_exec_1 text := 'exec-phase8-0001';
  v_exec_2 text := 'exec-phase8-0002';
  v_exec_multi text := 'exec-phase8-multi';
  v_operator_id uuid := '11111111-1111-4111-8111-111111111111';
  v_claimed boolean;
  v_completed boolean;
  v_failed integer;
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

  if v_failed is distinct from 1 then
    raise exception 'expected post-claim failure count=1, got %', v_failed;
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

  if v_failed is distinct from 0 then
    raise exception 'expected failure-before-claim count=0, got %', v_failed;
  end if;

  raise notice 'OK: failure before claim is a no-op';

  -- --------------------------------------------------------------------------
  -- Multi-lead execution failure leaves completed claims untouched
  -- --------------------------------------------------------------------------
  insert into public.leads (
    source, contact_name, contact_email, title, description,
    is_synthetic, status, automation_state, automation_attempt
  )
  values (
    'demo_seed', 'Multi A', 'multi-a@example.demo', 'Multi A', 'Fixture',
    true, 'new', 'idle', 1
  )
  returning id into v_lead_id;

  insert into public.leads (
    source, contact_name, contact_email, title, description,
    is_synthetic, status, automation_state, automation_attempt
  )
  values (
    'demo_seed', 'Multi B', 'multi-b@example.demo', 'Multi B', 'Fixture',
    true, 'new', 'idle', 1
  )
  returning id into v_lead_b;

  insert into public.leads (
    source, contact_name, contact_email, title, description,
    is_synthetic, status, automation_state, automation_attempt
  )
  values (
    'demo_seed', 'Multi C', 'multi-c@example.demo', 'Multi C', 'Fixture',
    true, 'new', 'idle', 1
  )
  returning id into v_lead_c;

  if public.claim_lead_for_processing(v_lead_id, v_exec_multi) is distinct from true then
    raise exception 'expected multi claim A';
  end if;

  if public.claim_lead_for_processing(v_lead_b, v_exec_multi) is distinct from true then
    raise exception 'expected multi claim B';
  end if;

  if public.claim_lead_for_processing(v_lead_c, v_exec_multi) is distinct from true then
    raise exception 'expected multi claim C';
  end if;

  if public.complete_lead_processing(v_lead_c, v_exec_multi) is distinct from true then
    raise exception 'expected completed claim C before multi failure';
  end if;

  v_failed := public.fail_lead_processing(
    v_exec_multi,
    'multi-lead execution failure',
    '{"source":"error_handler","failed_node":"Supabase — transition lead status"}'::jsonb
  );

  if v_failed is distinct from 2 then
    raise exception 'expected multi failure count=2, got %', v_failed;
  end if;

  if exists (
    select 1
    from public.lead_processing_audit
    where lead_id = v_lead_c
      and step = 'received'
      and workflow_execution_id = v_exec_multi
      and outcome is distinct from 'succeeded'
  ) then
    raise exception 'completed claim must remain succeeded';
  end if;

  select automation_state, status into v_lead from public.leads where id = v_lead_c;
  if v_lead.automation_state is distinct from 'succeeded'
     or v_lead.status is distinct from 'new'::public.lead_status then
    raise exception 'completed lead must remain untouched by multi failure';
  end if;

  select count(*) into v_failed_count
  from public.leads
  where id in (v_lead_id, v_lead_b)
    and automation_state = 'failed'
    and status = 'needs_review';

  if v_failed_count <> 2 then
    raise exception 'expected two failed needs_review leads, got %', v_failed_count;
  end if;

  raise notice 'OK: multi-lead execution failure';

  -- --------------------------------------------------------------------------
  -- Manual retry increments once, preserves failed rows and needs_review status
  -- --------------------------------------------------------------------------
  v_lead := public.retry_lead_automation(v_lead_id, v_operator_id);

  if v_lead.automation_attempt is distinct from 2 then
    raise exception 'expected automation_attempt=2 after retry, got %', v_lead.automation_attempt;
  end if;

  if v_lead.automation_state is distinct from 'idle' then
    raise exception 'expected automation_state=idle after retry';
  end if;

  if v_lead.status is distinct from 'needs_review'::public.lead_status then
    raise exception 'expected needs_review status preserved after retry';
  end if;

  if public.claim_lead_for_processing(v_lead_id, v_exec_2) is distinct from true then
    raise exception 'expected needs_review+idle lead to be claimable after retry';
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

  -- Failed needs_review leads must not be claimable until retry sets idle.
  update public.leads
  set automation_state = 'failed'
  where id = v_lead_b;

  if public.claim_lead_for_processing(v_lead_b, v_exec_2) is distinct from false then
    raise exception 'expected failed needs_review lead to remain unclaimable before retry';
  end if;

  raise notice 'OK: retry preserves needs_review and polling eligibility rules';

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

  if v_audit_count < 4 then
    raise exception 'expected preserved audit history across retries, got % rows', v_audit_count;
  end if;

  raise notice 'OK: illegal retry guards and preserved audit history';
end $$;

rollback;
