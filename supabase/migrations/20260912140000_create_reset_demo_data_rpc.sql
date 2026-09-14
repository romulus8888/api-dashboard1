-- ============================================================================
-- Phase 9: admin-only synthetic demo reset and seed RPC.
-- Deletes is_synthetic=true leads only; re-seeds an industry-neutral dataset.
-- ============================================================================

create or replace function public.reset_demo_data(
  p_operator_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_group_id uuid := gen_random_uuid();
  v_deleted_count integer := 0;
  v_inserted_count integer := 0;
  v_now timestamptz := pg_catalog.now();
  v_lead_id uuid;
begin
  if p_operator_id is null then
    raise exception 'reset_demo_data: p_operator_id is required';
  end if;

  perform public.validate_active_operator_assignment(p_operator_id);

  if not pg_catalog.pg_try_advisory_lock(918273645) then
    raise exception 'reset_demo_data: another reset is already in progress';
  end if;

  begin
  with deleted as (
    delete from public.leads
    where is_synthetic = true
    returning id
  )
  select count(*)::integer into v_deleted_count from deleted;

  -- 1. New EN website lead
  insert into public.leads (
    source, locale, contact_name, contact_email, title, description,
    priority, budget_amount, budget_currency, is_synthetic, demo_reset_group_id,
    status, automation_state, created_at
  )
  values (
    'website', 'en', 'Alex Rivera', 'alex.rivera@example.com',
    'API platform modernization', 'Evaluate phased migration of internal REST services.',
    'medium', 18000, 'USD', true, v_group_id,
    'new', 'idle', v_now - interval '3 days'
  )
  returning id into v_lead_id;
  v_inserted_count := v_inserted_count + 1;

  -- 2. Active EN manual lead with history
  insert into public.leads (
    source, locale, contact_name, contact_email, title, description,
    priority, budget_amount, budget_currency, is_synthetic, demo_reset_group_id,
    status, automation_state, created_at
  )
  values (
    'manual', 'en', 'Morgan Lee', 'morgan.lee@example.com',
    'Workflow automation pilot', 'Map intake steps for a small operations team.',
    'high', 9500, 'USD', true, v_group_id,
    'new', 'idle', v_now - interval '6 days'
  )
  returning id into v_lead_id;
  perform public.transition_lead_status(
    v_lead_id, 'in_progress'::public.lead_status, 'demo_reset', p_operator_id
  );
  v_inserted_count := v_inserted_count + 1;

  -- 3. Contacted EN email lead
  insert into public.leads (
    source, locale, contact_name, contact_email, title, description,
    priority, budget_amount, budget_currency, is_synthetic, demo_reset_group_id,
    status, automation_state, created_at
  )
  values (
    'email', 'en', 'Jordan Kim', 'jordan.kim@example.com',
    'Customer onboarding revamp', 'Improve self-serve onboarding completion.',
    'medium', 12000, 'USD', true, v_group_id,
    'new', 'idle', v_now - interval '8 days'
  )
  returning id into v_lead_id;
  perform public.transition_lead_status(
    v_lead_id, 'in_progress'::public.lead_status, 'demo_reset', p_operator_id
  );
  perform public.transition_lead_status(
    v_lead_id, 'contacted'::public.lead_status, 'demo_reset', p_operator_id
  );
  v_inserted_count := v_inserted_count + 1;

  -- 4. Qualified demo_seed lead
  insert into public.leads (
    source, locale, contact_name, contact_email, title, description,
    priority, budget_amount, budget_currency, is_synthetic, demo_reset_group_id,
    status, automation_state, created_at
  )
  values (
    'demo_seed', 'en', 'Casey Ng', 'casey.ng@example.com',
    'Analytics workspace', 'Unify reporting for regional managers.',
    'medium', 22000, 'USD', true, v_group_id,
    'new', 'idle', v_now - interval '10 days'
  )
  returning id into v_lead_id;
  perform public.transition_lead_status(
    v_lead_id, 'in_progress'::public.lead_status, 'demo_reset', p_operator_id
  );
  perform public.transition_lead_status(
    v_lead_id, 'contacted'::public.lead_status, 'demo_reset', p_operator_id
  );
  perform public.transition_lead_status(
    v_lead_id, 'qualified'::public.lead_status, 'demo_reset', p_operator_id
  );
  v_inserted_count := v_inserted_count + 1;

  -- 5. Won telegram lead (metrics-friendly)
  insert into public.leads (
    source, locale, contact_name, contact_email, title, description,
    priority, budget_amount, budget_currency, is_synthetic, demo_reset_group_id,
    status, automation_state, created_at
  )
  values (
    'telegram', 'en', 'Priya Sharma', 'priya.sharma@example.com',
    'Partner portal MVP', 'Launch a lightweight partner request portal.',
    'high', 15000, 'USD', true, v_group_id,
    'new', 'idle', v_now - interval '12 days'
  )
  returning id into v_lead_id;
  perform public.transition_lead_status(
    v_lead_id, 'in_progress'::public.lead_status, 'demo_reset', p_operator_id
  );
  perform public.transition_lead_status(
    v_lead_id, 'contacted'::public.lead_status, 'demo_reset', p_operator_id
  );
  perform public.transition_lead_status(
    v_lead_id, 'qualified'::public.lead_status, 'demo_reset', p_operator_id
  );
  perform public.transition_lead_status(
    v_lead_id, 'won'::public.lead_status, 'demo_reset', p_operator_id
  );
  v_inserted_count := v_inserted_count + 1;

  -- 6. Lost MAX lead (RU)
  insert into public.leads (
    source, locale, contact_name, contact_email, title, description,
    priority, budget_amount, budget_currency, is_synthetic, demo_reset_group_id,
    status, automation_state, created_at
  )
  values (
    'max', 'ru', 'Elena Orlova', 'elena.orlova@example.com',
    'Сервис уведомлений', 'Прототип уведомлений для внутренних команд.',
    'low', 7000, 'USD', true, v_group_id,
    'new', 'idle', v_now - interval '11 days'
  )
  returning id into v_lead_id;
  perform public.transition_lead_status(
    v_lead_id, 'in_progress'::public.lead_status, 'demo_reset', p_operator_id
  );
  perform public.transition_lead_status(
    v_lead_id, 'lost'::public.lead_status, 'demo_reset', p_operator_id, 'Paused until next quarter'
  );
  v_inserted_count := v_inserted_count + 1;

  -- 7. Needs review after failed automation
  insert into public.leads (
    source, locale, contact_name, contact_email, title, description,
    priority, budget_amount, budget_currency, is_synthetic, demo_reset_group_id,
    status, automation_state, automation_attempt, created_at
  )
  values (
    'website', 'en', 'Sam Doyle', 'sam.doyle@example.com',
    'Billing export checks', 'Validate export jobs after workflow changes.',
    'medium', 8000, 'USD', true, v_group_id,
    'new', 'idle', 2, v_now - interval '5 days'
  )
  returning id into v_lead_id;
  perform public.transition_lead_status(
    v_lead_id, 'in_progress'::public.lead_status, 'demo_reset', p_operator_id
  );
  perform public.transition_lead_status(
    v_lead_id, 'needs_review'::public.lead_status, 'demo_reset', p_operator_id,
    'Automation failed during intake'
  );
  update public.leads
  set automation_state = 'failed'
  where id = v_lead_id;
  v_inserted_count := v_inserted_count + 1;

  -- 8. Overdue first-response example
  insert into public.leads (
    source, locale, contact_name, contact_email, title, description,
    priority, budget_amount, budget_currency, is_synthetic, demo_reset_group_id,
    status, automation_state, first_response_due_at, created_at
  )
  values (
    'manual', 'en', 'Nina Patel', 'nina.patel@example.com',
    'Support triage board', 'Prototype a shared triage queue.',
    'high', 6000, 'USD', true, v_group_id,
    'new', 'idle', v_now - interval '1 day', v_now - interval '14 days'
  );
  v_inserted_count := v_inserted_count + 1;

  -- 9. Overdue next-action example (RU / email)
  insert into public.leads (
    source, locale, contact_name, contact_email, title, description,
    priority, budget_amount, budget_currency, is_synthetic, demo_reset_group_id,
    status, automation_state, created_at
  )
  values (
    'email', 'ru', 'Ilya Volkov', 'ilya.volkov@example.com',
    'Каталог интеграций', 'Собрать список интеграций для пилота.',
    'medium', 11000, 'USD', true, v_group_id,
    'new', 'idle', v_now - interval '15 days'
  )
  returning id into v_lead_id;
  perform public.transition_lead_status(
    v_lead_id, 'in_progress'::public.lead_status, 'demo_reset', p_operator_id
  );
  update public.leads
  set next_action_at = v_now - interval '2 days'
  where id = v_lead_id;
  v_inserted_count := v_inserted_count + 1;

  -- 10. Additional active pipeline lead (telegram / EN)
  insert into public.leads (
    source, locale, contact_name, contact_email, title, description,
    priority, budget_amount, budget_currency, is_synthetic, demo_reset_group_id,
    status, automation_state, created_at
  )
  values (
    'telegram', 'en', 'Harper Quinn', 'harper.quinn@example.com',
    'Inventory sync review', 'Assess nightly sync reliability.',
    'low', 5000, 'USD', true, v_group_id,
    'new', 'idle', v_now - interval '4 days'
  )
  returning id into v_lead_id;
  perform public.transition_lead_status(
    v_lead_id, 'in_progress'::public.lead_status, 'demo_reset', p_operator_id
  );
  v_inserted_count := v_inserted_count + 1;
  exception
    when others then
      perform pg_catalog.pg_advisory_unlock(918273645);
      raise;
  end;

  perform pg_catalog.pg_advisory_unlock(918273645);

  return jsonb_build_object(
    'demo_reset_group_id', v_group_id,
    'deleted_count', v_deleted_count,
    'inserted_count', v_inserted_count
  );
end;
$$;

comment on function public.reset_demo_data(uuid) is
  'Admin-only synthetic demo reset. Deletes is_synthetic=true leads (cascade history/comments/audit), then seeds a fixed industry-neutral dataset under one demo_reset_group_id. Requires an active operator id and serializes concurrent resets.';

revoke all on function public.reset_demo_data(uuid) from public, anon, authenticated;
grant execute on function public.reset_demo_data(uuid) to service_role;

-- Rollback (manual):
--   drop function if exists public.reset_demo_data(uuid);
