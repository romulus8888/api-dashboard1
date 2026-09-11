-- ============================================================================
-- Phase 8: lead automation RPCs — atomic claim, completion, failure, manual retry.
--
-- Versioned idempotency keys: lead.created:<lead_id>:attempt:<automation_attempt>
-- Manual retry increments automation_attempt and records a requeue audit row.
-- Stale automation_state = processing is not retried here; operators must
-- investigate stuck claims separately before requeueing.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. claim_lead_for_processing
-- ----------------------------------------------------------------------------
create or replace function public.claim_lead_for_processing(
  p_lead_id uuid,
  p_workflow_execution_id text default null
)
returns boolean
language plpgsql
security invoker
set search_path = pg_catalog, pg_temp
as $$
declare
  v_lead public.leads;
  v_claim_id uuid;
  v_idempotency_key text;
begin
  if p_lead_id is null then
    raise exception 'claim_lead_for_processing: p_lead_id is required';
  end if;

  select *
    into v_lead
  from public.leads
  where id = p_lead_id
  for update;

  if not found then
    raise exception 'claim_lead_for_processing: lead % not found', p_lead_id;
  end if;

  if v_lead.automation_state is distinct from 'idle' then
    return false;
  end if;

  v_idempotency_key := format(
    'lead.created:%s:attempt:%s',
    p_lead_id::text,
    v_lead.automation_attempt
  );

  insert into public.lead_processing_audit (
    lead_id,
    event_type,
    step,
    outcome,
    idempotency_key,
    workflow_execution_id
  )
  values (
    p_lead_id,
    'lead.created',
    'received',
    'processing',
    v_idempotency_key,
    p_workflow_execution_id
  )
  on conflict (idempotency_key, step) do nothing
  returning id into v_claim_id;

  if v_claim_id is null then
    return false;
  end if;

  update public.leads
  set automation_state = 'processing'
  where id = p_lead_id;

  return true;
end;
$$;

comment on function public.claim_lead_for_processing(uuid, text) is
  'Atomic intake gate for lead automation. Derives lead.created:<lead_id>:attempt:<automation_attempt> server-side, inserts received/processing, and sets automation_state=processing. Returns false for ineligible state or duplicate claim.';

revoke all on function public.claim_lead_for_processing(uuid, text) from public, anon, authenticated;
grant execute on function public.claim_lead_for_processing(uuid, text) to service_role;

-- ----------------------------------------------------------------------------
-- 2. complete_lead_processing
-- ----------------------------------------------------------------------------
create or replace function public.complete_lead_processing(
  p_lead_id uuid,
  p_workflow_execution_id text
)
returns boolean
language plpgsql
security invoker
set search_path = pg_catalog, pg_temp
as $$
declare
  v_lead public.leads;
  v_idempotency_key text;
  v_audit_id uuid;
begin
  if p_lead_id is null then
    raise exception 'complete_lead_processing: p_lead_id is required';
  end if;

  if p_workflow_execution_id is null or length(btrim(p_workflow_execution_id)) = 0 then
    raise exception 'complete_lead_processing: p_workflow_execution_id is required';
  end if;

  select *
    into v_lead
  from public.leads
  where id = p_lead_id
  for update;

  if not found then
    raise exception 'complete_lead_processing: lead % not found', p_lead_id;
  end if;

  v_idempotency_key := format(
    'lead.created:%s:attempt:%s',
    p_lead_id::text,
    v_lead.automation_attempt
  );

  update public.lead_processing_audit
  set outcome = 'succeeded'
  where lead_id = p_lead_id
    and step = 'received'
    and idempotency_key = v_idempotency_key
    and workflow_execution_id = p_workflow_execution_id
    and outcome = 'processing'
  returning id into v_audit_id;

  if v_audit_id is null then
    return false;
  end if;

  update public.leads
  set automation_state = 'succeeded'
  where id = p_lead_id;

  return true;
end;
$$;

comment on function public.complete_lead_processing(uuid, text) is
  'Closes the matching received/processing audit row for the current attempt and execution id, then sets automation_state=succeeded. Returns false when execution or attempt does not match.';

revoke all on function public.complete_lead_processing(uuid, text) from public, anon, authenticated;
grant execute on function public.complete_lead_processing(uuid, text) to service_role;

-- ----------------------------------------------------------------------------
-- 3. fail_lead_processing
-- ----------------------------------------------------------------------------
create or replace function public.fail_lead_processing(
  p_workflow_execution_id text,
  p_error_message text default null,
  p_details jsonb default '{}'::jsonb
)
returns integer
language plpgsql
security invoker
set search_path = pg_catalog, pg_temp
as $$
declare
  v_bounded_error text;
  v_bounded_details jsonb;
  v_affected integer := 0;
  v_claim record;
  v_lead_id uuid;
begin
  if p_workflow_execution_id is null or length(btrim(p_workflow_execution_id)) = 0 then
    raise exception 'fail_lead_processing: p_workflow_execution_id is required';
  end if;

  if p_details is null or jsonb_typeof(p_details) is distinct from 'object' then
    raise exception 'fail_lead_processing: p_details must be a JSON object';
  end if;

  v_bounded_error := left(
    regexp_replace(btrim(coalesce(p_error_message, '')), '\s+', ' ', 'g'),
    300
  );

  v_bounded_details := jsonb_strip_nulls(
    jsonb_build_object(
      'source', left(coalesce(p_details ->> 'source', ''), 64),
      'failed_node', left(coalesce(p_details ->> 'failed_node', ''), 128)
    )
  );

  for v_claim in
    select lpa.id as audit_id, lpa.lead_id
    from public.lead_processing_audit lpa
    where lpa.workflow_execution_id = p_workflow_execution_id
      and lpa.step = 'received'
      and lpa.outcome = 'processing'
    order by lpa.created_at
    for update of lpa
  loop
    select l.id
      into v_lead_id
    from public.leads l
    where l.id = v_claim.lead_id
    for update;

    if not found then
      raise exception 'fail_lead_processing: lead % disappeared', v_claim.lead_id;
    end if;

    update public.lead_processing_audit
    set
      outcome = 'failed',
      error_message = nullif(v_bounded_error, ''),
      details = coalesce(v_bounded_details, '{}'::jsonb)
    where id = v_claim.audit_id;

    update public.leads
    set automation_state = 'failed'
    where id = v_claim.lead_id;

    perform public.transition_lead_status(
      v_claim.lead_id,
      'needs_review'::public.lead_status,
      'automation',
      null,
      nullif(v_bounded_error, '')
    );

    v_affected := v_affected + 1;
  end loop;

  return v_affected;
end;
$$;

comment on function public.fail_lead_processing(text, text, jsonb) is
  'Marks every open received/processing claim for an execution as failed, sets each lead automation_state=failed, and transitions each lead to needs_review. Returns the affected claim count; zero is normal for pre-claim or fully completed executions. Completed claims are untouched.';

revoke all on function public.fail_lead_processing(text, text, jsonb) from public, anon, authenticated;
grant execute on function public.fail_lead_processing(text, text, jsonb) to service_role;

-- ----------------------------------------------------------------------------
-- 4. retry_lead_automation
-- ----------------------------------------------------------------------------
create or replace function public.retry_lead_automation(
  p_lead_id uuid,
  p_changed_by uuid default null
)
returns public.leads
language plpgsql
security invoker
set search_path = pg_catalog, pg_temp
as $$
declare
  v_lead public.leads;
  v_previous_attempt integer;
  v_new_attempt integer;
  v_requeue_key text;
begin
  if p_lead_id is null then
    raise exception 'retry_lead_automation: p_lead_id is required';
  end if;

  perform public.validate_lead_status_actor(p_changed_by);

  select *
    into v_lead
  from public.leads
  where id = p_lead_id
  for update;

  if not found then
    raise exception 'retry_lead_automation: lead % not found', p_lead_id;
  end if;

  if v_lead.automation_state = 'processing' then
    raise exception
      'retry_lead_automation: lead % has stale automation_state=processing; investigate the open claim before retrying',
      p_lead_id;
  end if;

  if v_lead.automation_state is distinct from 'failed' then
    raise exception
      'retry_lead_automation: lead % is not in failed automation_state',
      p_lead_id;
  end if;

  v_previous_attempt := v_lead.automation_attempt;
  v_new_attempt := v_previous_attempt + 1;
  v_requeue_key := format('lead.requeued:%s:attempt:%s', p_lead_id::text, v_new_attempt);

  update public.leads
  set
    automation_attempt = v_new_attempt,
    automation_state = 'idle'
  where id = p_lead_id
  returning * into v_lead;

  insert into public.lead_processing_audit (
    lead_id,
    event_type,
    step,
    outcome,
    idempotency_key,
    details
  )
  values (
    p_lead_id,
    'automation.requeued',
    'requeue',
    'succeeded',
    v_requeue_key,
    jsonb_strip_nulls(
      jsonb_build_object(
        'previous_attempt', v_previous_attempt,
        'new_attempt', v_new_attempt,
        'requeued_by', p_changed_by::text
      )
    )
  );

  return v_lead;
end;
$$;

comment on function public.retry_lead_automation(uuid, uuid) is
  'Manual recovery for failed automation only. Increments automation_attempt once, sets automation_state=idle, and appends a requeue audit row while preserving lead status (typically needs_review). Does not delete or rewrite failed audit rows. Stale processing claims must be resolved separately.';

revoke all on function public.retry_lead_automation(uuid, uuid) from public, anon, authenticated;
grant execute on function public.retry_lead_automation(uuid, uuid) to service_role;

-- ----------------------------------------------------------------------------
-- Rollback (manual)
--   drop function if exists public.retry_lead_automation(uuid, uuid);
--   drop function if exists public.fail_lead_processing(text, text, jsonb);
--   drop function if exists public.complete_lead_processing(uuid, text);
--   drop function if exists public.claim_lead_for_processing(uuid, text);
-- ----------------------------------------------------------------------------
